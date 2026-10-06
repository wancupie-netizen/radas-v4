const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{randomUUID}=require('node:crypto');
module.exports=async({db,as,op,admin,user,other,route,req,afterTasks,setActor})=>{
 const migration=fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_payment_telegram.sql')),'utf8');
 await db.exec(migration);await db.exec(migration);
 const notification=async(actor,action,id=null,claim=randomUUID())=>(await as('service_role',actor,'select public.radas_v4_payment_notification($1,$2,$3,$4) result',[actor,action,id,claim])).rows[0].result;
 const snapshot=async()=>JSON.stringify((await db.query('select (select jsonb_agg(t order by id) from radas_v4.credit_transactions t) ledger,(select jsonb_agg(w order by user_id) from radas_v4.credit_wallets w) wallets')).rows);
 const before=await snapshot();
 for(const p of (await op(admin,'admin_list')).payments)await op(admin,'reject',{id:p.id,reason:'Reset notification fixture'});
 const id=randomUUID();await op(user,'create',{id,packageId:'try',whatsapp:'0123456789'});
 assert.equal((await db.query('select count(*)::int n from radas_v4.payment_notifications')).rows[0].n,0);
 await assert.rejects(op(other,'submit',{id,reference:'DENIED'}),/not_found/);
 await op(user,'submit',{id,reference:'TELEGRAM-FIXTURE'});await op(user,'submit',{id,reference:'TELEGRAM-FIXTURE'});
 assert.equal((await db.query('select count(*)::int n from radas_v4.payment_notifications')).rows[0].n,1);
 for(const role of ['anon','authenticated'])await assert.rejects(as(role,user,'select public.radas_v4_payment_notification($1,$2,$3,$4)',[user,'claim',id,randomUUID()]),/permission denied/);
 await assert.rejects(as('service_role',user,'select * from radas_v4.payment_notifications'),/permission denied/);
 await assert.rejects(notification(other,'claim',id),/forbidden/);await assert.rejects(notification(user,'claim'),/forbidden/);
 const claim=randomUUID(),p=await notification(user,'claim',id,claim);assert.equal(p.customer_email,'fixture@example.com');assert.equal(p.whatsapp,'60123456789');
 assert.equal(await notification(admin,'claim',id),null);
 await notification(admin,'sent',id,randomUUID());assert.equal((await db.query('select sent_at from radas_v4.payment_notifications where payment_id=$1',[id])).rows[0].sent_at,null);
 await notification(user,'failed',id,claim);assert.equal(await notification(admin,'claim',id),null);
 await db.query("update radas_v4.payment_notifications set retry_at=now()-interval '1 second' where payment_id=$1",[id]);
 const originalFetch=global.fetch, warnings=[],calls=[],callbacks=[];let mode='success';
 const oldWarning=console.warn;console.warn=x=>warnings.push(x);
 const exports={};
 new Function('require','exports',ts.transpileModule(fs.readFileSync('src/lib/payments/telegram.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{
  if(name==='server-only')return{};
  if(name==='next/server')return{after:f=>callbacks.push(f)};
  if(name==='./packages')return{PACKAGES:[{id:'try',name:'Try',amountSen:500,credits:60}]};
  if(name==='@supabase/supabase-js')return{createClient:()=>({rpc:async(_,p)=>{try{return{data:await notification(p.p_actor,p.p_action,p.p_id,p.p_claim),error:null};}catch(error){return{data:null,error};}}})};
  return require(name);
 },exports);
 Object.assign(process.env,{RADAS_TELEGRAM_ENABLED:'true',RADAS_TELEGRAM_BOT_TOKEN:'123456:fixture_secret',RADAS_TELEGRAM_ADMIN_CHAT_ID:'5183075785',RADAS_APP_URL:'https://video.radas.my'});
 global.fetch=async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});if(mode==='timeout')throw new Error('token must never be logged 123456:fixture_secret');return Response.json({ok:mode==='success'},{status:mode==='success'?200:429});};
 try {
  process.env.RADAS_TELEGRAM_ENABLED='false';await exports.deliverPaymentNotifications(user,id);assert.equal(calls.length,0);
  process.env.RADAS_TELEGRAM_ENABLED='true';exports.schedulePaymentNotifications(user,id);assert.equal(callbacks.length,1);assert.equal(calls.length,0);await callbacks.pop()();
  assert.equal(calls.length,1);assert.equal(calls[0].body.chat_id,'5183075785');assert.match(calls[0].body.text,/RM5.00/);assert.match(calls[0].body.text,/fixture@example.com/);assert.match(calls[0].body.text,/https:\/\/video.radas.my\/admin\/payments/);assert.equal(calls[0].init.redirect,'error');assert.ok(!('parse_mode' in calls[0].body));
  await exports.deliverPaymentNotifications(user,id);await exports.deliverPaymentNotifications(admin,null);assert.equal(calls.length,1);
  const second=randomUUID();await op(other,'create',{id:second,packageId:'try',whatsapp:'0181234567'});await op(other,'submit',{id:second,reference:'SECOND-FIXTURE'});
  mode='timeout';await exports.deliverPaymentNotifications(other,second);assert.equal((await db.query('select status from radas_v4.payments where id=$1',[second])).rows[0].status,'submitted');
  assert.equal((await db.query('select last_error from radas_v4.payment_notifications where payment_id=$1',[second])).rows[0].last_error,'telegram_delivery_failed');
  await exports.deliverPaymentNotifications(other,second);assert.equal(calls.length,2);
  mode='success';await db.query("update radas_v4.payment_notifications set retry_at=now()-interval '1 second' where payment_id=$1",[second]);await exports.deliverPaymentNotifications(admin,null);assert.equal(calls.length,3);
  const third=randomUUID();await op(admin,'reject',{id:second,reason:'Fixture done'});await op(other,'create',{id:third,packageId:'try',whatsapp:'0181234567'});await op(other,'submit',{id:third,reference:'THIRD-FIXTURE'});
  mode='failure';for(let i=0;i<6;i++){await db.query("update radas_v4.payment_notifications set retry_at=now()-interval '1 second' where payment_id=$1",[third]);await exports.deliverPaymentNotifications(admin,null);}
  assert.equal((await db.query('select attempts from radas_v4.payment_notifications where payment_id=$1',[third])).rows[0].attempts,5);assert.equal(calls.length,8);
  assert.ok(warnings.every(x=>!x.includes('fixture_secret')&&!x.includes('fixture@example.com')));
  // HTTP submit remains successful with enabled notifications; strict client fields reject chat overrides.
  setActor(other);const queued=afterTasks.length;assert.equal((await route.POST(req({action:'submit',id:third,reference:'THIRD-FIXTURE'}))).status,200);assert.equal(afterTasks.length,queued+1);
  assert.equal((await route.POST(req({action:'submit',id:third,reference:'THIRD-FIXTURE',chat_id:'evil'}))).status,400);
  setActor(user);const queueBefore=afterTasks.length;assert.equal((await route.GET(new Request('http://localhost:3000/api/payments?admin=1'))).status,403);assert.equal(afterTasks.length,queueBefore);setActor(admin);assert.equal((await route.GET(new Request('http://localhost:3000/api/payments?admin=1'))).status,200);assert.equal(afterTasks.length,queueBefore+1);
  assert.equal(await snapshot(),before);
 }finally{global.fetch=originalFetch;console.warn=oldWarning;delete process.env.RADAS_TELEGRAM_ENABLED;delete process.env.RADAS_TELEGRAM_BOT_TOKEN;}
 console.log('PASS Telegram: actual SQL enqueue once, owner/admin isolation, atomic claims, stale claim protection, async send, redacted errors, bounded retries, fixed destination, no credit changes');
};
