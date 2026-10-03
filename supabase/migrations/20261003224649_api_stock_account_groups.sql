-- Reporting classification only. Resolves the two approved emails once to stable user IDs.
-- No credits, payments, auth roles or generation states are changed.
begin;
do $$ begin
 if to_regclass('radas_v4.internal_stock_accounts') is not null then raise exception 'stock_groups_already_installed'; end if;
 if to_regprocedure('public.radas_v4_api_stock_snapshot(uuid)') is null then raise exception 'api_stock_required'; end if;
end $$;
create table radas_v4.internal_stock_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default statement_timestamp()
);
alter table radas_v4.internal_stock_accounts enable row level security;
revoke all on radas_v4.internal_stock_accounts from public,anon,authenticated,service_role;
do $$ declare v_id uuid; v_email text; begin
 foreach v_email in array array['wancupie@gmail.com','dekstop87@gmail.com'] loop
  select id into strict v_id from auth.users where lower(email)=v_email and email_confirmed_at is not null;
  insert into radas_v4.internal_stock_accounts(user_id) values(v_id);
 end loop;
exception when no_data_found then raise exception 'verified_internal_account_missing';
 when too_many_rows then raise exception 'internal_account_not_unique'; end $$;
create or replace function radas_v4.api_stock_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
 if not exists(select 1 from radas_v4.payment_admins where user_id=p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
 with accounts as (
  select u.id,coalesce(w.balance,0)::bigint balance,
   case when i.user_id is not null then 'internal'
    when exists(select 1 from radas_v4.payments p where p.user_id=u.id and p.status='approved') then 'customer'
    else 'other' end account_group
  from auth.users u left join radas_v4.credit_wallets w on w.user_id=u.id
  left join radas_v4.internal_stock_accounts i on i.user_id=u.id
 )
 select jsonb_build_object('outstandingCredits',coalesce(sum(balance),0),'fundedAccounts',count(*) filter(where balance>0),
  'customerCredits',coalesce(sum(balance) filter(where account_group='customer'),0),
  'customerAccounts',count(*) filter(where account_group='customer'),
  'internalCredits',coalesce(sum(balance) filter(where account_group='internal'),0),
  'internalAccounts',count(*) filter(where account_group='internal'),
  'otherCredits',coalesce(sum(balance) filter(where account_group='other'),0),
  'otherAccounts',count(*) filter(where account_group='other' and balance>0),
  'walletCheckedAt',statement_timestamp()) into v_result from accounts;
 return v_result;
end $$;
revoke all on function radas_v4.api_stock_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function radas_v4.api_stock_snapshot(uuid) to service_role;
notify pgrst,'reload schema';
commit;
