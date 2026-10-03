-- V4 only. Manual confirmation is a privileged operator assertion of bank receipt.
begin;
do $$ begin
 if to_regclass('radas_v4.payments') is not null then raise exception 'payments_already_installed'; end if;
 if to_regclass('radas_v4.cleanup_state') is null then raise exception 'phase10_required'; end if;
end $$;
create table radas_v4.payment_admins(user_id uuid primary key references auth.users(id));
alter table radas_v4.payment_admins enable row level security;
create table radas_v4.payments(
 id uuid primary key, user_id uuid not null references auth.users(id),
 package_id text not null, amount_sen integer not null, credits integer not null,
 status text not null default 'pending' check(status in ('pending','submitted','approved','rejected')),
 customer_reference text, bank_reference text unique, reason text,
 reviewed_by uuid references radas_v4.payment_admins(user_id), reviewed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check((package_id='try' and amount_sen=500 and credits=60) or (package_id='starter' and amount_sen=1000 and credits=120) or (package_id='creator' and amount_sen=2000 and credits=250) or (package_id='power' and amount_sen=5000 and credits=620)),
 check(customer_reference is null or (length(customer_reference) between 3 and 100 and customer_reference=btrim(customer_reference))),
 check(bank_reference is null or bank_reference ~ '^[A-Z0-9][A-Z0-9 /._-]{2,99}$'),
 check((status='approved' and bank_reference is not null and reviewed_by is not null and reviewed_at is not null) or (status<>'approved' and bank_reference is null)),
 check(status<>'submitted' or customer_reference is not null)
);
alter table radas_v4.payments enable row level security;
create unique index payments_one_pending on radas_v4.payments(user_id) where status in ('pending','submitted');
create index payments_recent on radas_v4.payments(created_at desc,id);
revoke all on radas_v4.payments,radas_v4.payment_admins from public,anon,authenticated,service_role;
-- Resolve the approved administrator once; email is never used for runtime authorization.
do $$ declare v_id uuid; begin
 select id into strict v_id from auth.users where lower(email)='wancupie@gmail.com' and email_confirmed_at is not null;
 insert into radas_v4.payment_admins values(v_id);
exception when no_data_found then raise exception 'verified_admin_account_missing'; end $$;
-- Preserve existing ledger rows; extend only the fixed top-up amounts.
do $$ declare v_name text; begin
 select conname into strict v_name from pg_constraint where conrelid='radas_v4.credit_transactions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%topup%' and pg_get_constraintdef(oid) like '%amount%';
 execute format('alter table radas_v4.credit_transactions drop constraint %I',v_name);
