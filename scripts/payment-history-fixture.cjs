const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
module.exports=async({db,as,op,admin,user,other,load,route,setActor})=>{
 const migration=fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_payment_history.sql')),'utf8');
 await db.exec(migration);
 const history=async(actor,page=1,q='')=>(await as('service_role',actor,'select public.radas_v4_payment_history($1,$2,$3) as result',[actor,page,q])).rows[0].result;
 for(const role of ['anon','authenticated'])await assert.rejects(as(role,admin,'select public.radas_v4_payment_history($1)',[admin]),/permission denied/);
 for(const actor of [null,user,other])await assert.rejects(history(actor),/forbidden/);
 for(const p of (await op(user,'list')).payments.filter(p=>['pending','submitted'].includes(p.status)))await op(admin,'reject',{id:p.id,reason:'History fixture setup'});
 const newest=randomUUID();await op(user,'create',{id:newest,packageId:'try',whatsapp:'60123456789'});await op(user,'submit',{id:newest,reference:'HISTORY-CUSTOMER'});await op(admin,'approve',{id:newest,reference:'HISTORY-BANK-'+newest,amountSen:500});
 for(let i=0;i<20;i++){const id=randomUUID();await op(user,'create',{id,packageId:'try',whatsapp:'60123456789'});await op(user,'cancel',{id});}
 // Keep approval sorted first and verify pending rows never enter completed history.
 await db.query('update radas_v4.payments set reviewed_at=clock_timestamp() where id=$1',[newest]);
 const snapshot=async()=>JSON.stringify((await db.query('select (select jsonb_agg(to_jsonb(w) order by user_id) from radas_v4.credit_wallets w) wallets,(select jsonb_agg(to_jsonb(t) order by id) from radas_v4.credit_transactions t) ledger,(select jsonb_agg(to_jsonb(p) order by id) from radas_v4.payments p) payments')).rows);
 const before=await snapshot();const first=await history(admin),second=await history(admin,2);assert.equal(first.payments.length,9);assert.equal(second.payments.length,9);assert.equal(first.payments[0].id,newest);assert.ok(first.total>=21);
 assert.equal(new Set([...first.payments,...second.payments].map(p=>p.id)).size,18);
 assert.ok(first.payments.every(p=>['approved','rejected'].includes(p.status)&&!('bank_reference'in p)&&!('reviewed_by'in p)));
 assert.ok((await history(admin,1,'FIXTURE@EXAMPLE.COM')).payments.every(p=>p.customer_email==='fixture@example.com'));
 assert.ok((await history(admin,1,'+60 123-456-789')).payments.every(p=>p.whatsapp==='60123456789'));
 const empty=await history(admin,100000,'nobody-found@example.invalid');assert.deepEqual(empty,{total:0,page:1,pageSize:9,payments:[]});
 assert.equal((await history(admin,100000)).page,Math.ceil(first.total/9));
 for(const args of [[0,''],[1,'x'.repeat(255)]])await assert.rejects(history(admin,...args),/invalid_request/);
 process.env.RADAS_PAYMENTS_ENABLED='true';process.env.RADAS_TELEGRAM_ENABLED='false';
 const get=query=>route.GET(new Request('http://localhost:3000/api/payments?'+query));
 setActor(null);assert.equal((await get('admin=1&history=1')).status,401);setActor(user);assert.equal((await get('admin=1&history=1')).status,403);setActor(admin);
 for(const q of ['history=1','admin=1&history=0','admin=1&history=1&page=0','admin=1&history=1&page=1&page=2','admin=1&history=1&userId='+other,'admin=1&history=1&q='+('x'.repeat(255))])assert.equal((await get(q)).status,400,q);
 const res=await get('admin=1&history=1&page=1');assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);const data=await res.json();assert.equal(data.payments[0].id,newest);assert.equal(data.payments[0].customer_email,'fixture@example.com');assert.equal(data.payments[0].whatsapp,'60123456789');
 const parse=load(require('node:path').resolve('src/lib/payments/history.ts')).parsePaymentHistory;
 assert.equal(parse({...data,payments:data.payments.map(p=>({...p,bank_reference:'PRIVATE',reviewed_by:admin}))}).payments.some(p=>'bank_reference'in p||'reviewed_by'in p),false);
 for(const bad of [{...data,total:-1},{...data,page:0},{...data,pageSize:100},{...data,payments:[...data.payments.slice(0,8),data.payments[0]]},{...data,payments:data.payments.map((p,i)=>i===0?{...p,status:'submitted'}:p)}])assert.throws(()=>parse(bad));
 setActor(user);assert.ok((await (await route.GET(new Request('http://localhost:3000/api/payments'))).json()).payments.every(p=>p.user_id===user&&!('customer_email'in p)));
 await db.exec(migration);assert.equal(await snapshot(),before);
 assert.equal((await db.query("select count(*)::int n from radas_v4.credit_transactions where reference=$1",['maybank:HISTORYBANK'+newest.replaceAll('-','').toUpperCase()])).rows[0].n,1);
 console.log('PASS payment history: completed contacts retained; admin-only SQL/HTTP; nine per page; email/phone search; strict DTO; no private bank fields; read/migration replay changes no payment, wallet or ledger');
};
