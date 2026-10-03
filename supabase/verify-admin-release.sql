select 'release_columns' as check_name, exists(select 1 from information_schema.columns where table_schema='radas_v4' and table_name='generations' and column_name='admin_released_at') as passed
union all select 'private_invoker', exists(select 1 from pg_proc where oid=to_regprocedure('radas_v4.admin_release_unknown(uuid,uuid,text)') and not prosecdef)
union all select 'api_release_denied', not exists(select 1 from (values('anon'),('authenticated'),('service_role')) r(role) where has_function_privilege(r.role,to_regprocedure('radas_v4.admin_release_unknown(uuid,uuid,text)'),'EXECUTE'))
union all select 'release_guard', exists(select 1 from pg_constraint where conrelid='radas_v4.generations'::regclass and conname='admin_release_consistent')
union all select 'active_index_release_filter', position('admin_released_at IS NULL' in pg_get_expr((select indpred from pg_index where indexrelid='radas_v4.generations_one_active'::regclass),'radas_v4.generations'::regclass))>0
union all select 'active_lookups_release_filter', position('admin_released_at is null' in pg_get_functiondef('radas_v4.generation_operation(text,uuid,uuid,jsonb)'::regprocedure))>0
union all select 'wallet_matches_ledger', not exists(select 1 from radas_v4.credit_wallets w where w.balance<>(select coalesce(sum(t.amount),0) from radas_v4.credit_transactions t where t.user_id=w.user_id));
