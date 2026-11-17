// Local preview/check of real Next routes with mock auth and products. Never reads production variables.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
(async()=>{
 const actor=randomUUID(),today=new Date().toISOString().slice(0,10);let loginCookie='',appBase='',mutations=0;
 const products=Array.from({length:12},(_,i)=>({id:randomUUID(),name:'Fixture Product '+String(i+1).padStart(2,'0'),imageUrl:'',category:'Home',priceSen:3300,commissionSen:330,url:'',reviewedOn:today,contentTypes:['UGC'],published:true,revision:1}));
 const gateway=http.createServer(async(req,res)=>{try{
  if(req.url==='/fixture-login'){res.statusCode=302;res.setHeader('set-cookie',loginCookie+'; Path=/; HttpOnly; SameSite=Lax');res.setHeader('location',appBase+'/admin/products?af_view=sold');res.end();return;}
  let raw='';for await(const c of req)raw+=c;res.setHeader('content-type','application/json');
  if(req.url.startsWith('/auth/v1/user')){res.end(JSON.stringify({id:actor,aud:'authenticated',role:'authenticated',email:'admin@fixture.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{name:'Fixture Admin'},created_at:new Date().toISOString()}));return;}
  if(req.url==='/rest/v1/rpc/radas_v4_affiliate_operation'){const p=JSON.parse(raw);res.end(JSON.stringify({admin:true,access:'allowed',products:products.map(x=>p.p_action==='list'?x:{...x,sourceNotes:'Fixture admin note'})}));return;}
  if(req.url==='/rest/v1/rpc/radas_v4_affiliate_sold_operation'){
   const p=JSON.parse(raw),product=products.find(x=>x.id===p.p_id);assert.ok(product);if(product.revision!==p.p_revision){res.statusCode=409;res.end(JSON.stringify({code:'P0001',message:'catalog_conflict'}));return;}
   Object.assign(product,{soldText:p.p_sold_text,soldCheckedOn:p.p_sold_checked_on,revision:product.revision+1});mutations++;
   res.end(JSON.stringify({admin:true,access:'allowed',products}));return;
  }
  res.statusCode=404;res.end('{}');
 }catch(e){console.error(e);res.statusCode=500;res.end('{}');}});
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const mock='http://127.0.0.1:'+gateway.address().port;
 const reserved=http.createServer();await new Promise(r=>reserved.listen(0,'127.0.0.1',r));const port=reserved.address().port;await new Promise(r=>reserved.close(r));appBase='http://127.0.0.1:'+port;
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'radas-sold-preview-')),preload=path.join(temp,'preload.cjs');
 fs.writeFileSync(preload,`const original=global.fetch;global.fetch=(input,init)=>{const value=typeof input==='string'?input:input instanceof URL?input.toString():input.url;if(value.startsWith('https://fyqvvkpzcwrmyozxlqkw.supabase.co/'))return original(${JSON.stringify(mock)}+value.slice('https://fyqvvkpzcwrmyozxlqkw.supabase.co'.length),init);if(value.startsWith('https:'))throw new Error('fixture denies external network');return original(input,init);};`);
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,role:'authenticated',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.Zml4dHVyZQ';
 const session={access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:actor}};
 loginCookie='sb-fyqvvkpzcwrmyozxlqkw-auth-token=base64-'+Buffer.from(JSON.stringify(session)).toString('base64url');
 const env={...process.env,NODE_OPTIONS:'--require '+JSON.stringify(preload),APP_URL:appBase,NEXT_PUBLIC_SUPABASE_URL:'https://fyqvvkpzcwrmyozxlqkw.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-publishable',SUPABASE_SECRET_KEY:'fixture-secret',RADAS_FINALIZATION_ENABLED:'false',RADAS_CLEANUP_ENABLED:'false',RADAS_GENERATION_ENABLED:'false'};
 const proc=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env,stdio:'pipe'});let logs='';proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);
 try{
  for(let i=0;i<200&&!logs.includes('Ready');i++){if(proc.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,100));}assert.match(logs,/Ready/);
  const page=await fetch(appBase+'/admin/products?af_view=sold',{headers:{cookie:loginCookie}});assert.equal(page.status,200,logs);assert.match(await page.text(),/Manage Products/);
  const endpoint=appBase+'/api/affiliate';let response=await fetch(endpoint+'?admin=1',{headers:{cookie:loginCookie}});assert.equal(response.status,200,logs);assert.equal((await response.json()).products.length,12);
  const update={id:products[0].id,revision:1,soldText:'10K+',soldCheckedOn:today};
  response=await fetch(endpoint,{method:'POST',headers:{cookie:loginCookie,origin:appBase,'content-type':'application/json'},body:JSON.stringify({action:'sold',product:update})});assert.equal(response.status,200,logs);assert.equal((await response.json()).products[0].soldText,'10K+');assert.equal(mutations,1);
  response=await fetch(endpoint+'?admin=1',{headers:{cookie:loginCookie}});assert.equal((await response.json()).products[0].soldText,'10K+');
  response=await fetch(endpoint,{method:'POST',headers:{cookie:loginCookie,origin:appBase,'content-type':'application/json'},body:JSON.stringify({action:'sold',product:{...update,revision:2,soldText:'',soldCheckedOn:''}})});assert.equal(response.status,200,logs);assert.equal((await response.json()).products[0].soldText,'');assert.equal(mutations,2);
  assert.equal((await fetch(endpoint)).status,401);
  console.log('PASS actual next start SSR/auth cookie/admin API: manual K+ save/readback/clear and unauthenticated denial; mock gateway only, external HTTPS blocked');
  if(!process.argv.includes('--check')){
   Object.assign(products[0],{soldText:'10K+',soldCheckedOn:today});
   console.log('PREVIEW_URL='+mock+'/fixture-login');console.log('LOCAL MOCK PRODUCTS ONLY. Close with Ctrl+C; preview changes are not saved to production.');
   await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  }
 }finally{
  if(proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));if(process.platform==='win32'){const killer=spawn('taskkill',['/PID',String(proc.pid),'/T','/F'],{stdio:'ignore'});await new Promise(r=>killer.once('exit',r));}else proc.kill();await stopped;}
  await new Promise(r=>gateway.close(r));fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
