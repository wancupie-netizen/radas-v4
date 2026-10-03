-- V4 only: additive admin read RPC. No wallet, ledger, payment or generation writes.
begin;
do $$ begin
 if to_regprocedure('public.radas_v4_api_stock_snapshot(uuid)') is not null or to_regprocedure('radas_v4.api_stock_snapshot(uuid)') is not null then raise exception 'api_stock_already_installed'; end if;
 if to_regclass('radas_v4.credit_wallets') is null or to_regclass('radas_v4.payment_admins') is null then raise exception 'v4_payments_required'; end if;
end $$;
create function radas_v4.api_stock_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
 if not exists(select 1 from radas_v4.payment_admins where user_id=p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
 select jsonb_build_object('outstandingCredits',coalesce(sum(balance::bigint),0),
  'fundedAccounts',count(*) filter(where balance>0),'walletCheckedAt',statement_timestamp())
 into v_result from radas_v4.credit_wallets;
 return v_result;
end $$;
revoke all on function radas_v4.api_stock_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function radas_v4.api_stock_snapshot(uuid) to service_role;
create function public.radas_v4_api_stock_snapshot(p_actor uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select radas_v4.api_stock_snapshot(p_actor); $$;
revoke all on function public.radas_v4_api_stock_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function public.radas_v4_api_stock_snapshot(uuid) to service_role;
notify pgrst,'reload schema';
commit;
