select 'payment_guard_installed' check_name,exists(select 1 from pg_trigger where tgrelid='radas_v4.credit_transactions'::regclass and tgname='credit_payment_guard' and tgenabled='O') passed
union all select 'guard_private',not has_function_privilege('anon','radas_v4.guard_payment_credit()','execute') and not has_function_privilege('authenticated','radas_v4.guard_payment_credit()','execute') and not has_function_privilege('service_role','radas_v4.guard_payment_credit()','execute')
union all select 'payments_rls',(select relrowsecurity from pg_class where oid='radas_v4.payments'::regclass)
union all select 'admins_rls',(select relrowsecurity from pg_class where oid='radas_v4.payment_admins'::regclass)
union all select 'browser_rpc_denied',not has_function_privilege('authenticated','public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text)','execute')
union all select 'anonymous_rpc_denied',not has_function_privilege('anon','public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text)','execute')
union all select 'service_rpc_allowed',has_function_privilege('service_role','public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text)','execute')
union all select 'wrapper_invoker',not (select prosecdef from pg_proc where oid='public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text)'::regprocedure)
union all select 'no_direct_payment_writes',not has_table_privilege('service_role','radas_v4.payments','update') and not has_table_privilege('authenticated','radas_v4.payment_admins','insert')
union all select 'approved_matches_ledger',not exists(select 1 from radas_v4.payments p where p.status='approved' and not exists(select 1 from radas_v4.credit_transactions t where t.type='topup' and t.user_id=p.user_id and t.amount=p.credits and t.reference='maybank:'||p.bank_reference))
union all select 'bank_references_unique',not exists(select bank_reference from radas_v4.payments where bank_reference is not null group by bank_reference having count(*)>1)
union all select 'wallet_matches_ledger',not exists(select 1 from radas_v4.credit_wallets w where w.balance<>(select coalesce(sum(amount),0) from radas_v4.credit_transactions t where t.user_id=w.user_id));
