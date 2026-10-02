-- Read-only installation verification. Run in the same Supabase SQL Editor.
select 'schema' as check_name, to_regnamespace('radas_v4') is not null as passed
union all select 'wallet_rls', coalesce((select relrowsecurity from pg_class where oid=to_regclass('radas_v4.credit_wallets')),false)
union all select 'ledger_rls', coalesce((select relrowsecurity from pg_class where oid=to_regclass('radas_v4.credit_transactions')),false)
union all select 'anonymous_snapshot_denied', not has_function_privilege('anon','public.radas_v4_credit_snapshot()','execute')
union all select 'authenticated_snapshot_allowed', has_function_privilege('authenticated','public.radas_v4_credit_snapshot()','execute')
union all select 'authenticated_mutation_denied', not has_function_privilege('authenticated','public.radas_v4_credit_apply(uuid,text,text)','execute')
union all select 'anonymous_mutation_denied', not has_function_privilege('anon','public.radas_v4_credit_apply(uuid,text,text)','execute')
union all select 'service_mutation_allowed', has_function_privilege('service_role','public.radas_v4_credit_apply(uuid,text,text)','execute')
union all select 'no_direct_wallet_write', not has_table_privilege('authenticated','radas_v4.credit_wallets','insert,update,delete')
union all select 'no_direct_service_wallet_write', not has_table_privilege('service_role','radas_v4.credit_wallets','insert,update,delete')
union all select 'no_direct_ledger_write', not has_table_privilege('authenticated','radas_v4.credit_transactions','insert,update,delete')
union all select 'public_wrappers_are_invokers', not exists(select 1 from pg_proc where oid in ('public.radas_v4_credit_snapshot()'::regprocedure,'public.radas_v4_credit_apply(uuid,text,text)'::regprocedure) and prosecdef)
union all select 'wallet_matches_ledger', not exists(select 1 from radas_v4.credit_wallets w where w.balance <> coalesce((select sum(t.amount) from radas_v4.credit_transactions t where t.user_id=w.user_id),0));
