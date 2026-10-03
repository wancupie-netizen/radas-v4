select 'products_table' check_name,to_regclass('radas_v4.affiliate_products') is not null passed
union all select 'products_rls',relrowsecurity from pg_class where oid='radas_v4.affiliate_products'::regclass
union all select 'audit_rls',relrowsecurity from pg_class where oid='radas_v4.affiliate_audit'::regclass
union all select 'browser_rpc_denied',not has_function_privilege('authenticated','public.radas_v4_affiliate_operation(uuid,text,jsonb)','execute')
union all select 'anonymous_rpc_denied',not has_function_privilege('anon','public.radas_v4_affiliate_operation(uuid,text,jsonb)','execute')
union all select 'service_rpc_allowed',has_function_privilege('service_role','public.radas_v4_affiliate_operation(uuid,text,jsonb)','execute')
union all select 'private_rpc_browser_denied',not has_function_privilege('authenticated','radas_v4.affiliate_operation(uuid,text,jsonb)','execute')
union all select 'wrapper_invoker',not prosecdef from pg_proc where oid='public.radas_v4_affiliate_operation(uuid,text,jsonb)'::regprocedure
union all select 'no_direct_products_access',not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) r(role) where has_table_privilege(r.role,'radas_v4.affiliate_products','select,insert,update,delete'))
union all select 'no_direct_audit_access',not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) r(role) where has_table_privilege(r.role,'radas_v4.affiliate_audit','select,insert,update,delete'))
union all select 'wallet_matches_ledger',not exists(select 1 from radas_v4.credit_wallets w where w.balance<>(select coalesce(sum(t.amount),0) from radas_v4.credit_transactions t where t.user_id=w.user_id));
