-- RADAS V4 only. Requires the accepted Phase 03 credit engine. Run once.
begin;
do $$ begin
  if to_regclass('radas_v4.credit_wallets') is null or to_regprocedure('radas_v4.credit_apply(uuid,text,text)') is null then
    raise exception 'phase03_required';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='radas_v4_generation_operation') then
    raise exception 'generation_rpc_name_conflict';
  end if;
end $$;
create table radas_v4.generations (
  id uuid primary key,
  user_id uuid not null references radas_v4.credit_wallets(user_id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  mode text not null check (mode in ('text','image')),
  prompt text not null check (length(prompt) between 1 and 2000 and prompt=btrim(prompt)),
  orientation text not null check (orientation in ('portrait','landscape')),
  resolution integer not null check (resolution in (720,1080)),
  status text not null default 'submitting' check (status in ('submitting','unknown','queued','processing','done','failed','rejected')),
  provider_job_id text unique check (provider_job_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  refunded boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '12 hours',
  last_polled_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check (expires_at > created_at),
  check (status not in ('queued','processing','done','failed') or provider_job_id is not null),
  check (not refunded or status in ('failed','rejected'))
);
create index generations_user_created on radas_v4.generations(user_id, created_at desc);
create unique index generations_one_active on radas_v4.generations(user_id) where status in ('submitting','unknown','queued','processing');
alter table radas_v4.generations enable row level security;
create policy own_generation on radas_v4.generations for select to authenticated using (user_id=(select auth.uid()));
revoke all on radas_v4.generations from public, anon, authenticated, service_role;

create function radas_v4.generation_operation(p_action text, p_user_id uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g radas_v4.generations%rowtype; v_credit jsonb; v_created boolean := false; v_poll boolean := false;
  v_status text; v_provider text; v_now timestamptz;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  if p_user_id is null or p_id is null or p_action is null or p_action not in ('reserve','read','poll','transition') or p_data is null or jsonb_typeof(p_data)<>'object' then
    raise exception 'invalid_generation_request' using errcode='22023';
  end if;
  -- Wallet lock first everywhere, including the existing credit function: avoids inverted lock order.
  if p_action='reserve' then
    insert into radas_v4.credit_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
  end if;
  perform 1 from radas_v4.credit_wallets where user_id=p_user_id for update;
  select * into g from radas_v4.generations where id=p_id and user_id=p_user_id for update;
  if p_action='reserve' then
    if (p_data->>'hash') is null or (p_data->>'hash') !~ '^[a-f0-9]{64}$' or
      coalesce(p_data->>'mode','') not in ('text','image') or coalesce(p_data->>'orientation','') not in ('portrait','landscape') or
      coalesce(p_data->>'resolution','') not in ('720','1080') or coalesce(length(p_data->>'prompt'),0) not between 1 and 2000 or
      (p_data->>'prompt')<>btrim(p_data->>'prompt') then raise exception 'invalid_generation_request' using errcode='22023'; end if;
    if g.id is not null then
      if g.request_hash <> p_data->>'hash' then return jsonb_build_object('error','request_conflict'); end if;
    else
      if exists(select 1 from radas_v4.generations where id=p_id) then return jsonb_build_object('error','request_conflict'); end if;
      if exists(select 1 from radas_v4.generations where user_id=p_user_id and status in ('submitting','unknown','queued','processing')) then
        return jsonb_build_object('error','active_generation');
      end if;
      -- Reservation, debit ledger and generation record commit or roll back together.
      v_credit := radas_v4.credit_apply(p_user_id,'debit',p_id::text);
      if v_credit->>'status'='insufficient_credits' then return jsonb_build_object('error','insufficient_credits'); end if;
      if v_credit->>'status'<>'applied' then raise exception 'generation_debit_conflict'; end if;
      v_now := clock_timestamp();
      insert into radas_v4.generations(id,user_id,request_hash,mode,prompt,orientation,resolution,created_at,expires_at)
        values(p_id,p_user_id,p_data->>'hash',p_data->>'mode',p_data->>'prompt',p_data->>'orientation',(p_data->>'resolution')::integer,v_now,v_now+interval '12 hours') returning * into g;
      v_created := true;
    end if;
  elsif g.id is null then return jsonb_build_object('error','not_found');
  end if;
  if p_action='transition' then
    v_status := p_data->>'status'; v_provider := p_data->>'providerJobId';
    if v_status is null or v_status not in ('unknown','queued','processing','done','failed','rejected') then raise exception 'invalid_generation_transition'; end if;
    if g.status not in ('done','failed','rejected') then
      if g.provider_job_id is null then
        if g.status not in ('submitting','unknown') or v_status not in ('unknown','queued','rejected') then raise exception 'invalid_generation_transition'; end if;
        if v_status='queued' and (v_provider is null or v_provider !~ '^[A-Za-z0-9_-]{1,128}$') then raise exception 'invalid_provider_job'; end if;
        if g.status='unknown' and v_status='rejected' then raise exception 'unknown_cannot_be_refunded'; end if;
      else
        if v_provider is distinct from g.provider_job_id or v_status not in ('queued','processing','done','failed') then raise exception 'invalid_generation_transition'; end if;
        if g.status='processing' and v_status='queued' then v_status := 'processing'; end if;
      end if;
      if v_status in ('failed','rejected') then
        v_credit := radas_v4.credit_apply(p_user_id,'refund',p_id::text);
        if v_credit->>'status' not in ('applied','already_applied') then raise exception 'generation_refund_failed'; end if;
      end if;
      update radas_v4.generations set status=v_status, provider_job_id=coalesce(provider_job_id,v_provider),
        refunded=(v_status in ('failed','rejected')), updated_at=clock_timestamp() where id=p_id returning * into g;
    end if;
  else
    if g.expires_at <= clock_timestamp() then return jsonb_build_object('error','expired'); end if;
    -- A crashed submission is unresolved, not automatically failed or safe to retry.
    if g.status='submitting' and g.created_at < clock_timestamp()-interval '2 minutes' then
      update radas_v4.generations set status='unknown', updated_at=clock_timestamp() where id=p_id returning * into g;
    end if;
    if p_action='poll' and g.status in ('queued','processing') and
      (g.last_polled_at is null or g.last_polled_at < clock_timestamp()-interval '3 seconds') then
      update radas_v4.generations set last_polled_at=clock_timestamp() where id=p_id returning * into g; v_poll := true;
    end if;
  end if;
  return jsonb_build_object('id',g.id,'status',g.status,'expiresAt',g.expires_at,'refunded',g.refunded,
    'providerJobId',g.provider_job_id,'pollAllowed',v_poll,'created',v_created);
end;
$$;
revoke all on function radas_v4.generation_operation(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function radas_v4.generation_operation(text,uuid,uuid,jsonb) to service_role;
create function public.radas_v4_generation_operation(p_action text,p_user_id uuid,p_id uuid,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select radas_v4.generation_operation(p_action,p_user_id,p_id,p_data); $$;
revoke all on function public.radas_v4_generation_operation(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.radas_v4_generation_operation(text,uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
