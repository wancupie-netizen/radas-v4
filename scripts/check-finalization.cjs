// Actual SQL + runner + storage + authenticated route, all network/provider/storage fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite'),{randomUUID}=require('node:crypto');
const {installStorage,mockStorage,mp4}=require('./storage-fixture.cjs');
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const storage=mockStorage();let db,providerReads=0,polls=0,failMark=0,pollError=false,bodyError=false,unsafe=false,authUser=uid;
class NexabotError extends Error{constructor(code){super(code);this.code=code;}}
const statuses=new Map();
const provider={getJob:async id=>{polls++;if(pollError)throw new NexabotError('HTTP_404');return {jobId:id,status:statuses.get(id)??'done'};},downloadVideo:async()=>{
 providerReads++;if(unsafe)throw new NexabotError('UNSAFE_DOWNLOAD_REDIRECT');
 const body=bodyError?new ReadableStream({start(c){c.enqueue(mp4);c.error(new Error('fixture interrupted'));}}):mp4;
 return new Response(body,{headers:{'content-type':'video/mp4','content-length':String(mp4.length)}});
}};
async function sql(action,user=null,id=null,token=null){return(await db.query('select public.radas_v4_finalization_operation($1,$2,$3,$4) as result',[action,user,id,token])).rows[0].result;}
async function op(action,user,id,data={}){return(await db.query('select public.radas_v4_generation_operation($1,$2,$3,$4) as result',[action,user,id,JSON.stringify(data)])).rows[0].result;}
async function actor(role){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:uid})]);await db.exec('set role '+role);}
async function admin(query,args=[]){await db.exec('reset role');const r=await db.query(query,args);await actor('service_role');return r;}
async function due(id){await admin("update radas_v4.video_finalizations set next_attempt_at=clock_timestamp()-interval '1 second' where generation_id=$1",[id]);}
async function task(id){return(await admin('select * from radas_v4.video_finalizations where generation_id=$1',[id])).rows[0];}
const client={storage,rpc:async(name,a)=>{try{
 if(name==='radas_v4_finalization_operation')return {data:await sql(a.p_action,a.p_user_id,a.p_id,a.p_token),error:null};
 if(name==='radas_v4_video_object_operation'){
  if(a.p_action==='mark'&&failMark-->0)throw new Error('fixture metadata failure');
  return {data:(await db.query('select public.radas_v4_video_object_operation($1,$2,$3,$4) as result',[a.p_action,a.p_user_id,a.p_id,a.p_size])).rows[0].result,error:null};
 }
 assert.equal(name,'radas_v4_generation_operation');return {data:await op(a.p_action,a.p_user_id,a.p_id,a.p_data),error:null};
}catch(error){return {data:null,error};}}};
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;const native=Module.createRequire(file);
 m.require=name=>{
  if(name==='server-only')return {};
  if(name==='@supabase/supabase-js')return {createClient:()=>client};
  const resolved=name.startsWith('@/')?path.resolve('src',name.slice(2)+'.ts'):name.startsWith('.')?path.resolve(path.dirname(file),name+'.ts'):null;
  if(resolved?.split(path.sep).join('/').endsWith('/nexabot/client.ts'))return {createNexabotClient:()=>provider,NexabotError};
  if(resolved?.split(path.sep).join('/').endsWith('/supabase/server.ts'))return {createClient:async()=>({auth:{getUser:async()=>({data:{user:authUser?{id:authUser}:null},error:null})}})};
  return resolved?load(resolved):native(name);
 };
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;
}
async function generation(done=false,user=uid){const id=randomUUID(),token=randomUUID();await op('reserve',user,id,{hash:'d'.repeat(64),mode:'text',prompt:'Private fixture',orientation:'portrait',resolution:720});await op('claim',user,id,{claimToken:token});await op('transition',user,id,{status:'queued',providerJobId:id,claimToken:token});if(done)await op('transition',user,id,{status:'done',providerJobId:id});return id;}
(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
 insert into auth.users values('${uid}'),('${other}');`);
 for(const suffix of ['_credit_engine.sql','_generation_flow.sql','_credit_safety.sql','_ingredients_mode.sql','_release_expired_unknown.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
 await installStorage(db);await db.exec('create table radas_v4.payment_admins(user_id uuid primary key references auth.users(id));');await db.exec(fs.readFileSync('supabase/admin-release-install.sql','utf8'));await db.exec(fs.readFileSync('supabase/auto-release-install.sql','utf8'));
 const defs=async()=>(await db.query("select proname,pg_get_functiondef(oid) as definition from pg_proc where oid in ('radas_v4.generation_operation(text,uuid,uuid,jsonb)'::regprocedure,'radas_v4.credit_apply(uuid,text,text)'::regprocedure,'radas_v4.video_object_operation(text,uuid,uuid,bigint)'::regprocedure) order by proname")).rows;
 const before=await defs();const migration='supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_video_finalization.sql'));await db.exec(fs.readFileSync(migration,'utf8'));assert.deepEqual(await defs(),before);
 for(const role of ['anon','authenticated']){await actor(role);await assert.rejects(sql('claim',null,null,randomUUID()),/permission denied/);await assert.rejects(db.query('select * from radas_v4.video_finalizations'),/permission denied/);}
 await actor('service_role');await assert.rejects(db.query('delete from radas_v4.video_finalizations'),/permission denied/);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated'})]);await assert.rejects(sql('claim',null,null,randomUUID()),/server_only/);await actor('service_role');
 for(const user of [uid,other])await db.query('select public.radas_v4_credit_apply($1,$2,$3)',[user,'topup','fixture-paid-'+user]);
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://fyqvvkpzcwrmyozxlqkw.supabase.co',SUPABASE_SECRET_KEY:'fixture-key',RADAS_GENERATION_ENABLED:'true',RADAS_FINALIZATION_ENABLED:'true'});
 const {createVideoStorage}=load('src/lib/storage/video.ts');const {createFinalizationRunner}=load('src/lib/finalization/runner.ts');const {createGenerationStore}=load('src/lib/generations/store.ts');
 const runner=()=>createFinalizationRunner({client,provider,store:createGenerationStore(),storage:(signal,guard)=>createVideoStorage({signal,guard})});
 const state=id=>sql('state',uid,id);const VIDEO=load('src/app/api/generations/[id]/video/route.ts').GET;
 const video=id=>VIDEO(new Request('http://localhost/api/generations/'+id+'/video'),{params:Promise.resolve({id})});
 let id=await generation();const reads=providerReads;assert.equal((await video(id)).status,409);assert.equal(providerReads,reads);
 // No browser status/preview request is used to complete this job.
 await runner().tick();assert.equal((await state(id)).videoState,'ready');assert.equal((await task(id)).state,'ready');assert.ok(storage.objects.has(uid+'/'+id+'.mp4'));assert.equal((await video(id)).status,200);
 const savedReads=providerReads;pollError=true;unsafe=true;assert.equal((await video(id)).status,200);assert.equal(providerReads,savedReads);pollError=false;unsafe=false;
 authUser=other;assert.equal((await video(id)).status,404);assert.equal((await sql('history',other)).items.length,0);authUser=null;assert.equal((await video(id)).status,401);authUser=uid;
 console.log('PASS server-only migration preserves live function definitions; worker completes with no browser; authenticated stored playback survives provider outage');
 for(const failure of ['body','upload','metadata','lostUpload']){
  id=await generation(true);const n=providerReads;
  bodyError=failure==='body';storage.uploadError=failure==='upload';failMark=failure==='metadata'?1:0;storage.loseUpload=failure==='lostUpload';
  await runner().tick();bodyError=false;storage.uploadError=false;
  if(failure!=='lostUpload'){assert.equal((await task(id)).state,'retry');await due(id);await runner().tick();}
  assert.equal((await state(id)).videoState,'ready');
  if(failure==='metadata')assert.equal(providerReads,n+1,'existing immutable object must avoid provider redownload');
 }
 console.log('PASS interrupted provider body, transient upload, lost upload response and metadata outage recover using original job and immutable object');
 id=await generation(true);const token=randomUUID();let claim=await sql('claim',null,null,token);assert.equal(claim.id,id);
 const rivals=await Promise.all(Array.from({length:8},()=>sql('claim',null,null,randomUUID())));assert.ok(rivals.every(x=>x.claimed===false));
 await admin("update radas_v4.video_finalizations set lease_until=clock_timestamp()-interval '1 second' where generation_id=$1",[id]);
 const newer=randomUUID();claim=await sql('claim',null,null,newer);assert.equal(claim.id,id);assert.equal((await sql('guard',uid,id,token)).valid,false);assert.equal((await sql('ready',uid,id,token)).applied,false);await sql('retry',uid,id,newer);await due(id);await runner().tick();assert.equal((await state(id)).videoState,'ready');
 console.log('PASS competing claims serialize; new runner resumes an expired crash lease; old token cannot acknowledge completion');
 id=await generation();pollError=true;await runner().tick();assert.equal((await op('read',uid,id)).status,'queued');assert.equal((await task(id)).state,'retry');
 for(let i=0;i<4;i++){await due(id);await runner().tick();}assert.equal((await task(id)).state,'needs_review');assert.equal((await op('read',uid,id)).refunded,false);
 // Expire the unresolved fixture so it does not prevent subsequent test reservations.
 await admin("update radas_v4.generations set created_at=clock_timestamp()-interval '13 hours',expires_at=clock_timestamp()-interval '1 hour' where id=$1",[id]);
 assert.equal((await state(id)).videoState,'expired');const countPoll=polls;await runner().tick();assert.equal(polls,countPoll);pollError=false;
 assert.equal((await op('reserve',uid,randomUUID(),{hash:'e'.repeat(64),mode:'text',prompt:'New fixture',orientation:'portrait',resolution:720})).error,'active_generation');
 console.log('PASS repeated provider 404 is bounded and audited; no automatic failure/refund; expired job is not downloaded (slot policy deliberately unchanged)');
 id=await generation(true,other);unsafe=true;await runner().tick();unsafe=false;assert.equal((await task(id)).state,'needs_review');
 const totals=await admin('select count(*)::int as n from radas_v4.generations');
 const credits=await admin("select type,count(*)::int as n from radas_v4.credit_transactions group by type");assert.equal(credits.rows.find(x=>x.type==='refund'),undefined);assert.equal(credits.rows.find(x=>x.type==='debit').n,totals.rows[0].n);
 const list=(await sql('history',uid)).items;assert.ok(list.length>0);assert.ok(list.every(x=>x.generation.status==='done'&&x.id!==id));
 const HISTORY=load('src/app/api/generations/route.ts').GET;authUser=null;assert.equal((await HISTORY()).status,401);authUser=other;const owned=await (await HISTORY()).json();assert.ok(owned.items.every(x=>x.id===id));authUser=uid;assert.equal((await HISTORY()).status,200);
 const {shouldPollGeneration,parseGeneration}=load('src/lib/generations/types.ts');const g=list[0].generation;assert.equal(shouldPollGeneration({...g,videoState:'finalizing'}),true);assert.equal(shouldPollGeneration({...g,videoState:'ready'}),false);assert.throws(()=>parseGeneration({...g,videoState:'invented'}),/invalid_video_state/);
 console.log('PASS unsafe redirect needs review; no new provider POST/debit/refund; owned history and separate finalization polling states');
 // Separately reviewed slot policy: no expiry extension, status rewrite, provider call or refund.
 await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_expired_generation_slot_release.sql')),'utf8'));await actor('service_role');
 const expiredRows=await admin("select id from radas_v4.generations where user_id=$1 and status='queued' and expires_at<clock_timestamp()",[uid]);
 const expiredId=expiredRows.rows[0].id;const released=await op('read',uid,expiredId);assert.ok(released.slotReleasedAt);assert.equal(released.status,'queued');assert.equal(released.refunded,false);assert.equal(released.pollAllowed,false);
 const nextId=await generation();assert.equal((await op('read',uid,nextId)).status,'queued');
 await assert.rejects(op('transition',uid,expiredId,{status:'failed',providerJobId:expiredId}),/expired_known_read_only/);
 assert.equal((await op('reserve',uid,randomUUID(),{hash:'f'.repeat(64),mode:'text',prompt:'Competing request',orientation:'portrait',resolution:720})).error,'active_generation');
 const after=await admin("select count(*)::int as n from radas_v4.credit_transactions where type='refund'");assert.equal(after.rows[0].n,0);
 const parsed=parseGeneration(released);assert.equal(shouldPollGeneration(parsed),false);assert.equal(load('src/lib/generations/types.ts').canGenerateAgain(parsed),true);
 console.log('PASS reviewed expiry slot migration releases known expired request exactly once without refund/status rewrite; a new job remains exclusively active');
 const failed=await generation(false,other);statuses.set(failed,'failed');await runner().tick();await runner().tick();
 const confirmed=await op('read',other,failed);assert.equal(confirmed.status,'failed');assert.equal(confirmed.refunded,true);
 await runner().tick();const refunds=await admin("select count(*)::int as n from radas_v4.credit_transactions where type='refund' and reference=$1",[failed]);assert.equal(refunds.rows[0].n,1);
 console.log('PASS genuine provider failure uses existing atomic refund path exactly once; polling/expiry failures never enter it');


 await db.close();console.log('FINALIZATION_LOCAL=PASS (PGlite + real TS/SQL; mocked Storage/provider; not multi-session PostgreSQL or live paid generation)');
})().catch(error=>{console.error(error);process.exitCode=1;});
