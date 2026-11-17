// Actual production Next startup + SDK HTTP. Mock gateway only; zero browser requests or live calls.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {mp4}=require('./storage-fixture.cjs');
(async()=>{
 let object=null,marked=false,ready=false,claims=0,downloaded=0,uploaded=0;
 const uid='11111111-1111-4111-8111-111111111111',id='33333333-3333-4333-8333-333333333333',objectPath=uid+'/'+id+'.mp4';
 const gateway=http.createServer(async(req,res)=>{try{
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
  const json=(code,value)=>{res.statusCode=code;res.setHeader('content-type','application/json');res.end(JSON.stringify(value));};
  if(req.url.startsWith('/supabase/'))assert.equal(req.headers.apikey,'fixture-server-key');
  if(req.url==='/supabase/rest/v1/rpc/radas_v4_finalization_operation'){
   const a=JSON.parse(body);if(a.p_action==='claim'){claims++;return json(200,ready?{claimed:false}:{claimed:true,id,userId:uid,providerJobId:'fixture-job',status:'done'});}
   if(a.p_action==='guard')return json(200,{valid:true});
   if(a.p_action==='ready'){assert.ok(object);assert.equal(marked,true);ready=true;return json(200,{applied:true});}
   throw new Error('unexpected finalization action '+a.p_action);
  }
  if(req.url==='/supabase/rest/v1/rpc/radas_v4_video_object_operation'){
   const a=JSON.parse(body);assert.equal(a.p_user_id,uid);assert.equal(a.p_id,id);if(a.p_action==='mark'){assert.ok(object);assert.equal(a.p_size,mp4.length);marked=true;}
   return json(200,{objectPath,stored:marked,sizeBytes:marked?mp4.length:null,expiresAt:new Date(Date.now()+3600000).toISOString()});
  }
  if(req.url==='/supabase/rest/v1/rpc/radas_v4_generation_operation')return json(200,{id,status:'done',providerJobId:'fixture-job',expiresAt:new Date(Date.now()+3600000).toISOString(),refunded:false,pollAllowed:false,created:false,claimAllowed:false});
  if(req.url==='/supabase/storage/v1/object/radas-v4-videos/'+objectPath){
   if(req.method==='POST'){assert.equal(req.headers['x-upsert'],'false');assert.deepEqual(body,mp4);assert.equal(object,null);object=body;uploaded++;return json(200,{Key:'radas-v4-videos/'+objectPath});}
  }
  if(req.url.includes('/storage/v1/object/')&&req.method==='GET'){
   if(!object)return json(404,{statusCode:'404',error:'not_found',message:'fixture'});
   res.setHeader('content-type','video/mp4');res.end(object);return;
  }
  if(req.url==='/provider/api/v1/jobs/fixture-job/download'){
   assert.equal(req.method,'GET');assert.equal(req.headers['x-api-key'],'nxb_FIXTURE');res.statusCode=307;res.setHeader('location','https://bwcqhtntrfntnkjokihp.supabase.co/fixture.mp4?token=fixture');res.end();return;
  }
  if(req.url==='/redirect/fixture.mp4?token=fixture'){
   assert.equal(req.headers['x-api-key'],undefined);assert.equal(req.headers.authorization,undefined);downloaded++;res.setHeader('content-type','video/mp4');res.setHeader('content-length',mp4.length);res.end(mp4);return;
  }
  throw new Error('unexpected fixture request '+req.method+' '+req.url);
 }catch(e){console.error(e);res.statusCode=500;res.end('{}');}});
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+gateway.address().port;
 const reservation=http.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'radas-finalization-runtime-')),preload=path.join(temp,'preload.cjs');
 fs.writeFileSync(preload,`const original=global.fetch;global.fetch=(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
 const routes=[['https://fyqvvkpzcwrmyozxlqkw.supabase.co',${JSON.stringify(base+'/supabase')}],['https://nexabot.id',${JSON.stringify(base+'/provider')}],['https://bwcqhtntrfntnkjokihp.supabase.co',${JSON.stringify(base+'/redirect')}]];
 for(const [from,to] of routes)if(url.startsWith(from+'/'))return original(to+url.slice(from.length),init);
 if(url.startsWith('https:'))throw new Error('fixture denies live network');return original(input,init);};`);
 const env={...process.env,NODE_OPTIONS:'--require '+JSON.stringify(preload),NEXT_PUBLIC_SUPABASE_URL:'https://fyqvvkpzcwrmyozxlqkw.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-publishable',SUPABASE_SECRET_KEY:'fixture-server-key',NEXABOT_API_KEY:'nxb_FIXTURE',RADAS_FINALIZATION_ENABLED:'true',RADAS_GENERATION_ENABLED:'true',RADAS_CLEANUP_ENABLED:'false'};
 const proc=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env,stdio:'pipe'});let logs='';proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);
 try{
  for(let i=0;i<300&&!ready;i++){if(proc.exitCode!==null)throw new Error('production server stopped '+logs);await new Promise(r=>setTimeout(r,100));}
  assert.equal(ready,true,logs);assert.equal(downloaded,1);assert.equal(uploaded,1);assert.ok(claims>=1);assert.ok(marked);
  console.log('PASS actual next start instrumentation finalizes with no browser HTTP request; actual SDK download/upload/metadata/readback; 307 credentials isolated; live network blocked');
 }finally{
  if(proc.exitCode===null){const stopped=new Promise(r=>proc.once('exit',r));if(process.platform==='win32'){const killer=spawn('taskkill',['/PID',String(proc.pid),'/T','/F'],{stdio:'ignore'});await new Promise(r=>killer.once('exit',r));}else proc.kill();await stopped;}
  await new Promise(r=>gateway.close(r));fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
