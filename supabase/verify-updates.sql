-- Read-only checks after installation in project fyqvvkpzcwrmyozxlqkw.
select 'updates_table' check_name,to_regclass('radas_v4.platform_updates') is not null passed
union all select 'updates_rls',(select relrowsecurity from pg_class where oid='radas_v4.platform_updates'::regclass)
union all select 'audit_rls',(select relrowsecurity from pg_class where oid='radas_v4.updates_audit'::regclass)
union all select 'browser_rpc_denied',not has_function_privilege('authenticated','public.radas_v4_updates_operation(uuid,text,jsonb)','execute')
union all select 'anonymous_rpc_denied',not has_function_privilege('anon','public.radas_v4_updates_operation(uuid,text,jsonb)','execute')
union all select 'service_rpc_allowed',has_function_privilege('service_role','public.radas_v4_updates_operation(uuid,text,jsonb)','execute')
union all select 'private_rpc_browser_denied',not has_function_privilege('authenticated','radas_v4.updates_operation(uuid,text,jsonb)','execute') and not has_function_privilege('anon','radas_v4.updates_operation(uuid,text,jsonb)','execute')
union all select 'wrapper_invoker',not (select prosecdef from pg_proc where oid='public.radas_v4_updates_operation(uuid,text,jsonb)'::regprocedure)
union all select 'private_tables',not exists(select 1 from information_schema.role_table_grants where table_schema='radas_v4' and table_name in ('platform_updates','updates_audit') and grantee in ('anon','authenticated','service_role','PUBLIC'))
union all select 'published_has_date',not exists(select 1 from radas_v4.platform_updates where document->>'published'='true' and published_at is null)
union all select 'wallet_matches_ledger',not exists(select 1 from radas_v4.credit_wallets w where w.balance<>coalesce((select sum(t.amount) from radas_v4.credit_transactions t where t.user_id=w.user_id),0));
