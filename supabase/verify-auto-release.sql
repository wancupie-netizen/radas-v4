-- Read-only verification; no request, wallet or ledger changes.
select 'auto_release_installed' as check_name,
  (select prosrc like '%auto_release_v1%' and prosrc like '%''releaseAfter''%'
   from pg_proc where oid=to_regprocedure('radas_v4.generation_operation(text,uuid,uuid,jsonb)')) as passed
union all select 'one_active_index_excludes_released',
  coalesce((select pg_get_expr(indpred,indrelid) like '%unknown_released_at IS NULL%'
    from pg_index where indexrelid=to_regclass('radas_v4.generations_one_active')),false)
union all select 'browser_rpc_denied',
  not has_function_privilege('authenticated','public.radas_v4_generation_operation(text,uuid,uuid,jsonb)','EXECUTE')
union all select 'anonymous_rpc_denied',
  not has_function_privilege('anon','public.radas_v4_generation_operation(text,uuid,uuid,jsonb)','EXECUTE')
union all select 'refund_flags_match_ledger', not exists(
  select 1 from radas_v4.generations g where g.refunded is distinct from exists(
    select 1 from radas_v4.credit_transactions t
    where t.user_id=g.user_id and t.type='refund' and t.reference=g.id::text))
union all select 'wallet_matches_ledger', not exists(
  select 1 from radas_v4.credit_wallets w where w.balance <> coalesce(
    (select sum(amount) from radas_v4.credit_transactions t where t.user_id=w.user_id),0));
