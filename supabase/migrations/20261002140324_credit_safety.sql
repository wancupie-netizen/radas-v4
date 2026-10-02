-- PHASE 07, RADAS V4 only. Install after accepted Phase 06. Run once.
begin;
do $$ begin
  if to_regclass('radas_v4.generations') is null then raise exception 'phase06_required'; end if;
  if exists(select 1 from information_schema.columns where table_schema='radas_v4' and table_name='generations' and column_name='claim_token') then
    raise exception 'phase07_already_installed';
  end if;
end $$;
lock table radas_v4.credit_wallets, radas_v4.generations in access exclusive mode;
alter table radas_v4.generations add column claim_token uuid unique;
alter table radas_v4.generations drop constraint generations_status_check;
alter table radas_v4.generations add constraint generations_status_check
  check(status in ('reserved','submitting','unknown','queued','processing','done','failed','rejected'));
alter table radas_v4.generations add constraint reserved_not_submitted
  check(status<>'reserved' or (provider_job_id is null and claim_token is null));
alter table radas_v4.generations alter column status set default 'reserved';
drop index radas_v4.generations_one_active;
create unique index generations_one_active on radas_v4.generations(user_id)
  where status in ('reserved','submitting','unknown','queued','processing');
create or replace function radas_v4.credit_apply(p_user_id uuid, p_type text, p_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_balance integer; v_amount integer; v_id uuid; v_refunded boolean; v_generation_user uuid; v_generation_status text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'server_only' using errcode = '42501';
  end if;
  if p_user_id is null or p_type is null or p_type not in ('topup', 'debit', 'refund') or
     p_reference is null or length(p_reference) not between 1 and 200 or p_reference <> btrim(p_reference) then
    raise exception 'invalid_credit_request' using errcode = '22023';
  end if;
  if p_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select user_id,status into v_generation_user,v_generation_status from radas_v4.generations where id=p_reference::uuid;
    if v_generation_user is not null then
      if v_generation_user<>p_user_id or p_reference<>lower(p_reference) then raise exception 'generation_reference_owner_conflict'; end if;
      if p_type='refund' and v_generation_status not in ('failed','rejected') then raise exception 'generation_refund_not_allowed'; end if;
    end if;
  end if;
  insert into radas_v4.credit_wallets(user_id) values (p_user_id) on conflict (user_id) do nothing;
  -- Serializes balance check, idempotency check and write for this wallet.
  select balance into v_balance from radas_v4.credit_wallets where user_id = p_user_id for update;
  select id into v_id from radas_v4.credit_transactions where user_id = p_user_id and type = p_type and reference = p_reference;
  v_refunded := exists(select 1 from radas_v4.credit_transactions where user_id = p_user_id and type = 'refund' and reference = p_reference);
  if v_id is not null then
    return jsonb_build_object('status', 'already_applied', 'balance', v_balance, 'transactionId', v_id, 'refunded', p_type = 'debit' and v_refunded);
  end if;
  if p_type = 'debit' and v_balance < 1 then
    return jsonb_build_object('status', 'insufficient_credits', 'balance', v_balance);
  end if;
  if p_type = 'refund' and not exists(select 1 from radas_v4.credit_transactions where user_id = p_user_id and type = 'debit' and reference = p_reference) then
    return jsonb_build_object('status', 'debit_not_found', 'balance', v_balance);
  end if;
  if p_type = 'topup' and exists(select 1 from radas_v4.credit_transactions where type = 'topup' and reference = p_reference) then
    raise exception 'payment_reference_conflict' using errcode = '23505';
  end if;
  v_amount := case p_type when 'topup' then 60 when 'debit' then -1 else 1 end;
  insert into radas_v4.credit_transactions(user_id, type, amount, reference, balance_before, balance_after)
    values (p_user_id, p_type, v_amount, p_reference, v_balance, v_balance + v_amount) returning id into v_id;
  update radas_v4.credit_wallets set balance = v_balance + v_amount, updated_at = clock_timestamp() where user_id = p_user_id;
  return jsonb_build_object('status', 'applied', 'balance', v_balance + v_amount, 'transactionId', v_id, 'refunded', false);
end;
$$;
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
      coalesce(p_data->>'mode','') not in ('text','image') or coalesce(p_data->>'orientation','') not in ('portrait','landscape') or
      coalesce(p_data->>'resolution','') not in ('720','1080') or coalesce(length(p_data->>'prompt'),0) not between 1 and 2000 or
      (p_data->>'prompt')<>btrim(p_data->>'prompt') then raise exception 'invalid_generation_request' using errcode='22023'; end if;
    if g.id is not null then
      if g.request_hash <> p_data->>'hash' then return jsonb_build_object('error','request_conflict'); end if;
    else
      if exists(select 1 from radas_v4.generations where id=p_id) then return jsonb_build_object('error','request_conflict'); end if;
      if exists(select 1 from radas_v4.generations where user_id=p_user_id and status in ('reserved','submitting','unknown','queued','processing')) then
        select id into v_active from radas_v4.generations where user_id=p_user_id and status in ('reserved','submitting','unknown','queued','processing');
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
revoke all on function radas_v4.credit_apply(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function radas_v4.credit_apply(uuid,text,text) to service_role;
revoke all on function radas_v4.generation_operation(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function radas_v4.generation_operation(text,uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
