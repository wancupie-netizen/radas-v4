-- RADAS V4 only. Run once in project fyqvvkpzcwrmyozxlqkw SQL Editor.
-- Atomic install; existing schema/name conflicts abort without altering legacy data.
begin;
create schema radas_v4;
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('radas_v4_credit_snapshot','radas_v4_credit_apply')) then
    raise exception 'credit_rpc_name_conflict';
  end if;
end $$;
revoke all on schema radas_v4 from public, anon, authenticated, service_role;
grant usage on schema radas_v4 to authenticated, service_role;

create table radas_v4.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default clock_timestamp()
);
create table radas_v4.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references radas_v4.credit_wallets(user_id) on delete cascade,
  type text not null check (type in ('topup', 'debit', 'refund')),
  amount integer not null,
  reference text not null check (length(reference) between 1 and 200 and reference = btrim(reference)),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0 and balance_after = balance_before + amount),
  created_at timestamptz not null default clock_timestamp(),
  unique (user_id, type, reference),
  check ((type = 'topup' and amount = 60) or (type = 'debit' and amount = -1) or (type = 'refund' and amount = 1))
);
create unique index credit_payment_reference_unique on radas_v4.credit_transactions(reference) where type = 'topup';
create index credit_transactions_recent on radas_v4.credit_transactions(user_id, created_at desc, id desc);
alter table radas_v4.credit_wallets enable row level security;
alter table radas_v4.credit_transactions enable row level security;
create policy own_wallet on radas_v4.credit_wallets for select to authenticated using (user_id = (select auth.uid()));
create policy own_transactions on radas_v4.credit_transactions for select to authenticated using (user_id = (select auth.uid()));
-- Tables are private even to service_role: all changes go through the transaction function.
revoke all on all tables in schema radas_v4 from public, anon, authenticated, service_role;

create function radas_v4.credit_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null or coalesce(auth.jwt()->>'role', '') <> 'authenticated' then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  insert into radas_v4.credit_wallets(user_id) values (v_user) on conflict (user_id) do nothing;
  -- One statement snapshot: balance and ledger agree during concurrent mutations.
  select jsonb_build_object('balance', w.balance, 'updatedAt', w.updated_at,
    'transactions', coalesce((select jsonb_agg(t.payload order by t.created_at desc, t.id desc) from (
      select ct.id, ct.created_at, jsonb_build_object('id', ct.id, 'type', ct.type, 'amount', ct.amount,
        'balanceAfter', ct.balance_after, 'createdAt', ct.created_at) as payload
      from radas_v4.credit_transactions ct where ct.user_id = v_user
      order by ct.created_at desc, ct.id desc limit 20
    ) t), '[]'::jsonb)) into v_result
  from radas_v4.credit_wallets w where w.user_id = v_user;
  return v_result;
end;
$$;

create function radas_v4.credit_apply(p_user_id uuid, p_type text, p_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_balance integer; v_amount integer; v_id uuid; v_refunded boolean;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'server_only' using errcode = '42501';
  end if;
  if p_user_id is null or p_type is null or p_type not in ('topup', 'debit', 'refund') or
     p_reference is null or length(p_reference) not between 1 and 200 or p_reference <> btrim(p_reference) then
    raise exception 'invalid_credit_request' using errcode = '22023';
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
revoke all on function radas_v4.credit_snapshot() from public, anon, authenticated, service_role;
revoke all on function radas_v4.credit_apply(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function radas_v4.credit_snapshot() to authenticated;
grant execute on function radas_v4.credit_apply(uuid, text, text) to service_role;

-- Exposed RPC wrappers are invokers. Definers live only in the private schema.
create function public.radas_v4_credit_snapshot() returns jsonb
language sql security invoker set search_path = '' as $$ select radas_v4.credit_snapshot(); $$;
create function public.radas_v4_credit_apply(p_user_id uuid, p_type text, p_reference text) returns jsonb
language sql security invoker set search_path = '' as $$ select radas_v4.credit_apply(p_user_id, p_type, p_reference); $$;
revoke all on function public.radas_v4_credit_snapshot() from public, anon, authenticated, service_role;
revoke all on function public.radas_v4_credit_apply(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.radas_v4_credit_snapshot() to authenticated;
grant execute on function public.radas_v4_credit_apply(uuid, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
