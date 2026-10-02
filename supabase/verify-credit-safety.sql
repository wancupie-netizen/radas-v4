-- Read-only verification after Phase 07 migration. Correct project: fyqvvkpzcwrmyozxlqkw.
select 'claim_token_column' as check_name, exists(select 1 from information_schema.columns where table_schema='radas_v4' and table_name='generations' and column_name='claim_token' and data_type='uuid') as passed
union all select 'reserved_state_constraint', exists(select 1 from pg_constraint where conrelid=to_regclass('radas_v4.generations') and conname='reserved_not_submitted')
union all select 'one_active_includes_reserved', coalesce((select pg_get_indexdef(oid) like '%reserved%' from pg_class where oid=to_regclass('radas_v4.generations_one_active')),false)
union all select 'generations_rls', coalesce((select relrowsecurity from pg_class where oid=to_regclass('radas_v4.generations')),false)
union all select 'browser_rpc_denied', coalesce(not has_function_privilege('authenticated',to_regprocedure('public.radas_v4_generation_operation(text,uuid,uuid,jsonb)'),'EXECUTE'),false)
union all select 'anonymous_rpc_denied', coalesce(not has_function_privilege('anon',to_regprocedure('public.radas_v4_generation_operation(text,uuid,uuid,jsonb)'),'EXECUTE'),false)
union all select 'service_rpc_allowed', coalesce(has_function_privilege('service_role',to_regprocedure('public.radas_v4_generation_operation(text,uuid,uuid,jsonb)'),'EXECUTE'),false)
union all select 'no_direct_table_write', coalesce(not has_table_privilege('service_role',to_regclass('radas_v4.generations'),'INSERT,UPDATE,DELETE'),false)
union all select 'public_wrappers_invokers', not exists(select 1 from pg_proc where oid in (to_regprocedure('public.radas_v4_generation_operation(text,uuid,uuid,jsonb)'),to_regprocedure('public.radas_v4_credit_apply(uuid,text,text)')) and prosecdef)
union all select 'refund_guard_installed', coalesce((select prosrc like '%generation_refund_not_allowed%' from pg_proc where oid=to_regprocedure('radas_v4.credit_apply(uuid,text,text)')),false)
union all select 'each_generation_has_debit', not exists(select 1 from radas_v4.generations g where not exists(select 1 from radas_v4.credit_transactions t where t.user_id=g.user_id and t.type='debit' and t.reference=g.id::text))
union all select 'refund_flags_match_ledger', not exists(select 1 from radas_v4.generations g where g.refunded is distinct from exists(select 1 from radas_v4.credit_transactions t where t.user_id=g.user_id and t.type='refund' and t.reference=g.id::text))
union all select 'reserved_has_no_submit_claim', not exists(select 1 from radas_v4.generations where status='reserved' and (claim_token is not null or provider_job_id is not null))
union all select 'wallet_matches_ledger', not exists(select 1 from radas_v4.credit_wallets w where w.balance<>coalesce((select sum(amount) from radas_v4.credit_transactions t where t.user_id=w.user_id),0));
