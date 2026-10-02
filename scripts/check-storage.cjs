// Actual SQL + TS storage + authenticated route code, isolated fixtures only.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');const {randomUUID}=require('node:crypto');const {installStorage,mockStorage,mp4}=require('./storage-fixture.cjs');
const uid='55555555-5555-4555-8555-555555555555',other='66666666-6666-4666-8666-666666666666';
const storage=mockStorage();let db,authUser=uid,providerReads=0,providerError=false,providerBytes=mp4,failMark=0,malicious=false;
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module=new Module(file);cache.set(file,module);module.filename=file;const native=Module.createRequire(file);
 module.require=name=>{
  if(name==='server-only')return {};
  if(name==='@supabase/supabase-js')return {createClient:()=>({storage,rpc:async(name,a)=>{try{
   let data;
   if(name==='radas_v4_video_object_operation'){
    if(a.p_action==='mark'&&failMark-->0)throw new Error('fixture metadata outage');
    data=(await db.query('select public.radas_v4_video_object_operation($1,$2,$3,$4) as result',[a.p_action,a.p_user_id,a.p_id,a.p_size])).rows[0].result;
    if(malicious&&!data.error)data.objectPath='../another-user/file.mp4';
   }else{assert.equal(name,'radas_v4_generation_operation');data=await op(a.p_action,a.p_user_id,a.p_id,a.p_data);}
   return {data,error:null};
  }catch(error){return {data:null,error};}}})};
  const resolved=name.startsWith('@/')?path.resolve('src',name.slice(2)+'.ts'):name.startsWith('.')?path.resolve(path.dirname(file),name+'.ts'):null;
  if(resolved?.split(path.sep).join('/').endsWith('/supabase/server.ts'))return {createClient:async()=>({auth:{getUser:async()=>({data:{user:authUser?{id:authUser}:null},error:null})}})};
  if(resolved?.split(path.sep).join('/').endsWith('/nexabot/client.ts'))return {createNexabotClient:()=>({downloadVideo:async()=>{providerReads++;if(providerError)throw new Error('private-provider-secret');return new Response(providerBytes,{headers:{'content-type':'video/mp4','content-length':String(providerBytes.length)}});}})};
  return resolved?load(resolved):native(name);
 };
 module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return module.exports;
}
async function actor(role){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:uid})]);await db.exec(`set role ${role}`);}
async function op(action,user,id,data={}){return(await db.query('select public.radas_v4_generation_operation($1,$2,$3,$4) as result',[action,user,id,JSON.stringify(data)])).rows[0].result;}
async function completed(user=uid){const id=randomUUID(),token=randomUUID();const spec={hash:'e'.repeat(64),mode:'text',prompt:'Storage fixture',orientation:'portrait',resolution:720};
 await op('reserve',user,id,spec);await op('claim',user,id,{claimToken:token});await op('transition',user,id,{status:'queued',providerJobId:id,claimToken:token});await op('transition',user,id,{status:'done',providerJobId:id});return id;}
