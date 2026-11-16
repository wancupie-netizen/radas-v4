// Isolated real SQL/TS/route verification. Never connects to live Maybank or Supabase.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const admin=randomUUID(),user=randomUUID(),other=randomUUID();
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;insert into auth.users values('${admin}','wancupie@gmail.com',now()),('${user}','fixture@example.com',now()),('${other}','other@example.com',now());`);
for(const suffix of ['_credit_engine.sql','_generation_flow.sql','_credit_safety.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
await require('./storage-fixture.cjs').installStorage(db);await db.exec('alter table storage.objects add column created_at timestamptz default now();');
for(const suffix of ['_auto_cleanup.sql','_manual_payments.sql','_payment_safety.sql']) {
 if(suffix==='_payment_safety.sql') await as('service_role',admin,'select public.radas_v4_credit_apply($1,$2,$3)',[admin,'topup','legacy-before-phase12']);
 await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
}
assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[admin])).rows[0].balance,60);
async function as(role,actor,sql,params=[]){await db.exec(`begin;set local role ${role};select set_config('request.jwt.claims','${JSON.stringify({role,sub:actor})}',true);`);try{const result=await db.query(sql,params);await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}}
async function op(actor,action,body={}){return(await as('service_role',actor,'select public.radas_v4_payment_operation($1,$2,$3,$4,$5,$6,$7) as result',[actor,action,body.id??null,body.packageId??null,body.reference??null,body.amountSen??null,body.reason??null])).rows[0].result;}

const sql = suffix => fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8');
for(const suffix of ['_payment_contacts.sql','_payment_telegram.sql','_payment_history.sql'])await db.exec(sql(suffix));
async function contactOp(actor,action,body={}){return(await as('service_role',actor,'select public.radas_v4_payment_contact_operation($1,$2,$3,$4,$5,$6,$7,$8) as result',[actor,action,body.id??null,body.packageId??null,body.reference??null,body.amountSen??null,body.reason??null,body.whatsapp??null])).rows[0].result;}
const packages=[['try',500,800,60],['starter',1000,1600,120],['creator',2000,3200,250],['power',5000,8000,620]];
const owners=packages.map(()=>randomUUID()),old=[];
for(const [i,[packageId,oldPrice,,credits]] of packages.entries()){
 await db.query('insert into auth.users values($1,$2,now())',[owners[i],`pricing-${i}@example.com`]);
 const id=randomUUID(),reference='OLD-'+id;
 const row=(await contactOp(owners[i],'create',{id,packageId,whatsapp:'60123456789'})).payment;
 assert.equal(row.amount_sen,oldPrice);assert.equal(row.credits,credits);
 if(i===1||i===2)await contactOp(owners[i],'submit',{id,reference});
 if(i===2)await contactOp(admin,'approve',{id,reference,amountSen:oldPrice});
 if(i===3)await contactOp(admin,'reject',{id,reason:'Fixture rejection'});
 old.push({id,reference});
}
async function records(){const out={};for(const table of ['payments','credit_wallets','credit_transactions','payment_notifications'])out[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') rows from radas_v4.${table} t`)).rows[0].rows;return out;}
const before=await records();
const definition=async()=> (await db.query("select pg_get_functiondef('radas_v4.payment_operation(uuid,text,uuid,text,text,integer,text)'::regprocedure) body")).rows[0].body;
const oldBody=await definition();
const permissions=async()=> (await db.query("select proacl::text,proowner,prosecdef,proconfig from pg_proc where oid='radas_v4.payment_operation(uuid,text,uuid,text,text,integer,text)'::regprocedure")).rows[0];
const acl=await permissions(),migration=sql('_package_prices_20261116.sql');
await db.exec(migration);assert.deepEqual(await records(),before);assert.deepEqual(await permissions(),acl);
const newBody=await definition();assert.equal(newBody,oldBody.replace("when 'try' then 500 when 'starter' then 1000 when 'creator' then 2000 when 'power' then 5000", "when 'try' then 800 when 'starter' then 1600 when 'creator' then 3200 when 'power' then 8000"));
await db.exec(migration);assert.deepEqual(await records(),before);assert.equal(await definition(),newBody);
console.log('PASS pricing migration/replay changes no existing orders, wallets, ledger or notifications; function changes only quote prices; owner/grants/security preserved');
let actor=user;const afterTasks=[];const mods={};function load(file){if(mods[file])return mods[file];const m={exports:{}};mods[file]=m.exports;const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',out)(name=>{if(name==='server-only')return{};if(name==='next/server')return{after:f=>afterTasks.push(f)};if(name==='@supabase/supabase-js')return{createClient:()=>({rpc:async(name,p)=>{try{if(name==='radas_v4_request_limit')return{data:{allowed:true,retryAfter:0},error:null};if(name==='radas_v4_payment_history')return{data:(await as('service_role',p.p_actor,'select public.radas_v4_payment_history($1,$2,$3) as result',[p.p_actor,p.p_page,p.p_query])).rows[0].result,error:null};return{data:await contactOp(p.p_actor,p.p_action,{id:p.p_id,packageId:p.p_package,reference:p.p_reference,amountSen:p.p_amount,reason:p.p_reason,whatsapp:p.p_whatsapp}),error:null};}catch(error){return{data:null,error};}}})};if(name==='@/lib/supabase/server'||name==='../supabase/server')return{createClient:async()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null},error:null})}})};if(name.startsWith('@/'))return load(path.resolve('src',name.slice(2))+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');return require(name);},m,m.exports);mods[file]=m.exports;return m.exports;}
const route=load(path.resolve('src/app/api/payments/route.ts'));process.env.NEXT_PUBLIC_SUPABASE_URL='https://fyqvvkpzcwrmyozxlqkw.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-not-live';process.env.APP_URL='http://localhost:3000';process.env.RADAS_PAYMENTS_ENABLED='true';
const req=body=>new Request('http://localhost:3000/api/payments',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(body)});

