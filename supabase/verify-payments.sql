select 'payments_table' check_name,to_regclass('radas_v4.payments') is not null passed
union all select 'payments_rls',(select relrowsecurity from pg_class where oid='radas_v4.payments'::regclass)
union all select 'admin_rls',(select relrowsecurity from pg_class where oid='radas_v4.payment_admins'::regclass)
union all select 'approved_admin',(select count(*)=1 from radas_v4.payment_admins a join auth.users u on u.id=a.user_id where lower(u.email)='wancupie@gmail.com' and u.email_confirmed_at is not null)
union all select 'browser_rpc_denied',not has_function_privilege('authenticated','public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text)','execute')
union all select 'anonymous_rpc_denied',not has_function_privilege('anon','public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text)','execute')
union all select 'service_rpc_allowed',has_function_privilege('service_role','public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text)','execute')
union all select 'private_tables',not has_table_privilege('authenticated','radas_v4.payments','select') and not has_table_privilege('service_role','radas_v4.payments','update') and not has_table_privilege('service_role','radas_v4.payment_admins','insert')
union all select 'public_wrapper_invoker',not (select prosecdef from pg_proc where oid='public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text)'::regprocedure)
union all select 'approved_matches_ledger',not exists(select 1 from radas_v4.payments p where p.status='approved' and not exists(select 1 from radas_v4.credit_transactions t where t.user_id=p.user_id and t.type='topup' and t.reference='maybank:'||p.bank_reference and t.amount=p.credits))
union all select 'unapproved_has_no_credit',not exists(select 1 from radas_v4.payments p join radas_v4.credit_transactions t on t.reference='maybank:'||p.bank_reference where p.status<>'approved')
union all select 'wallet_matches_ledger',not exists(select 1 from radas_v4.credit_wallets w where w.balance<>(select coalesce(sum(amount),0) from radas_v4.credit_transactions t where t.user_id=w.user_id));