(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
 insert into auth.users values('${uid}'),('${other}');`);
 for(const suffix of ['_credit_engine.sql','_generation_flow.sql','_credit_safety.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
 await installStorage(db);
 await db.exec("insert into storage.objects(bucket_id,name) values('legacy-app','legacy.mp4'),('radas-v4-videos','secret.mp4')");
 for(const role of ['anon','authenticated']){
  await actor(role);
  assert.deepEqual((await db.query('select bucket_id from storage.objects')).rows,[{bucket_id:'legacy-app'}]);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('radas-v4-videos','attack.mp4')"),/row-level security/);
  assert.equal((await db.query("update storage.objects set name='attack' where bucket_id='radas-v4-videos' returning id")).rows.length,0);
  assert.equal((await db.query("delete from storage.objects where bucket_id='radas-v4-videos' returning id")).rows.length,0);
  await assert.rejects(db.query('select public.radas_v4_video_object_operation($1,$2,$3,$4)',['read',uid,randomUUID(),null]),/permission denied/);
  await assert.rejects(db.query('select * from radas_v4.video_objects'),/permission denied/);
 }
 await actor('service_role');await assert.rejects(db.query('delete from radas_v4.video_objects'),/permission denied/);
 // Role grants alone cannot spoof the service JWT used by privileged private RPCs.
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:uid})]);
 await assert.rejects(db.query('select public.radas_v4_video_object_operation($1,$2,$3,$4)',['read',uid,randomUUID(),null]),/server_only/);await actor('service_role');
 for(const user of [uid,other])await db.query('select public.radas_v4_credit_apply($1,$2,$3)',[user,'topup','fixture-paid-'+user]);
 console.log('PASS restrictive policies block browser reads/writes despite permissive legacy policy; legacy bucket unchanged; RPC/service JWT and private metadata enforced');
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-server-secret';process.env.RADAS_GENERATION_ENABLED='true';
 const {createVideoStorage,readProviderVideo,validateMp4,VIDEO_MAX_BYTES}=load('src/lib/storage/video.ts');const store=createVideoStorage();const VIDEO=load('src/app/api/generations/[id]/video/route.ts').GET;
 const video=(id,signal)=>VIDEO(new Request('http://localhost:3000/api/generations/'+id+'/video',{signal}),{params:Promise.resolve({id})});
 let id=await completed(),objectPath=uid+'/'+id+'.mp4';
 authUser=null;assert.equal((await video(id)).status,401);authUser=other;assert.equal((await video(id)).status,404);authUser=uid;assert.equal(providerReads,0);assert.equal(storage.uploads,0);
 let response=await video(id);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),mp4);assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal(response.headers.has('location'),false);assert.equal(response.headers.get('content-length'),String(mp4.length));
 const reads=providerReads,uploads=storage.uploads;providerError=true;
 response=await video(id);assert.equal(response.status,200);assert.equal(providerReads,reads);assert.equal(storage.uploads,uploads);providerError=false;
 assert.ok(storage.objects.has(objectPath));
 console.log('PASS real video route: verified auth/ownership, private output, fixed key, immutable upload, cached playback survives provider outage');
 storage.objects.delete(objectPath);assert.equal((await video(id)).status,503);assert.equal(providerReads,reads);storage.objects.set(objectPath,mp4);
 id=await completed();storage.uploadError=true;assert.equal((await video(id)).status,503);storage.uploadError=false;assert.equal((await video(id)).status,200);
 id=await completed();storage.loseUpload=true;assert.equal((await video(id)).status,200);
 id=await completed();failMark=1;assert.equal((await video(id)).status,503);const readsAfterUpload=providerReads;assert.equal((await video(id)).status,200);assert.equal(providerReads,readsAfterUpload);
 id=await completed();const burst=await Promise.all(Array.from({length:8},()=>store.ensure(uid,id,new AbortController().signal)));assert.ok(burst.every(x=>Buffer.from(x).equals(mp4)));assert.equal(storage.objects.get(uid+'/'+id+'.mp4').length,mp4.length);
 const rows=await db.query('select public.radas_v4_video_object_operation($1,$2,$3,$4) as result',['mark',uid,id,mp4.length]);assert.equal(rows.rows[0].result.stored,true);
 malicious=true;assert.equal((await video(id)).status,503);malicious=false;
 storage.downloadError=true;assert.equal((await video(id)).status,503);storage.downloadError=false;
 console.log('PASS storage outage retry, lost upload response, orphan recovery after metadata outage, concurrent no-overwrite uploads, malformed metadata fail closed');
 id=await completed();const beforeExpiredReads=providerReads,beforeExpiredUploads=storage.uploads;
 await db.exec('reset role');await db.query("update radas_v4.generations set created_at=clock_timestamp()-interval '13 hours',expires_at=clock_timestamp()-interval '1 hour' where id=$1",[id]);await actor('service_role');assert.equal((await video(id)).status,410);assert.equal(providerReads,beforeExpiredReads);assert.equal(storage.uploads,beforeExpiredUploads);
 const cancelled=new AbortController();cancelled.abort();id=await completed();assert.equal((await video(id,cancelled.signal)).status,503);
 providerBytes=Buffer.from('not an mp4');assert.equal((await video(id)).status,503);assert.equal(storage.objects.has(uid+'/'+id+'.mp4'),false);providerBytes=mp4;
 const expiry=new Date(Date.now()+60000).toISOString();const signal=new AbortController().signal;
 await assert.rejects(readProviderVideo(new Response(mp4,{headers:{'content-type':'video/mp4','content-length':String(VIDEO_MAX_BYTES+1)}}),signal,expiry),/video_unavailable/);
 await assert.rejects(readProviderVideo(new Response(mp4,{headers:{'content-type':'text/html'}}),signal,expiry),/video_unavailable/);
 await assert.rejects(readProviderVideo(new Response(mp4,{headers:{'content-type':'video/mp4','content-length':String(mp4.length+1)}}),signal,expiry),/video_unavailable/);
 const oversized=new ReadableStream({start(c){c.enqueue(new Uint8Array(VIDEO_MAX_BYTES+1));c.close();}});
 await assert.rejects(readProviderVideo(new Response(oversized,{headers:{'content-type':'video/mp4'}}),signal,expiry),/video_unavailable/);
 const during=new AbortController();const stalled=new ReadableStream({start(c){c.enqueue(mp4);}});const pending=readProviderVideo(new Response(stalled,{headers:{'content-type':'video/mp4'}}),during.signal,expiry);setTimeout(()=>during.abort(),10);await assert.rejects(pending,/video_unavailable/);
 validateMp4(mp4);await assert.rejects(readProviderVideo(new Response(mp4,{headers:{'content-type':'video/mp4'}}),signal,new Date(Date.now()-1).toISOString()),/expired/);
 console.log('PASS expiry before storage/provider access, abort and mid-stream cancellation, MIME/header/length/size validation; no invalid upload');
 await db.exec('reset role');const verify=await db.query(fs.readFileSync('supabase/verify-video-storage.sql','utf8'));assert.ok(verify.rows.every(x=>x.passed),JSON.stringify(verify.rows));
 assert.equal((await db.query("select count(*)::int as n from radas_v4.credit_transactions where type='refund'")).rows[0].n,0);
 const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_temporary_video_storage.sql'));await assert.rejects(db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8')),/phase08_already_installed/);await db.exec('rollback');
 console.log('PASS 13 verification checks, unchanged credit billing/refunds, rerun guard; STORAGE_LOCAL=PASS (mock Storage HTTP, real isolated SQL/TS/routes)');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db?.close());
