// Isolated SQL only. Never connects to Supabase or NexaBot.
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const {installStorage}=require('./storage-fixture.cjs');
(async()=>{const db=new PGlite();try{
 const admin=randomUUID(),user=randomUUID(),other=randomUUID();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.jwt(),auth.uid() to anon,authenticated,service_role;`);
 await db.query("insert into auth.users values($1,'wancupie@gmail.com',clock_timestamp()),($2,'fixture@example.test',clock_timestamp()),($3,'other@example.test',clock_timestamp())",[admin,user,other]);
 for(const file of fs.readdirSync('supabase/migrations').sort()){
  if(file.endsWith('_temporary_video_storage.sql')){await installStorage(db);await db.exec('alter table storage.objects add column created_at timestamptz default clock_timestamp()');}
  else await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 }
 async function as(role,fn){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role})]);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}}
 const op=(action,id,data={},owner=user)=>as('service_role',async()=>(await db.query('select public.radas_v4_generation_operation($1,$2,$3,$4) as result',[action,owner,id,data])).rows[0].result);
 const credit=(type,id)=>as('service_role',async()=>(await db.query('select public.radas_v4_credit_apply($1,$2,$3) as result',[user,type,id])).rows[0].result);
 // Fixture funding only: no live payment or invented production credits.
 const payment=randomUUID();
 const pay=(actor,action,reference=null,amount=null)=>as('service_role',()=>db.query('select public.radas_v4_payment_operation($1,$2,$3,$4,$5,$6,$7)',[actor,action,payment,action==='create'?'try':null,reference,amount,null]));
 await pay(user,'create');await pay(user,'submit','FIXTURE-ADMIN-RELEASE');await pay(admin,'approve','FIXTURE-ADMIN-RELEASE',500);
 const spec={hash:'a'.repeat(64),mode:'text',prompt:'fixture',orientation:'portrait',resolution:720};
 const old=randomUUID(),token=randomUUID();await op('reserve',old,spec);await op('claim',old,{claimToken:token});await op('transition',old,{status:'unknown',claimToken:token});
 const before=JSON.stringify((await db.query('select * from radas_v4.credit_transactions order by id')).rows);
 await db.exec(fs.readFileSync('supabase/admin-release-install.sql','utf8'));
 const release=(actor,id,reason='Operator knowingly releases unresolved request without refund')=>db.query('select radas_v4.admin_release_unknown($1,$2,$3) as result',[actor,id,reason]);
 assert.equal((await op('reserve',randomUUID(),spec)).error,'active_generation');
 for(const role of ['anon','authenticated','service_role'])await assert.rejects(as(role,()=>release(admin,old)),/permission denied/);
 await assert.rejects(release(other,old),/approved_admin_required/);await assert.rejects(release(admin,old,'x'),/release_reason_required/);
 assert.equal((await release(admin,old)).rows[0].result.result,'released');
 const audit=(await db.query('select admin_released_at,admin_released_by,admin_release_reason from radas_v4.generations where id=$1',[old])).rows[0];
 assert.equal((await release(admin,old)).rows[0].result.result,'already_released');
 assert.deepEqual((await db.query('select admin_released_at,admin_released_by,admin_release_reason from radas_v4.generations where id=$1',[old])).rows[0],audit);
 assert.equal(JSON.stringify((await db.query('select * from radas_v4.credit_transactions order by id')).rows),before);
 assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[user])).rows[0].balance,59);
 assert.equal((await op('reserve',old,spec)).status,'unknown');assert.equal((await op('claim',old,{claimToken:token})).claimAllowed,false);
 await assert.rejects(credit('refund',old),/generation_refund_not_allowed/);
 const fresh=randomUUID();assert.equal((await op('reserve',fresh,spec)).created,true);
 assert.equal((await op('reserve',randomUUID(),spec)).error,'active_generation');
 await assert.rejects(release(admin,fresh),/only_unknown_unresolved_allowed/);
 const freshToken=randomUUID();await op('claim',fresh,{claimToken:freshToken});await op('transition',fresh,{status:'queued',providerJobId:'fixture-job',claimToken:freshToken});await op('transition',fresh,{status:'done',providerJobId:'fixture-job'});
 assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[user])).rows[0].balance,58);
 await assert.rejects(db.query("update radas_v4.generations set status='done',provider_job_id='fabricated' where id=$1",[old]),/admin_release_consistent/);
 const checks=(await db.query(fs.readFileSync('supabase/verify-admin-release.sql','utf8'))).rows;assert.ok(checks.every(x=>x.passed),JSON.stringify(checks));
 await assert.rejects(db.exec(fs.readFileSync('supabase/admin-release-install.sql','utf8')),/admin_release_already_installed/);await db.exec('rollback');
 console.log('PASS SQL-editor-only approved admin; API roles denied; exact unresolved request; audited idempotent release; no ledger/refund changes');
 console.log('PASS original ID remains unknown and cannot reclaim; new ID charged once; one-active guard retained; normal queued/done flow; schema checks and rerun guard');
 console.log('ADMIN_RELEASE_LOCAL=PASS (isolated PGlite; no live requests or data changes)');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
