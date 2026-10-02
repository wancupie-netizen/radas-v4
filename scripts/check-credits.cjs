// Actual PostgreSQL functions in an isolated in-memory PGlite database.
// No live Supabase connections, accounts, payments or credits.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const ts = require('typescript');
const uid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
      insert into auth.users values ('${uid}'), ('${other}');`);
    const sql = readFileSync('supabase/migrations/202610020001_credit_engine.sql','utf8');
    await db.exec(sql);
    async function actor(role,sub) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,...(sub?{sub}:{})})]);
      await db.exec(`set role ${role}`);
    }
    async function snapshot() { return (await db.query('select public.radas_v4_credit_snapshot() as result')).rows[0].result; }
    async function apply(type,ref,user=uid) { return (await db.query('select public.radas_v4_credit_apply($1,$2,$3) as result',[user,type,ref])).rows[0].result; }
    await actor('authenticated',uid);
    assert.deepEqual((await snapshot()).transactions,[]);assert.equal((await snapshot()).balance,0);
    await assert.rejects(apply('topup','fake-payment'),/permission denied/);
    await assert.rejects(db.exec('update radas_v4.credit_wallets set balance=999'),/permission denied/);
    await assert.rejects(db.exec('select * from radas_v4.credit_transactions'),/permission denied/);
    console.log('PASS new wallet zero; browser cannot mutate credits or read private tables');
    await actor('anon');await assert.rejects(snapshot(),/permission denied/);
    await actor('authenticated');await assert.rejects(snapshot(),/authentication_required/);
    console.log('PASS anonymous and missing identity denied');
    await actor('service_role');
    assert.equal((await apply('debit','no-money')).status,'insufficient_credits');
    assert.equal((await apply('refund','missing-job')).status,'debit_not_found');
    assert.equal((await apply('topup','paid-1')).balance,60);
    assert.equal((await apply('topup','paid-1')).status,'already_applied');
    assert.equal((await apply('debit','job-1')).balance,59);
    assert.equal((await apply('debit','job-1')).balance,59);
    assert.equal((await apply('refund','job-1')).balance,60);
    assert.equal((await apply('refund','job-1')).status,'already_applied');
    assert.equal((await apply('debit','job-1')).refunded,true);
    await assert.rejects(apply('topup','paid-1',other),/payment_reference_conflict/);
    for(const [kind,ref] of [['wrong','x'],['debit',''],['debit',' space'],['topup','x'.repeat(201)],['refund',null]]) await assert.rejects(apply(kind,ref),/invalid_credit_request/);
    await assert.rejects(apply('topup','unknown-user','33333333-3333-4333-8333-333333333333'),/foreign key/);
    console.log('PASS fixed amounts, duplicate debit/topup/refund, refund pairing, payment ownership and input checks');
    await actor('authenticated',other);assert.equal((await snapshot()).balance,0);assert.equal((await snapshot()).transactions.length,0);
    await actor('authenticated',uid);let own=await snapshot();assert.equal(own.balance,60);assert.equal(own.transactions.length,3);
    assert.ok(own.transactions.every(t=>!('reference' in t)&&!('user_id' in t)));
    console.log('PASS each user sees only their wallet and ledger');
    // Inject failure AFTER ledger insert to verify transaction rollback of both records.
    await db.exec('reset role');
    await db.exec(`create function radas_v4.fail_update() returns trigger language plpgsql as $$ begin raise exception 'test_write_failure'; end $$;
      create trigger test_failure before update on radas_v4.credit_wallets for each row execute function radas_v4.fail_update();`);
    await actor('service_role');await assert.rejects(apply('debit','rollback-job'),/test_write_failure/);
    await db.exec('reset role');
    assert.equal((await db.query("select count(*)::int as n from radas_v4.credit_transactions where reference='rollback-job'")).rows[0].n,0);
    assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[uid])).rows[0].balance,60);
    await db.exec('drop trigger test_failure on radas_v4.credit_wallets; drop function radas_v4.fail_update();');
    console.log('PASS failed wallet update rolls back ledger insert and balance together');
    await actor('service_role');
    // PGlite queues statements on one connection: tests burst/retry behavior, not multi-connection row locks.
    const burst=await Promise.all(Array.from({length:70},(_,i)=>apply('debit',`burst-${i}`)));
    assert.equal(burst.filter(x=>x.status==='applied').length,60);
    assert.equal(burst.filter(x=>x.status==='insufficient_credits').length,10);
    await actor('authenticated',uid);own=await snapshot();assert.equal(own.balance,0);assert.equal(own.transactions.length,20);
    await db.exec('reset role');
    const totals=(await db.query('select sum(amount)::int as total,count(*)::int as n from radas_v4.credit_transactions where user_id=$1',[uid])).rows[0];
    assert.equal(totals.total,0);assert.equal(totals.n,63);
    assert.equal((await db.query("select count(*)::int as n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='radas_v4' and c.relkind='r' and c.relrowsecurity")).rows[0].n,2);
    const verification=await db.query(readFileSync('supabase/verify-credit-engine.sql','utf8'));
    assert.ok(verification.rows.every(row=>row.passed), JSON.stringify(verification.rows));
    await db.query("select set_config('request.jwt.claims','{\"role\":\"authenticated\"}',false)");
    await assert.rejects(apply('topup','wrong-jwt'),/server_only/);
    console.log('PASS burst debit never overspends; ledger reconciles; RLS enabled; service JWT required');
    await assert.rejects(db.exec(sql),/already exists/);await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from radas_v4.credit_transactions')).rows[0].n,63);
    console.log('PASS migration rerun aborts without overwriting data');
    const compiled=ts.transpileModule(readFileSync('src/lib/credits/types.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    const mod={exports:{}};new Function('exports','module',compiled)(mod.exports,mod);
    const parse=mod.exports.parseSnapshot;
    assert.equal(parse(own).status,'ready');
    for(const bad of [null,{}, {...own,balance:-1},{...own,balance:1.5},{...own,transactions:[{...own.transactions[0],amount:999}]}]) assert.equal(parse(bad).status,'unavailable');
    console.log('PASS invalid snapshots fail closed instead of displaying invented balance');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
