// Actual Next development instrumentation and SDK over a local mock gateway. No live deletion.
const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawn}=require('node:child_process');const {PGlite}=require('@electric-sql/pglite');const {installStorage}=require('./storage-fixture.cjs');
(async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
 for(const suffix of ['_credit_engine.sql','_generation_flow.sql','_credit_safety.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
 await installStorage(db);await db.exec('alter table storage.objects add column created_at timestamptz not null default clock_timestamp()');
 await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_auto_cleanup.sql')),'utf8'));
 const prefix='99999999-9999-4999-8999-999999999999/';const old=prefix+'11111111-1111-4111-8111-111111111111.mp4',fresh=prefix+'22222222-2222-4222-8222-222222222222.mp4';
 await db.query("insert into storage.objects(bucket_id,name,created_at) values('radas-v4-videos',$1,clock_timestamp()-interval '13 hours'),('radas-v4-videos',$2,clock_timestamp()),('legacy-app',$1,clock_timestamp()-interval '13 hours')",[old,fresh]);
 let deleted=0,serial=Promise.resolve();const gateway=http.createServer(async(req,res)=>{try{let raw='';for await(const p of req)raw+=p;res.setHeader('content-type','application/json');const send=(s,v)=>{res.statusCode=s;res.end(JSON.stringify(v));};
  assert.equal(req.headers.apikey,'fixture-server-key');
  if(req.url==='/rest/v1/rpc/radas_v4_cleanup_operation'){
   const p=JSON.parse(raw);const task=serial.then(async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);await db.exec('set role service_role');return(await db.query('select public.radas_v4_cleanup_operation($1,$2,$3,$4,$5) as result',[p.p_action,p.p_token,JSON.stringify(p.p_paths),p.p_removed,p.p_status])).rows[0].result;});serial=task.catch(()=>{});return send(200,await task);
  }
  if(req.url==='/storage/v1/object/radas-v4-videos'){
   assert.equal(req.method,'DELETE');const paths=JSON.parse(raw).prefixes;assert.deepEqual(paths,[old]);const task=serial.then(async()=>{await db.exec('reset role');for(const name of paths){await db.query("delete from storage.objects where bucket_id='radas-v4-videos' and name=$1",[name]);deleted++;}});serial=task.catch(()=>{});await task;return send(200,paths.map(name=>({name})));
  }
  return send(404,{error:'fixture'});
 }catch(error){res.statusCode=500;res.end(JSON.stringify({error:'fixture'}));console.error(error);}});
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const gatewayUrl='http://127.0.0.1:'+gateway.address().port;
 const portServer=http.createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'radas-cleanup-runtime-'));const preload=path.join(temp,'preload.cjs');
 fs.writeFileSync(preload,`const original=global.fetch;global.fetch=(input,init)=>{const value=typeof input==='string'?input:input instanceof URL?input.toString():input.url;if(value.startsWith('https://fyqvvkpzcwrmyozxlqkw.supabase.co/'))return original(value.replace('https://fyqvvkpzcwrmyozxlqkw.supabase.co',${JSON.stringify(gatewayUrl)}),init);if(value.startsWith('https:'))throw new Error('fixture denies external network');return original(input,init);};`);
 const env={...process.env,NODE_OPTIONS:'--require '+JSON.stringify(preload),NEXT_PUBLIC_SUPABASE_URL:'https://fyqvvkpzcwrmyozxlqkw.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-publishable',SUPABASE_SECRET_KEY:'fixture-server-key',CRON_SECRET:'c'.repeat(64),RADAS_CLEANUP_ENABLED:'true',RADAS_GENERATION_ENABLED:'false'};
 const proc=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env,stdio:'pipe'});let logs='';proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);
 try{
  for(let i=0;i<300&&(deleted===0||!logs.includes('RADAS_CLEANUP=OK'));i++){if(proc.exitCode!==null)throw new Error('Dev server stopped: '+logs);await new Promise(r=>setTimeout(r,100));}
  assert.equal(deleted,1,logs);assert.match(logs,/RADAS_CLEANUP=OK/);
  const url='http://127.0.0.1:'+port+'/api/internal/cleanup';assert.equal((await fetch(url)).status,401);
  let response=await fetch(url+'?dryRun=1',{headers:{authorization:'Bearer '+env.CRON_SECRET}});assert.equal(response.status,200,logs);assert.equal((await response.json()).eligible,0);
  await db.exec('reset role');assert.deepEqual(new Set((await db.query('select bucket_id,name from storage.objects')).rows.map(x=>x.bucket_id+'/'+x.name)),new Set(['radas-v4-videos/'+fresh,'legacy-app/'+old]));
  const cli=spawn(process.execPath,['scripts/run-cleanup.cjs','--check'],{cwd:process.cwd(),env,stdio:'pipe'});let out='';cli.stdout.on('data',d=>out+=d);cli.stderr.on('data',d=>out+=d);const code=await new Promise(r=>cli.once('exit',r));assert.equal(code,0,out);assert.match(out,/CLEANUP_CHECK=PASS/);assert.equal(deleted,1);
  console.log('PASS actual Next dev instrumentation auto-deletes expired fixture via actual SDK DELETE; live V4/legacy files preserved; protected real HTTP route and read-only CLI; no live network');
 }finally{
  if(proc.exitCode===null){const stopped=new Promise(r=>proc.once('exit',r));if(process.platform==='win32'){const killer=spawn('taskkill',['/PID',String(proc.pid),'/T','/F'],{stdio:'ignore'});await new Promise(r=>killer.once('exit',r));}else proc.kill();await stopped;}
  await new Promise(r=>gateway.close(r));await db.close();fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
