select 'cleanup_state_table' as check_name,to_regclass('radas_v4.cleanup_state') is not null as passed
union all select 'cleanup_state_rls',coalesce((select relrowsecurity from pg_class where oid=to_regclass('radas_v4.cleanup_state')),false)
union all select 'singleton_state',1=(select count(*) from radas_v4.cleanup_state)
union all select 'browser_state_denied',not has_table_privilege('authenticated','radas_v4.cleanup_state','SELECT,INSERT,UPDATE,DELETE')
union all select 'service_direct_state_write_denied',not has_table_privilege('service_role','radas_v4.cleanup_state','INSERT,UPDATE,DELETE')
union all select 'anonymous_rpc_denied',not has_function_privilege('anon','public.radas_v4_cleanup_operation(text,uuid,jsonb,integer,text)','EXECUTE')
union all select 'browser_rpc_denied',not has_function_privilege('authenticated','public.radas_v4_cleanup_operation(text,uuid,jsonb,integer,text)','EXECUTE')
union all select 'service_rpc_allowed',has_function_privilege('service_role','public.radas_v4_cleanup_operation(text,uuid,jsonb,integer,text)','EXECUTE')
union all select 'public_wrapper_invoker',not (select prosecdef from pg_proc where oid='public.radas_v4_cleanup_operation(text,uuid,jsonb,integer,text)'::regprocedure)
union all select 'helper_private',not has_function_privilege('authenticated','radas_v4.cleanup_candidates()','EXECUTE') and not has_function_privilege('service_role','radas_v4.cleanup_candidates()','EXECUTE')
union all select 'v4_private_bucket',exists(select 1 from storage.buckets where id='radas-v4-videos' and not public)
union all select 'wallet_matches_ledger',not exists(select 1 from radas_v4.credit_wallets w where w.balance<>(select coalesce(sum(amount),0) from radas_v4.credit_transactions t where t.user_id=w.user_id));
