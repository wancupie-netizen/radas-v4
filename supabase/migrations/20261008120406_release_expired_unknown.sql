-- Release the active slot of expired unknown submissions without deleting/refunding/resubmitting.
-- Re-runnable. Run after the Ingredients mode migration.
begin;
alter table radas_v4.generations add column if not exists unknown_released_at timestamptz;
alter table radas_v4.generations drop constraint if exists generations_unknown_release_check;
alter table radas_v4.generations add constraint generations_unknown_release_check
  check (unknown_released_at is null or
    (status='unknown' and provider_job_id is null and not refunded and unknown_released_at>=expires_at));
-- Resolve existing expired blockers, including the old account record; preserve every ledger entry.
update radas_v4.generations set unknown_released_at=clock_timestamp()
  where status='unknown' and provider_job_id is null and expires_at<=clock_timestamp()
    and unknown_released_at is null;
drop index radas_v4.generations_one_active;
create unique index generations_one_active on radas_v4.generations(user_id)
  where status in ('reserved','submitting','unknown','queued','processing') and unknown_released_at is null;
create or replace function radas_v4.generation_operation(p_action text, p_user_id uuid, p_id uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g radas_v4.generations%rowtype; v_credit jsonb; v_created boolean := false; v_poll boolean := false; v_claim boolean := false; v_token uuid; v_stale uuid; v_active uuid;
  v_status text; v_provider text; v_now timestamptz;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  if p_user_id is null or p_id is null or p_action is null or p_action not in ('reserve','read','poll','transition','claim','cancel','reconcile') or p_data is null or jsonb_typeof(p_data)<>'object' then
    raise exception 'invalid_generation_request' using errcode='22023';
  end if;
  -- Wallet lock first everywhere, including the existing credit function: avoids inverted lock order.
  if p_action='reserve' then
    insert into radas_v4.credit_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
  end if;
  perform 1 from radas_v4.credit_wallets where user_id=p_user_id for update;
  -- Expired ambiguous requests remain unknown and charged; only their active slot is released.
  -- Never retry their provider POST or invent a terminal/refunded outcome.
  update radas_v4.generations set status='unknown',updated_at=clock_timestamp()
    where user_id=p_user_id and status='submitting' and provider_job_id is null
      and expires_at<=clock_timestamp() and updated_at<clock_timestamp()-interval '2 minutes';
  update radas_v4.generations set unknown_released_at=clock_timestamp()
    where user_id=p_user_id and status='unknown' and provider_job_id is null
      and expires_at<=clock_timestamp() and unknown_released_at is null;
  -- A reserved row proves no process had permission to submit. Release abandoned reservations atomically.
  for v_stale in select id from radas_v4.generations where user_id=p_user_id and status='reserved'
    and created_at < clock_timestamp()-interval '2 minutes' for update loop
    update radas_v4.generations set status='rejected',refunded=true,updated_at=clock_timestamp() where id=v_stale;
    v_credit := radas_v4.credit_apply(p_user_id,'refund',v_stale::text);
    if v_credit->>'status' not in ('applied','already_applied') then raise exception 'generation_refund_failed'; end if;
  end loop;
  select * into g from radas_v4.generations where id=p_id and user_id=p_user_id for update;
  if p_action='reserve' then
    if (p_data->>'hash') is null or (p_data->>'hash') !~ '^[a-f0-9]{64}$' or
      coalesce(p_data->>'mode','') not in ('text','image','ingredients') or coalesce(p_data->>'orientation','') not in ('portrait','landscape') or
      coalesce(p_data->>'resolution','') not in ('720','1080') or coalesce(length(p_data->>'prompt'),0) not between 1 and 2000 or
      (p_data->>'prompt')<>btrim(p_data->>'prompt') then raise exception 'invalid_generation_request' using errcode='22023'; end if;
    if g.id is not null then
      if g.request_hash <> p_data->>'hash' then return jsonb_build_object('error','request_conflict'); end if;
    else
      if exists(select 1 from radas_v4.generations where id=p_id) then return jsonb_build_object('error','request_conflict'); end if;
      if exists(select 1 from radas_v4.generations where user_id=p_user_id and status in ('reserved','submitting','unknown','queued','processing') and unknown_released_at is null) then
        select id into v_active from radas_v4.generations where user_id=p_user_id and status in ('reserved','submitting','unknown','queued','processing') and unknown_released_at is null;
        return jsonb_build_object('error','active_generation','activeId',v_active);
      end if;
      -- Reservation, debit ledger and generation record commit or roll back together.
      v_credit := radas_v4.credit_apply(p_user_id,'debit',p_id::text);
      if v_credit->>'status'='insufficient_credits' then return jsonb_build_object('error','insufficient_credits'); end if;
      if v_credit->>'status'<>'applied' then raise exception 'generation_debit_conflict'; end if;
      v_now := clock_timestamp();
      insert into radas_v4.generations(id,user_id,request_hash,mode,prompt,orientation,resolution,status,created_at,expires_at)
        values(p_id,p_user_id,p_data->>'hash',p_data->>'mode',p_data->>'prompt',p_data->>'orientation',(p_data->>'resolution')::integer,'reserved',v_now,v_now+interval '12 hours') returning * into g;
      v_created := true;
    end if;
  elsif g.id is null then return jsonb_build_object('error','not_found');
  end if;
  if g.unknown_released_at is not null and p_action in ('claim','transition','cancel') then
    raise exception 'expired_unknown_read_only';
  end if;
  if p_action='cancel' then
    if g.status='reserved' then
      update radas_v4.generations set status='rejected',refunded=true,updated_at=clock_timestamp() where id=p_id returning * into g;
      v_credit := radas_v4.credit_apply(p_user_id,'refund',p_id::text);
      if v_credit->>'status' not in ('applied','already_applied') then raise exception 'generation_refund_failed'; end if;
    end if;
  elsif p_action='claim' then
    if coalesce(p_data->>'claimToken','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_claim'; end if;
    v_token := (p_data->>'claimToken')::uuid;
    if g.expires_at <= clock_timestamp() then return jsonb_build_object('error','expired'); end if;
    if g.status='reserved' then
      update radas_v4.generations set status='submitting',claim_token=v_token,updated_at=clock_timestamp() where id=p_id returning * into g;
      v_claim := true;
    elsif g.status='submitting' and g.claim_token=v_token then
      -- Recover a lost claim response with the same private token, strictly BEFORE provider POST.
      v_claim := true;
    end if;
  elsif p_action='transition' then
    v_status := p_data->>'status'; v_provider := p_data->>'providerJobId';
    if v_status is null or v_status not in ('unknown','queued','processing','done','failed','rejected') then raise exception 'invalid_generation_transition'; end if;
    if g.status not in ('done','failed','rejected') then
      if g.provider_job_id is null then
        if g.claim_token is not null and g.claim_token::text is distinct from p_data->>'claimToken' then raise exception 'claim_owner_required'; end if;
        if g.status not in ('submitting','unknown') or v_status not in ('unknown','queued','rejected') then raise exception 'invalid_generation_transition'; end if;
        if v_status='queued' and (v_provider is null or v_provider !~ '^[A-Za-z0-9_-]{1,128}$') then raise exception 'invalid_provider_job'; end if;
        if g.status='unknown' and v_status='rejected' then raise exception 'unknown_cannot_be_refunded'; end if;
      else
        if v_provider is distinct from g.provider_job_id or v_status not in ('queued','processing','done','failed') then raise exception 'invalid_generation_transition'; end if;
        if g.status='processing' and v_status='queued' then v_status := 'processing'; end if;
      end if;
      -- State authorizes the credit function's refund guard. Any refund/write failure rolls this back too.
      update radas_v4.generations set status=v_status, provider_job_id=coalesce(provider_job_id,v_provider),
        refunded=(v_status in ('failed','rejected')), updated_at=clock_timestamp() where id=p_id returning * into g;
      if v_status in ('failed','rejected') then
        v_credit := radas_v4.credit_apply(p_user_id,'refund',p_id::text);
        if v_credit->>'status' not in ('applied','already_applied') then raise exception 'generation_refund_failed'; end if;
      end if;
    end if;
  else
    if g.expires_at <= clock_timestamp() and p_action<>'reconcile' then return jsonb_build_object('error','expired'); end if;
    -- A crashed submission is unresolved, not automatically failed or safe to retry.
    if g.status='submitting' and g.updated_at < clock_timestamp()-interval '2 minutes' then
      update radas_v4.generations set status='unknown', updated_at=clock_timestamp() where id=p_id returning * into g;
    end if;
    if p_action in ('poll','reconcile') and g.status in ('queued','processing') and
      (g.last_polled_at is null or g.last_polled_at < clock_timestamp()-interval '3 seconds') then
      update radas_v4.generations set last_polled_at=clock_timestamp() where id=p_id returning * into g; v_poll := true;
    end if;
  end if;
  return jsonb_build_object('id',g.id,'status',g.status,'expiresAt',g.expires_at,'refunded',g.refunded,
    'providerJobId',g.provider_job_id,'pollAllowed',v_poll,'created',v_created,'claimAllowed',v_claim);
end;
$$;
revoke all on function radas_v4.generation_operation(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function radas_v4.generation_operation(text,uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
