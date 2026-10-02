-- Read-only. Run after the migration in project fyqvvkpzcwrmyozxlqkw.
select 'generations_table' as check_name, to_regclass('radas_v4.generations') is not null as passed
union all select 'generations_rls', coalesce((select relrowsecurity from pg_class where oid=to_regclass('radas_v4.generations')),false)
union all select 'browser_rpc_denied', coalesce(not has_function_privilege('authenticated',to_regprocedure('public.radas_v4_generation_operation(text,uuid,uuid,jsonb)'),'EXECUTE'),false)
union all select 'anonymous_rpc_denied', coalesce(not has_function_privilege('anon',to_regprocedure('public.radas_v4_generation_operation(text,uuid,uuid,jsonb)'),'EXECUTE'),false)
union all select 'service_rpc_allowed', coalesce(has_function_privilege('service_role',to_regprocedure('public.radas_v4_generation_operation(text,uuid,uuid,jsonb)'),'EXECUTE'),false)
union all select 'browser_table_denied', coalesce(not has_table_privilege('authenticated',to_regclass('radas_v4.generations'),'SELECT,INSERT,UPDATE,DELETE'),false)
union all select 'service_direct_write_denied', coalesce(not has_table_privilege('service_role',to_regclass('radas_v4.generations'),'INSERT,UPDATE,DELETE'),false)
union all select 'public_wrapper_invoker', coalesce((select not prosecdef from pg_proc where oid=to_regprocedure('public.radas_v4_generation_operation(text,uuid,uuid,jsonb)')),false)
union all select 'one_active_index', to_regclass('radas_v4.generations_one_active') is not null
union all select 'each_generation_has_debit', not exists(select 1 from radas_v4.generations g where not exists(select 1 from radas_v4.credit_transactions t where t.user_id=g.user_id and t.type='debit' and t.reference=g.id::text))
union all select 'refund_flags_match_ledger', not exists(select 1 from radas_v4.generations g where g.refunded is distinct from exists(select 1 from radas_v4.credit_transactions t where t.user_id=g.user_id and t.type='refund' and t.reference=g.id::text))
union all select 'wallet_matches_ledger', not exists(select 1 from radas_v4.credit_wallets w where w.balance<>coalesce((select sum(amount) from radas_v4.credit_transactions t where t.user_id=w.user_id),0));
