select 'rate_state_table' check_name,to_regclass('radas_v4.request_limits') is not null passed
union all select 'rate_state_rls',(select relrowsecurity from pg_class where oid='radas_v4.request_limits'::regclass)
union all select 'browser_rpc_denied',not has_function_privilege('authenticated','public.radas_v4_request_limit(uuid,text)','execute')
union all select 'anonymous_rpc_denied',not has_function_privilege('anon','public.radas_v4_request_limit(uuid,text)','execute')
union all select 'service_rpc_allowed',has_function_privilege('service_role','public.radas_v4_request_limit(uuid,text)','execute')
union all select 'private_rpc_denied',not has_function_privilege('anon','radas_v4.request_limit(uuid,text)','execute') and not has_function_privilege('authenticated','radas_v4.request_limit(uuid,text)','execute')
union all select 'public_wrapper_invoker',not(select prosecdef from pg_proc where oid='public.radas_v4_request_limit(uuid,text)'::regprocedure)
union all select 'no_direct_state_write',not has_table_privilege('service_role','radas_v4.request_limits','insert') and not has_table_privilege('service_role','radas_v4.request_limits','update') and not has_table_privilege('authenticated','radas_v4.request_limits','insert')
union all select 'no_browser_state_read',not has_table_privilege('anon','radas_v4.request_limits','select') and not has_table_privilege('authenticated','radas_v4.request_limits','select')
union all select 'counters_bounded',not exists(select 1 from radas_v4.request_limits where used<1 or used>case scope when 'generation' then 12 when 'payment' then 20 else 0 end)
union all select 'payment_guard_preserved',exists(select 1 from pg_trigger where tgrelid='radas_v4.credit_transactions'::regclass and tgname='credit_payment_guard' and tgenabled='O')
union all select 'wallet_matches_ledger',not exists(select 1 from radas_v4.credit_wallets w where w.balance<>(select coalesce(sum(amount),0) from radas_v4.credit_transactions t where t.user_id=w.user_id));
