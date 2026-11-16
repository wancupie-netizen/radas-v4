-- New quotes: RM8/16/32/80. Existing orders retain their original amount and credits.
-- No payment, wallet, ledger, contact or notification rows are rewritten.
begin;
set local lock_timeout = '5s';
do $pricing$
declare
 v_constraint text;
 v_definition text;
 v_old constant text := 'v_amount:=case p_package when ''try'' then 500 when ''starter'' then 1000 when ''creator'' then 2000 when ''power'' then 5000 end;';
 v_new constant text := 'v_amount:=case p_package when ''try'' then 800 when ''starter'' then 1600 when ''creator'' then 3200 when ''power'' then 8000 end;';
begin
 -- Fail closed on an unexpected function body; do not overwrite later payment fixes.
 select pg_get_functiondef('radas_v4.payment_operation(uuid,text,uuid,text,text,integer,text)'::regprocedure) into strict v_definition;
 if strpos(v_definition,v_new)=0 then
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 then
   raise exception 'unexpected_payment_pricing_body';
  end if;
  v_definition := replace(v_definition,v_old,v_new);
 elsif strpos(v_definition,v_old)>0 then
  raise exception 'ambiguous_payment_pricing_body';
 end if;
 -- Match the single package/amount/credit constraint, regardless of its generated name.
 select conname into strict v_constraint from pg_constraint
 where conrelid='radas_v4.payments'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%package_id%'
  and pg_get_constraintdef(oid) like '%amount_sen%'
  and pg_get_constraintdef(oid) like '%credits%';
 execute format('alter table radas_v4.payments drop constraint %I',v_constraint);
 alter table radas_v4.payments add constraint payments_package_prices_check check (
  (package_id='try' and amount_sen in (500,800) and credits=60) or
  (package_id='starter' and amount_sen in (1000,1600) and credits=120) or
  (package_id='creator' and amount_sen in (2000,3200) and credits=250) or
  (package_id='power' and amount_sen in (5000,8000) and credits=620)
 );
 -- CREATE OR REPLACE preserves the existing owner, grants and signature.
 -- The existing ownership/admin checks, replay handling and exact-amount approval stay intact.
 execute v_definition;
end $pricing$;
notify pgrst,'reload schema';
commit;
