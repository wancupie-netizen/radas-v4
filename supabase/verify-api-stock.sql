select 'stock_rpc_installed' check_name,to_regprocedure('public.radas_v4_api_stock_snapshot(uuid)') is not null passed
union all select 'browser_rpc_denied',not has_function_privilege('authenticated','public.radas_v4_api_stock_snapshot(uuid)','execute')
union all select 'anonymous_rpc_denied',not has_function_privilege('anon','public.radas_v4_api_stock_snapshot(uuid)','execute')
union all select 'service_rpc_allowed',has_function_privilege('service_role','public.radas_v4_api_stock_snapshot(uuid)','execute')
union all select 'private_rpc_browser_denied',not has_function_privilege('authenticated','radas_v4.api_stock_snapshot(uuid)','execute')
union all select 'private_rpc_anonymous_denied',not has_function_privilege('anon','radas_v4.api_stock_snapshot(uuid)','execute')
union all select 'public_wrapper_invoker',not prosecdef from pg_proc where oid='public.radas_v4_api_stock_snapshot(uuid)'::regprocedure
union all select 'stock_functions_stable',not exists(select 1 from pg_proc where oid in ('public.radas_v4_api_stock_snapshot(uuid)'::regprocedure,'radas_v4.api_stock_snapshot(uuid)'::regprocedure) and provolatile<>'s')
union all select 'wallet_rls',relrowsecurity from pg_class where oid='radas_v4.credit_wallets'::regclass
union all select 'no_direct_wallet_read',not exists(select 1 from (values('anon'),('authenticated'),('service_role')) r(role) where has_table_privilege(r.role,'radas_v4.credit_wallets','select'))
union all select 'wallet_matches_ledger',not exists(select 1 from radas_v4.credit_wallets w where w.balance<>(select coalesce(sum(t.amount),0) from radas_v4.credit_transactions t where t.user_id=w.user_id))
union all select 'internal_accounts_table',to_regclass('radas_v4.internal_stock_accounts') is not null
union all select 'internal_accounts_rls',relrowsecurity from pg_class where oid='radas_v4.internal_stock_accounts'::regclass
union all select 'two_internal_accounts',count(*)=2 from radas_v4.internal_stock_accounts
union all select 'internal_accounts_private',not exists(select 1 from (values('anon'),('authenticated'),('service_role')) r(role) where has_table_privilege(r.role,'radas_v4.internal_stock_accounts','select,insert,update,delete'));
