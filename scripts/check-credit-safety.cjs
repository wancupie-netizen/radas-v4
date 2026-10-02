// Isolated test database only. Exports a driver-neutral suite for real PostgreSQL multi-session checks.
const assert=require('node:assert/strict');const fs=require('node:fs');const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const uid='33333333-3333-4333-8333-333333333333';const other='44444444-4444-4444-8444-444444444444';
const spec={hash:'c'.repeat(64),mode:'text',prompt:'A safe fixture',orientation:'portrait',resolution:720};
async function runSafetyChecks(db){
 const schemas=(await db.query("select count(*)::int as n from (select 1 from pg_namespace where nspname not in ('public','information_schema') and nspname not like 'pg_%' union all select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' union all select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') existing_objects")).rows[0].n;
 if(schemas!==0)throw new Error('TEST_DATABASE_MUST_BE_EMPTY');
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
 insert into auth.users values('${uid}'),('${other}');`);
 for(const suffix of ['_credit_engine.sql','_generation_flow.sql']){
  const file=fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix));await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 }
 // Retain an old Phase 06 ambiguous record across the migration, with no rewrite/refund.
 await db.as('service_role',null,'select public.radas_v4_credit_apply($1,$2,$3)',[other,'topup','fixture-paid-other']);
 const legacy=randomUUID();await db.as('service_role',null,'select public.radas_v4_generation_operation($1,$2,$3,$4)',['reserve',other,legacy,spec]);
 await db.query("update radas_v4.generations set status='unknown' where id=$1",[legacy]);
 const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_credit_safety.sql'));
 await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 async function op(action,id,data={},user=uid){return(await db.as('service_role',null,'select public.radas_v4_generation_operation($1,$2,$3,$4) as result',[action,user,id,data])).rows[0].result;}
 async function credit(type,reference,user=uid){return(await db.as('service_role',null,'select public.radas_v4_credit_apply($1,$2,$3) as result',[user,type,reference])).rows[0].result;}
 const legacyAfter=await op('read',legacy,{},other);assert.equal(legacyAfter.status,'unknown');assert.equal(legacyAfter.refunded,false);await assert.rejects(credit('refund',legacy,other),/generation_refund_not_allowed/);
 for(const role of ['anon','authenticated'])await assert.rejects(db.as(role,uid,'select public.radas_v4_generation_operation($1,$2,$3,$4)',['claim',uid,randomUUID(),{claimToken:randomUUID()}]),/permission denied/);
 await assert.rejects(db.as('service_role',null,'update radas_v4.generations set refunded=true'),/permission denied/);
 await credit('topup','fixture-paid-main');
 // Leave exactly one credit; concurrent reserve attempts must never overspend it.
 for(let i=0;i<59;i++)await credit('debit','fixture-spend-'+i);
 let id=randomUUID();const repeat=await Promise.all(Array.from({length:20},()=>op('reserve',id,spec)));
 assert.equal(repeat.filter(x=>x.created).length,1);assert.ok(repeat.every(x=>x.status==='reserved'));
 assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[uid])).rows[0].balance,0);
 assert.equal((await op('reserve',id,{...spec,hash:'d'.repeat(64)})).error,'request_conflict');
 const tokens=Array.from({length:20},()=>randomUUID());const claims=await Promise.all(tokens.map(claimToken=>op('claim',id,{claimToken})));
 assert.equal(claims.filter(x=>x.claimAllowed).length,1);const token=tokens[claims.findIndex(x=>x.claimAllowed)];
 assert.equal((await op('claim',id,{claimToken:token})).claimAllowed,true);
 assert.equal((await op('claim',id,{claimToken:randomUUID()})).claimAllowed,false);
 await assert.rejects(op('transition',id,{status:'queued',providerJobId:'bad-owner',claimToken:randomUUID()}),/claim_owner_required/);
 await assert.rejects(credit('refund',id),/generation_refund_not_allowed/);
 await assert.rejects(credit('debit',id,other),/generation_reference_owner_conflict/);
 assert.equal((await op('reserve',randomUUID(),spec)).error,'active_generation');
 console.log('PASS same-ID burst: one debit; twenty competing private claims: one winner; owner and refund guards');
 await op('transition',id,{status:'queued',providerJobId:'safety-job-1',claimToken:token});
 // Refund and terminal state must roll back together if the wallet write fails.
 await db.exec(`create function radas_v4.fixture_refund_failure() returns trigger language plpgsql as $$begin if new.balance>old.balance then raise exception 'fixture_refund_failure';end if;return new;end$$;
 create trigger fixture_refund_failure before update on radas_v4.credit_wallets for each row execute function radas_v4.fixture_refund_failure();`);
 await assert.rejects(op('transition',id,{status:'failed',providerJobId:'safety-job-1'}),/fixture_refund_failure/);
 assert.equal((await op('read',id)).status,'queued');assert.equal((await op('read',id)).refunded,false);
 assert.equal((await db.query("select count(*)::int as n from radas_v4.credit_transactions where type='refund' and reference=$1",[id])).rows[0].n,0);
 await db.exec('drop trigger fixture_refund_failure on radas_v4.credit_wallets;drop function radas_v4.fixture_refund_failure();');
 await Promise.all(Array.from({length:20},()=>op('transition',id,{status:'failed',providerJobId:'safety-job-1'})));
 assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[uid])).rows[0].balance,1);
 assert.equal((await db.query("select count(*)::int as n from radas_v4.credit_transactions where type='refund' and reference=$1",[id])).rows[0].n,1);
 console.log('PASS refund write failure rolls back job, ledger and wallet; twenty failed notifications refund exactly once');
 // Different IDs still serialize the same wallet and cannot create a second active generation.
 const distinct=await Promise.all(Array.from({length:20},()=>op('reserve',randomUUID(),spec)));
 assert.equal(distinct.filter(x=>x.created).length,1);assert.equal(distinct.filter(x=>x.error==='active_generation').length,19);
 id=distinct.find(x=>x.created).id;
 await db.query("update radas_v4.generations set created_at=clock_timestamp()-interval '3 minutes' where id=$1",[id]);
 const released=await op('read',id);assert.equal(released.status,'rejected');assert.equal(released.refunded,true);
 assert.equal((await op('claim',id,{claimToken:randomUUID()})).claimAllowed,false);
 // Expired reserved state can release a slot atomically when a fresh ID arrives.
 let fresh=randomUUID();await op('reserve',fresh,spec);await db.query("update radas_v4.generations set created_at=clock_timestamp()-interval '3 minutes' where id=$1",[fresh]);
 const next=randomUUID();assert.equal((await op('reserve',next,spec)).created,true);assert.equal((await op('read',fresh)).refunded,true);
 const nextToken=randomUUID();await op('claim',next,{claimToken:nextToken});
 await db.query("update radas_v4.generations set updated_at=clock_timestamp()-interval '3 minutes' where id=$1",[next]);
 const uncertain=await op('read',next);assert.equal(uncertain.status,'unknown');assert.equal(uncertain.refunded,false);
 await assert.rejects(credit('refund',next),/generation_refund_not_allowed/);
 assert.equal((await op('claim',next,{claimToken:nextToken})).claimAllowed,false);
 console.log('PASS distinct-ID concurrency; stale unclaimed reservation refunds/releases; claimed/legacy uncertainty never refunds or reclaims');
 const verification=await db.query(fs.readFileSync('supabase/verify-credit-safety.sql','utf8'));assert.ok(verification.rows.every(x=>x.passed),JSON.stringify(verification.rows));
 const before=(await db.query('select count(*)::int as n from radas_v4.credit_transactions')).rows[0].n;
 await assert.rejects(db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8')),/phase07_already_installed/);await db.exec('rollback');
 assert.equal((await db.query('select count(*)::int as n from radas_v4.credit_transactions')).rows[0].n,before);
 console.log('PASS schema verification, ledger reconciliation and migration rerun protection');
}
module.exports={runSafetyChecks};
if(require.main===module){
 const db=new PGlite();let queue=Promise.resolve();
 const adapter={query:(...args)=>db.query(...args),exec:sql=>db.exec(sql),as:(role,sub,sql,args)=>{
  const task=queue.then(async()=>{await db.exec('begin');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,...(sub?{sub}:{})})]);await db.exec(`set local role ${role}`);const result=await db.query(sql,args);await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}});queue=task.catch(()=>{});return task;
 }};
 runSafetyChecks(adapter).then(()=>console.log('PGLITE_SAFETY=PASS (queued connection; real multi-session verification is separate)')).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
}
