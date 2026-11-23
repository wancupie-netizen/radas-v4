// Actual Next server and SDK with a loopback-only mock Supabase gateway. No production credentials.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
(async()=>{
 const owner=randomUUID(),user=randomUUID();let appBase='',mutations=0;const cookies={},audit=new Map();
 // All entries are in-memory preview fixtures; nothing is seeded in production.
 const titles=['Masalah pelanggan','Pengalaman sendiri','Tunjuk hasil','Buka rasa ingin tahu','Situasi harian','Sebelum membeli'];
 let entries=titles.map((title,i)=>({id:randomUUID(),kind:'hook',title,category:['UGC','Storytelling','Product Demo','Curiosity','Lifestyle','Review'][i],text:['Dah cuba macam-macam, tapi masalah yang sama tetap berulang?','Aku ingat benda ni biasa saja, sampai aku cuba sendiri.','Tengok beza sebelum dan selepas guna benda ni.','Ada satu perkara yang ramai terlepas pandang...','Kalau setiap pagi kau hadap benda yang sama, cuba tengok ni.','Sebelum kau beli, ada tiga benda yang kau kena tahu.'][i],sortOrder:(i+1)*10,published:true,revision:1}));
 entries.push({...entries[0],id:randomUUID(),kind:'prompt',title:'Close-up produk',category:'Product Demo',text:'Video menegak 9:16, 15 saat.\nPaparkan produk di atas meja dengan cahaya semula jadi. Kamera bergerak perlahan mengelilingi produk. Kekalkan rupa asal produk. Tiada dialog atau teks tambahan.'});
 const token=id=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,role:'authenticated',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.Zml4dHVyZQ';
 for(const id of [owner,user])cookies[id]='sb-fyqvvkpzcwrmyozxlqkw-auth-token=base64-'+Buffer.from(JSON.stringify({access_token:token(id),refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id}})).toString('base64url');
 const response=(res,data,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
 const list=(actor,action)=>({admin:actor===owner,entries:entries.filter(e=>action==='admin_list'||e.published).sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id))});
 const gateway=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');if(url.pathname==='/fixture-login'){const id=url.searchParams.get('role')==='user'?user:owner;res.writeHead(302,{'set-cookie':cookies[id]+'; Path=/; HttpOnly; SameSite=Lax',location:appBase+'/studio?tab=hooks-prompts'});res.end();return;}
  let raw='';for await(const chunk of req)raw+=chunk;
  if(req.url.startsWith('/auth/v1/user')){let id;try{id=JSON.parse(Buffer.from(req.headers.authorization.split(' ')[1].split('.')[1],'base64url')).sub;}catch{}if(![owner,user].includes(id)){response(res,{message:'invalid token'},401);return;}response(res,{id,aud:'authenticated',role:'authenticated',email:(id===owner?'admin':'user')+'@fixture.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{name:'Preview'},created_at:new Date().toISOString()});return;}
  if(req.url==='/rest/v1/rpc/radas_v4_credit_snapshot'){response(res,{balance:11,updatedAt:new Date().toISOString(),transactions:[]});return;}
  if(req.url==='/rest/v1/rpc/radas_v4_hooks_prompts_operation'){
   const p=JSON.parse(raw);if(p.p_action!=='list'&&p.p_actor!==owner){response(res,{code:'42501',message:'forbidden'},403);return;}
   if(['save','delete'].includes(p.p_action)){
    const e=p.p_entry,old=entries.find(x=>x.id===e.id);
    if(p.p_action==='save'){
     if((old&&old.revision!==e.revision)||(!old&&(e.revision!==0||audit.has(e.id)))){
      if(old&&old.revision===e.revision+1&&Object.keys(e).every(k=>k==='revision'||e[k]===old[k])){response(res,list(p.p_actor,'admin_list'));return;}
      response(res,{code:'P0001',message:'entry_conflict'},409);return;
     }
     if(old)Object.assign(old,{...e,revision:e.revision+1});else entries.push({...e,revision:1});
    }else{if(old&&old.revision!==e.revision){response(res,{code:'P0001',message:'entry_conflict'},409);return;}entries=entries.filter(x=>x.id!==e.id);}
    audit.set(e.id,true);mutations++;response(res,list(p.p_actor,'admin_list'));return;
   }
   response(res,list(p.p_actor,p.p_action));return;
  }
  // Other app panels remain unavailable in this focused preview. No forwarding.
  response(res,{code:'fixture_unavailable',message:'fixture only'},503);
 }catch(e){console.error(e);response(res,{},500);}});
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const mock='http://127.0.0.1:'+gateway.address().port;
 const reserved=http.createServer();await new Promise(r=>reserved.listen(0,'127.0.0.1',r));const port=reserved.address().port;await new Promise(r=>reserved.close(r));appBase='http://127.0.0.1:'+port;
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'radas-hooks-preview-')),preload=path.join(temp,'preload.cjs');
 fs.writeFileSync(preload,`const original=global.fetch;global.fetch=(input,init)=>{const value=typeof input==='string'?input:input instanceof URL?input.toString():input.url;if(value.startsWith('https://fyqvvkpzcwrmyozxlqkw.supabase.co/'))return original(${JSON.stringify(mock)}+value.slice('https://fyqvvkpzcwrmyozxlqkw.supabase.co'.length),init);if(value.startsWith('https:'))throw new Error('fixture denies external network');return original(input,init);};`);
 const env={...process.env,NODE_OPTIONS:'--require '+JSON.stringify(preload),APP_URL:appBase,NEXT_PUBLIC_SUPABASE_URL:'https://fyqvvkpzcwrmyozxlqkw.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-publishable',SUPABASE_SECRET_KEY:'fixture-secret',RADAS_FINALIZATION_ENABLED:'false',RADAS_CLEANUP_ENABLED:'false',RADAS_GENERATION_ENABLED:'false',RADAS_PAYMENTS_ENABLED:'false',RADAS_TELEGRAM_ENABLED:'false'};
 const proc=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env,stdio:'pipe'});let logs='';proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);
 try{
  for(let i=0;i<250&&!logs.includes('Ready');i++){if(proc.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}assert.match(logs,/Ready/);
  for(const [route,text] of [['/studio?tab=hooks-prompts','Hook &amp; Prompt'],['/admin/hooks-prompts','Manage Hook &amp; Prompt']]){const r=await fetch(appBase+route,{headers:{cookie:cookies[owner]}});assert.equal(r.status,200,logs);const html=await r.text();assert.match(html,new RegExp(text.replace('?','\\?')));if(route.startsWith('/studio'))assert.match(html,/<title>RADAS — Hook &amp; Prompt<\/title>/);}
  for(const route of ['/studio?tab=hooks-prompts','/admin/hooks-prompts']){const r=await fetch(appBase+route,{redirect:'manual'});assert.equal(r.status,307);assert.equal(new URL(r.headers.get('location'),appBase).pathname,'/login');}
  const deniedPage=await fetch(appBase+'/admin/hooks-prompts',{headers:{cookie:cookies[user]}});assert.match(await deniedPage.text(),/Access unavailable/);
  const endpoint=appBase+'/api/hooks-prompts';let r=await fetch(endpoint,{headers:{cookie:cookies[user]}});assert.equal(r.status,200);assert.equal((await r.json()).entries.length,7);assert.equal((await fetch(endpoint)).status,401);
  assert.equal((await fetch(endpoint+'?admin=1',{headers:{cookie:cookies[user]}})).status,403);
  const command={action:'save',entry:{id:randomUUID(),title:'Runtime draft',kind:'prompt',category:'UGC',text:'First line.\nSecond line.',sortOrder:0,published:false,revision:0}};
  const save=body=>fetch(endpoint,{method:'POST',headers:{cookie:cookies[owner],origin:appBase,'content-type':'application/json'},body:JSON.stringify(body)});
  r=await save(command);assert.equal(r.status,200,logs);const saved=(await r.json()).entries.find(e=>e.id===command.entry.id);assert.equal(saved.revision,1);assert.equal((await save(command)).status,200);assert.equal(mutations,1);
  r=await fetch(endpoint,{headers:{cookie:cookies[user]}});assert.ok(!(await r.json()).entries.some(e=>e.id===saved.id));
  r=await save({action:'save',entry:{...saved,published:true}});assert.equal(r.status,200);const published=(await r.json()).entries.find(e=>e.id===saved.id);
  r=await fetch(endpoint,{headers:{cookie:cookies[user]}});assert.equal((await r.json()).entries[0].id,saved.id);assert.equal((await save({action:'delete',entry:published})).status,200);
  console.log('PASS actual next start Hook & Prompt SSR/metadata, admin page, session cookies, SDK/RPC save/replay, Draft/Published visibility, order/delete and 401/403; server external HTTPS denied; HOOKS_RUNTIME=PASS');
  if(!process.argv.includes('--check')){
   console.log('PREVIEW_URL='+mock+'/fixture-login');console.log('CUSTOMER_PREVIEW_URL='+mock+'/fixture-login?role=user');console.log('SAMPLE DATA ONLY. In-memory collection with six hooks and one prompt. Use Manage Hook & Prompt to add/edit/hide/delete. Copy uses the browser clipboard; manual copy is offered if blocked. No live backend calls, generation or credit changes. Ctrl+C stops.');
   await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  }
 }finally{
  if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));if(process.platform==='win32'){const killer=spawn('taskkill',['/PID',String(proc.pid),'/T','/F'],{stdio:'ignore'});await new Promise(r=>killer.once('exit',r));}else proc.kill();await stopped;}
  await new Promise(r=>gateway.close(r));fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
