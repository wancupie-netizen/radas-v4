// Actual isolated SQL + runner/route/instrumentation code; Storage API is a mocked HTTP client.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');const {randomUUID}=require('node:crypto');const {PGlite}=require('@electric-sql/pglite');const {installStorage}=require('./storage-fixture.cjs');
const uid='77777777-7777-4777-8777-777777777777';let db,failRemove=false,loseRemove=false,partialRemove=false,malformed=false,loseClaim=false,leaseRace=false;const removed=[];let runnerClient;
async function actor(role){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:uid})]);await db.exec(`set role ${role}`);}
async function sql(action,token=null,paths=[],count=0,status='ok'){return(await db.query('select public.radas_v4_cleanup_operation($1,$2,$3,$4,$5) as result',[action,token,JSON.stringify(paths),count,status])).rows[0].result;}
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module=new Module(file);cache.set(file,module);module.filename=file;const native=Module.createRequire(file);module.require=name=>{
 if(name==='server-only')return {};if(name==='@supabase/supabase-js')return {createClient:()=>runnerClient};
 const resolved=name.startsWith('@/')?path.resolve('src',name.slice(2)+'.ts'):name.startsWith('.')?path.resolve(path.dirname(file),name+'.ts'):null;return resolved?load(resolved):native(name);
};module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return module.exports;}
async function addObject(name,bucket='radas-v4-videos',age='1 hour'){await db.query('insert into storage.objects(bucket_id,name,created_at) values($1,$2,clock_timestamp()-$3::interval)',[bucket,name,age]);}
async function completed(expired){const id=randomUUID(),token=randomUUID(),spec={hash:'f'.repeat(64),mode:'text',prompt:'Cleanup fixture',orientation:'portrait',resolution:720};
 for(const [action,data]of [['reserve',spec],['claim',{claimToken:token}],['transition',{status:'queued',providerJobId:id,claimToken:token}],['transition',{status:'done',providerJobId:id}]])await db.query('select public.radas_v4_generation_operation($1,$2,$3,$4)',[action,uid,id,JSON.stringify(data)]);
 await db.query('select public.radas_v4_video_object_operation($1,$2,$3,$4)',['mark',uid,id,24]);
 await db.exec('reset role');if(expired)await db.query("update radas_v4.generations set created_at=clock_timestamp()-interval '13 hours',expires_at=clock_timestamp()-interval '1 hour' where id=$1",[id]);
 await addObject(uid+'/'+id+'.mp4');await actor('service_role');return id;}