end $$;
alter table radas_v4.credit_transactions add constraint credit_amount_packages check((type='topup' and amount in (60,120,250,620)) or (type='debit' and amount=-1) or (type='refund' and amount=1));
create function radas_v4.payment_operation(p_actor uuid,p_action text,p_id uuid default null,p_package text default null,p_reference text default null,p_amount integer default null,p_reason text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_admin boolean; v_row radas_v4.payments; v_amount integer; v_credits integer; v_balance integer; v_tx uuid; v_ref text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
 v_admin:=exists(select 1 from radas_v4.payment_admins where user_id=p_actor);
 if p_action='list' then
  return jsonb_build_object('admin',v_admin,'payments',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id) from (select id,user_id,package_id,amount_sen,credits,status,customer_reference,reason,created_at from radas_v4.payments where user_id=p_actor order by created_at desc,id limit 20) t),'[]'::jsonb));
 end if;
 if p_action='admin_list' then
  if not v_admin then raise exception 'forbidden' using errcode='42501'; end if;
  return jsonb_build_object('payments',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id) from (select id,user_id,package_id,amount_sen,credits,status,customer_reference,reason,created_at from radas_v4.payments where status in ('pending','submitted') order by created_at desc,id limit 100) t),'[]'::jsonb));
 end if;
 if p_id is null then raise exception 'invalid_request'; end if;
 if p_action='create' then
  v_amount:=case p_package when 'try' then 500 when 'starter' then 1000 when 'creator' then 2000 when 'power' then 5000 end;
  v_credits:=case p_package when 'try' then 60 when 'starter' then 120 when 'creator' then 250 when 'power' then 620 end;
  if v_amount is null then raise exception 'invalid_package'; end if;
  -- Serialize creation, including different request IDs, without touching balance.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,11));
  select * into v_row from radas_v4.payments where id=p_id;
  if found then
   if v_row.user_id<>p_actor or v_row.package_id<>p_package then raise exception 'request_conflict'; end if;
   return jsonb_build_object('payment',to_jsonb(v_row)-'bank_reference'-'reviewed_by');
  end if;
  select * into v_row from radas_v4.payments where user_id=p_actor and status in ('pending','submitted');
  if found then return jsonb_build_object('payment',to_jsonb(v_row)-'bank_reference'-'reviewed_by'); end if;
  insert into radas_v4.payments(id,user_id,package_id,amount_sen,credits) values(p_id,p_actor,p_package,v_amount,v_credits) returning * into v_row;
 elsif p_action='submit' then
  select * into v_row from radas_v4.payments where id=p_id and user_id=p_actor for update;
  if not found then raise exception 'not_found'; end if;
  if p_reference is null or length(p_reference) not between 3 and 100 or p_reference<>btrim(p_reference) then raise exception 'invalid_reference'; end if;
  if v_row.status='submitted' and v_row.customer_reference=p_reference then return jsonb_build_object('payment',to_jsonb(v_row)-'bank_reference'-'reviewed_by'); end if;
  if v_row.status<>'pending' then raise exception 'payment_locked'; end if;
  update radas_v4.payments set status='submitted',customer_reference=p_reference where id=p_id returning * into v_row;
 elsif p_action='cancel' then
  select * into v_row from radas_v4.payments where id=p_id and user_id=p_actor for update;
  if not found then raise exception 'not_found'; end if;
  if v_row.status<>'pending' then raise exception 'payment_locked'; end if;
  update radas_v4.payments set status='rejected',reason='Dibatalkan sebelum bayaran' where id=p_id returning * into v_row;
 elsif p_action in ('approve','reject') then
  if not v_admin then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_row from radas_v4.payments where id=p_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_action='approve' then
   v_ref:=regexp_replace(upper(btrim(p_reference)), '[^A-Z0-9]', '', 'g');
   if p_amount is distinct from v_row.amount_sen or v_ref is null or v_ref !~ '^[A-Z0-9][A-Z0-9 /._-]{2,99}$' then raise exception 'bank_details_invalid'; end if;
   if v_row.status='approved' then
    if v_row.bank_reference<>v_ref then raise exception 'request_conflict'; end if;
    return jsonb_build_object('status','already_approved');
   end if;
   if v_row.status<>'submitted' then raise exception 'payment_not_submitted'; end if;
   insert into radas_v4.credit_wallets(user_id) values(v_row.user_id) on conflict do nothing;
   select balance into v_balance from radas_v4.credit_wallets where user_id=v_row.user_id for update;
   -- One bank reference can fund only one payment, across every user and package.
   insert into radas_v4.credit_transactions(user_id,type,amount,reference,balance_before,balance_after) values(v_row.user_id,'topup',v_row.credits,'maybank:'||v_ref,v_balance,v_balance+v_row.credits) returning id into v_tx;
   update radas_v4.credit_wallets set balance=v_balance+v_row.credits,updated_at=clock_timestamp() where user_id=v_row.user_id;
   update radas_v4.payments set status='approved',bank_reference=v_ref,reviewed_by=p_actor,reviewed_at=clock_timestamp() where id=p_id returning * into v_row;
  else
   if p_reason is null or length(btrim(p_reason)) not between 3 and 200 then raise exception 'reason_required'; end if;
   if v_row.status='rejected' and v_row.reason=btrim(p_reason) then return jsonb_build_object('status','already_rejected'); end if;
   if v_row.status not in ('pending','submitted') then raise exception 'payment_locked'; end if;
   update radas_v4.payments set status='rejected',reason=btrim(p_reason),reviewed_by=p_actor,reviewed_at=clock_timestamp() where id=p_id returning * into v_row;
  end if;
 else raise exception 'invalid_action'; end if;
 return jsonb_build_object('payment',to_jsonb(v_row)-'bank_reference'-'reviewed_by');
end $$;
revoke all on function radas_v4.payment_operation(uuid,text,uuid,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function radas_v4.payment_operation(uuid,text,uuid,text,text,integer,text) to service_role;
create function public.radas_v4_payment_operation(p_actor uuid,p_action text,p_id uuid default null,p_package text default null,p_reference text default null,p_amount integer default null,p_reason text default null) returns jsonb language sql security invoker set search_path='' as $$ select radas_v4.payment_operation(p_actor,p_action,p_id,p_package,p_reference,p_amount,p_reason); $$;
revoke all on function public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