async function post(who,body,status=200){actor=who;const res=await route.POST(req(body));assert.equal(res.status,status,JSON.stringify(await res.clone().json()));return res.json();}
// Replay old IDs and active orders, then complete old quotes at their original prices.
for(const [i,[packageId,oldPrice,newPrice,credits]] of packages.entries()){
 const {id,reference}=old[i];
 let result=await post(owners[i],{action:'create',id,packageId,whatsapp:'0123456789'});
 assert.equal(result.payment.amount_sen,oldPrice);assert.equal(result.payment.credits,credits);
 if(i<2){
  result=await post(owners[i],{action:'create',id:randomUUID(),packageId,whatsapp:'0123456789'});
  assert.equal(result.payment.id,id);assert.equal(result.payment.amount_sen,oldPrice);
  if(i===0)await post(owners[i],{action:'submit',id,reference});
  await post(admin,{action:'approve',id,reference,amountSen:newPrice},409);
  const approved=await post(admin,{action:'approve',id,reference,amountSen:oldPrice});
  assert.equal(approved.payment.amount_sen,oldPrice);
  assert.equal((await post(admin,{action:'approve',id,reference,amountSen:oldPrice})).status,'already_approved');
 }
}
console.log('PASS actual HTTP/SQL: old pending/submitted/approved/rejected quotes and same-ID replays remain readable; old amounts approve exactly once; new amounts rejected for old orders');
const balances=await db.query('select user_id,balance from radas_v4.credit_wallets');
for(const [i,[packageId,oldPrice,newPrice,credits]] of packages.entries()){
 const id=randomUUID(),reference='NEW-'+id;
 const created=await post(owners[i],{action:'create',id,packageId,whatsapp:'0123456789'});
 assert.equal(created.payment.amount_sen,newPrice);assert.equal(created.payment.credits,credits);
 assert.equal((await post(owners[i],{action:'create',id,packageId,whatsapp:'0123456789'})).payment.id,id);
 await post(owners[i],{action:'create',id:randomUUID(),packageId,whatsapp:'0123456789',amountSen:oldPrice},400);
 await post(owners[i],{action:'submit',id,reference});
 await post(owners[(i+1)%4],{action:'approve',id,reference,amountSen:newPrice},403);
 await post(admin,{action:'approve',id,reference,amountSen:oldPrice},409);
 const approved=await post(admin,{action:'approve',id,reference,amountSen:newPrice});assert.equal(approved.payment.credits,credits);
 assert.equal((await post(admin,{action:'approve',id,reference,amountSen:newPrice})).status,'already_approved');
 assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[owners[i]])).rows[0].balance,(balances.rows.find(r=>r.user_id===owners[i])?.balance??0)+credits);
}
actor=admin;let res=await route.GET(new Request('http://localhost:3000/api/payments?admin=1&history=1'));
assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);
const history=await res.json();assert.equal(history.total,8);assert.equal(history.payments.length,8);
assert.deepEqual(history.payments.map(p=>p.amount_sen).sort((a,b)=>a-b),[500,800,1000,1600,2000,3200,5000,8000]);
assert.ok(history.payments.every(p=>!('bank_reference'in p)&&!('reviewed_by'in p)));
const {paymentPackage,PACKAGES}=load(path.resolve('src/lib/payments/packages.ts'));
assert.deepEqual(PACKAGES.map(p=>[p.id,p.amountSen,p.credits]),packages.map(([id,,amount,credits])=>[id,amount,credits]));
for(const [id,oldPrice,newPrice,credits] of packages){assert.ok(paymentPackage(id,oldPrice,credits));assert.ok(paymentPackage(id,newPrice,credits));for(const [amount,count] of [[newPrice+1,credits],[String(newPrice),credits],[newPrice,credits+1],[null,credits]])assert.equal(paymentPackage(id,amount,count),undefined);}
console.log('PASS all four new HTTP quotes, exact amount, unchanged credit grants, spoof denial, admin isolation, idempotent approval and mixed-price history');
const stable=await records();await db.exec(migration);assert.deepEqual(await records(),stable);
for(const role of ['anon','authenticated'])await assert.rejects(as(role,owners[0],'select public.radas_v4_payment_operation($1,$2)',[owners[0],'list']),/permission denied/);
await assert.rejects(as('service_role',owners[0],"update radas_v4.payments set amount_sen=1"),/permission denied/);
await assert.rejects(db.query("update radas_v4.payments set amount_sen=801 where id=$1",[old[0].id]),/check constraint/);
// Unexpected later pricing code must stop the migration without altering its constraint or data.
await db.exec(newBody.replace("when 'try' then 800", "when 'try' then 801"));
await assert.rejects(db.exec(migration),/unexpected_payment_pricing_body/);await db.exec('rollback');
assert.deepEqual(await records(),stable);await db.exec(newBody);
console.log('PASS strict legacy/current tuple validation, RLS/privileges, no direct writes, migration rollback on unexpected function and zero replay side effects');
console.log('PACKAGE_PRICING_LOCAL=PASS (isolated SQL, actual HTTP/service/parsers; no live credit or payment changes)');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