(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;insert into auth.users values('${uid}');`);
 for(const suffix of ['_credit_engine.sql','_generation_flow.sql','_credit_safety.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
 await installStorage(db);await db.exec('alter table storage.objects add column created_at timestamptz not null default clock_timestamp();');
 const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_auto_cleanup.sql'));await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 for(const role of ['anon','authenticated']){await actor(role);await assert.rejects(sql('inspect'),/permission denied/);await assert.rejects(db.query('select * from radas_v4.cleanup_state'),/permission denied/);}
 await actor('service_role');await assert.rejects(db.query('update radas_v4.cleanup_state set lease_token=null'),/permission denied/);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated'})]);await assert.rejects(sql('claim',randomUUID()),/server_only/);await actor('service_role');
 await db.query('select public.radas_v4_credit_apply($1,$2,$3)',[uid,'topup','fixture-paid-cleanup']);
 const live=await completed(false),expired=await completed(true),orphan=uid+'/'+randomUUID()+'.mp4',freshOrphan=uid+'/'+randomUUID()+'.mp4';
 await db.exec('reset role');await addObject(orphan,'radas-v4-videos','13 hours');await addObject(freshOrphan);await addObject('unknown-file.mp4','radas-v4-videos','20 hours');await addObject(uid+'/'+expired+'.mp4','legacy-app','20 hours');
 const wrongOwner='88888888-8888-4888-8888-888888888888/'+expired+'.mp4';await addObject(wrongOwner,'radas-v4-videos','20 hours');await actor('service_role');
 const before=(await sql('inspect'));assert.equal(before.eligible,2);assert.equal(before.busy,false);
 const token=randomUUID();assert.equal((await sql('claim',token)).claimed,true);assert.equal((await sql('claim',randomUUID())).claimed,false);assert.equal((await sql('claim',token)).claimed,true);
 await assert.rejects(sql('batch',randomUUID()),/cleanup_lease_lost/);assert.deepEqual(new Set((await sql('batch',token)).paths),new Set([uid+'/'+expired+'.mp4',orphan]));
 assert.equal((await sql('ack',token,[uid+'/'+expired+'.mp4'])).remaining,1);await sql('finish',token);
 console.log('PASS service-only SQL, canonical/owner/bucket/orphan-age eligibility, lease exclusivity and no metadata ack before physical deletion');
 runnerClient={rpc:async(name,a)=>{assert.equal(name,'radas_v4_cleanup_operation');try{let data=await sql(a.p_action,a.p_token,a.p_paths,a.p_removed,a.p_status);if(a.p_action==='claim'&&loseClaim){loseClaim=false;throw new Error('lost committed claim');}if(malformed&&a.p_action==='batch')data.paths=['../legacy-app/file.mp4'];return {data,error:null};}catch(error){return {data:null,error};}},storage:{from(bucket){assert.equal(bucket,'radas-v4-videos');return {remove:async paths=>{
  if(failRemove)return {error:{message:'fixture private secret'}};
  if(leaseRace){leaseRace=false;await db.exec('reset role');await db.query("update radas_v4.cleanup_state set lease_until=clock_timestamp()-interval '1 second'");await actor('service_role');await sql('claim',randomUUID());}
  if(!partialRemove){await db.exec('reset role');for(const p of paths){removed.push(p);await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[bucket,p]);}await actor('service_role');}
  if(loseRemove){loseRemove=false;return {error:{message:'lost successful deletion'}};}return {data:[],error:null};
 }}}}};
 const {createCleanupRunner}=load('src/lib/cleanup/run.ts');const runner=createCleanupRunner(runnerClient);
 failRemove=true;await assert.rejects(runner.run(),/cleanup_storage/);failRemove=false;assert.equal((await runner.inspect()).eligible,2);
 malformed=true;await assert.rejects(runner.run(),/cleanup_response/);malformed=false;assert.equal(removed.length,0);
 partialRemove=true;await assert.rejects(runner.run(),/cleanup_unconfirmed/);partialRemove=false;
 loseClaim=true;let result=await runner.run();assert.equal(result.status,'ok');assert.equal(result.removed,2);assert.equal((await runner.inspect()).eligible,0);assert.equal((await runner.run()).removed,0);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from radas_v4.video_objects where generation_id=$1',[expired])).rows[0].n,0);assert.equal((await db.query('select count(*)::int as n from radas_v4.video_objects where generation_id=$1',[live])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n,5);await actor('service_role');
 const lost=await completed(true);loseRemove=true;await assert.rejects(runner.run(),/cleanup_storage/);result=await runner.run();assert.equal(result.metadataPruned,1);
 const raced=await completed(true);leaseRace=true;await assert.rejects(runner.run(),/cleanup_database/);await db.exec('reset role');await db.query("update radas_v4.cleanup_state set lease_until=clock_timestamp()-interval '1 second'");await actor('service_role');assert.equal((await runner.run()).metadataPruned,1);
 console.log('PASS Storage errors/malformed batches preserve objects, partial deletion requires confirmation, retries recover lost claim/delete response; expired lease cannot ack another worker');
 // More than one batch, including pre-expiry uploads that arrived late, never delete active output.
 await db.exec('reset role');for(let i=0;i<105;i++)await addObject(uid+'/'+randomUUID()+'.mp4','radas-v4-videos','13 hours');await actor('service_role');result=await runner.run();assert.equal(result.removed,105);assert.equal(result.status,'ok');
 const dryBefore=JSON.stringify(await sql('inspect'));await runner.inspect();assert.equal(JSON.stringify(await sql('inspect')),dryBefore);
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fyqvvkpzcwrmyozxlqkw.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-server-key';process.env.CRON_SECRET='a'.repeat(64);process.env.RADAS_CLEANUP_ENABLED='true';
 const GET=load('src/app/api/internal/cleanup/route.ts').GET;const req=(query='',auth='Bearer '+process.env.CRON_SECRET)=>new Request('http://localhost:3000/api/internal/cleanup'+query,{headers:auth?{authorization:auth}:{}});
 assert.equal((await GET(req('',null))).status,401);assert.equal((await GET(req('', 'Bearer wrong'))).status,401);assert.equal((await GET(req('?paths=legacy'))).status,400);assert.equal((await GET(req('?dryRun=0'))).status,400);
 let response=await GET(req('?dryRun=1'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal((await response.json()).eligible,0);assert.equal((await GET(req())).status,200);
 process.env.RADAS_CLEANUP_ENABLED='false';assert.equal((await GET(req())).status,503);delete process.env.CRON_SECRET;assert.equal((await GET(req())).status,503);
 console.log('PASS bounded multi-batch cleanup, read-only dry run and cron route secret/enable/query protections; no cookies authorize cleanup');
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from radas_v4.generations')).rows[0].n,4);assert.equal((await db.query("select count(*)::int as n from radas_v4.credit_transactions where type='refund'")).rows[0].n,0);
 const checks=await db.query(fs.readFileSync('supabase/verify-auto-cleanup.sql','utf8'));assert.ok(checks.rows.every(x=>x.passed),JSON.stringify(checks.rows));
 await assert.rejects(db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8')),/phase10_already_installed/);await db.exec('rollback');
 console.log('PASS ledger/wallet/generation records preserved, 12 SQL verification checks and migration rerun guard; CLEANUP_LOCAL=PASS (isolated SQL, mocked physical Storage API)');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db?.close());
