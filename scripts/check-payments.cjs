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
const rpc='public.radas_v4_payment_operation(uuid,text,uuid,text,text,integer,text)';
for(const role of ['anon','authenticated'])await assert.rejects(as(role,user,'select '+rpc.split('(')[0]+'($1,$2)',[user,'list']),/permission denied/);
await assert.rejects(as('service_role',user,'update radas_v4.payments set credits=999'),/permission denied/);
await assert.rejects(op(user,'admin_list'),/forbidden/);await assert.rejects(op(null,'list'),/unauthorized/);
assert.equal((await op(user,'list')).payments.length,0);const cancelled=randomUUID();await op(user,'create',{id:cancelled,packageId:'try'});await op(user,'cancel',{id:cancelled});await assert.rejects(op(admin,'approve',{id:cancelled,reference:'CANCELLED',amountSen:500}),/payment_not_submitted/);
let expected=0;for(const [packageId,amountSen,credits] of [['try',500,60],['starter',1000,120],['creator',2000,250],['power',5000,620]]){
 const id=randomUUID(),reference='BANK-'+id;const p=(await op(user,'create',{id,packageId})).payment;assert.equal(p.amount_sen,amountSen);assert.equal(p.credits,credits);
 const again=await op(user,'create',{id:randomUUID(),packageId:'try'});assert.equal(again.payment.id,id);
 await assert.rejects(op(other,'submit',{id,reference}),/not_found/);await assert.rejects(op(user,'approve',{id,reference,amountSen}),/forbidden/);
 await assert.rejects(op(admin,'approve',{id,reference,amountSen}),/payment_not_submitted/);
 await op(user,'submit',{id,reference});await op(user,'submit',{id,reference});await assert.rejects(op(user,'submit',{id,reference:'changed'}),/payment_locked/);
 await assert.rejects(op(admin,'approve',{id,reference,amountSen:amountSen+1}),/bank_details_invalid/);
 await op(admin,'approve',{id,reference,amountSen});for(let i=0;i<20;i++)assert.equal((await op(admin,'approve',{id,reference:reference.toLowerCase(),amountSen})).status,'already_approved');
 expected+=credits;assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[user])).rows[0].balance,expected);
}
const snapshotModule={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync('src/lib/credits/types.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(snapshotModule.exports,snapshotModule);const snap=(await as('authenticated',user,'select public.radas_v4_credit_snapshot() s')).rows[0].s;assert.equal(snapshotModule.exports.parseSnapshot(snap).balance,expected);
console.log('PASS all four fixed packages; owner isolation; pending does not credit; exact amount; repeated confirmation grants once');
let id=randomUUID();await op(other,'create',{id,packageId:'try'});await op(other,'submit',{id,reference:'fixture-ref'});
const duplicate=(await db.query('select bank_reference from radas_v4.payments where status=$1 limit 1',['approved'])).rows[0].bank_reference;
await assert.rejects(op(admin,'approve',{id,reference:duplicate,amountSen:500}),/duplicate key/);
assert.equal((await db.query('select status from radas_v4.payments where id=$1',[id])).rows[0].status,'submitted');
await db.exec(`create function radas_v4.fixture_payment_failure() returns trigger language plpgsql as $$begin raise exception 'fixture_failure';end$$;create trigger fixture_failure before update on radas_v4.credit_wallets for each row execute function radas_v4.fixture_payment_failure();`);
await assert.rejects(op(admin,'approve',{id,reference:'BANK-ROLLBACK',amountSen:500}),/fixture_failure/);
assert.equal((await db.query("select count(*)::int n from radas_v4.credit_transactions where reference='maybank:BANKROLLBACK'")).rows[0].n,0);
await db.exec('drop trigger fixture_failure on radas_v4.credit_wallets;drop function radas_v4.fixture_payment_failure();');
await op(admin,'reject',{id,reason:'Transaksi belum ditemui'});await assert.rejects(op(admin,'approve',{id,reference:'BANK-LATE',amountSen:500}),/payment_not_submitted/);
const repeated=randomUUID();await op(other,'create',{id:repeated,packageId:'try'});await op(other,'submit',{id:repeated,reference:'BANK-CONCURRENT'});for(let i=0;i<20;i++)await op(admin,'approve',{id:repeated,reference:'BANK-CONCURRENT',amountSen:500});assert.equal((await db.query("select count(*)::int n from radas_v4.credit_transactions where reference='maybank:BANKCONCURRENT'")).rows[0].n,1);
console.log('PASS bank reference globally unique; rejection adds zero; wallet/ledger/payment rollback together');
// Actual route module compiled with isolated verified auth and real SQL-backed service.
let actor=user;const mods={};function load(file){if(mods[file])return mods[file];const m={exports:{}};mods[file]=m.exports;const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',out)(name=>{if(name==='server-only')return{};if(name==='@supabase/supabase-js')return{createClient:()=>({rpc:async(_,p)=>{try{return{data:await op(p.p_actor,p.p_action,{id:p.p_id,packageId:p.p_package,reference:p.p_reference,amountSen:p.p_amount,reason:p.p_reason}),error:null};}catch(error){return{data:null,error};}}})};if(name==='@/lib/supabase/server'||name==='../supabase/server')return{createClient:async()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null},error:null})}})};if(name.startsWith('@/'))return load(path.resolve('src',name.slice(2))+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');return require(name);},m,m.exports);mods[file]=m.exports;return m.exports;}
const route=load(path.resolve('src/app/api/payments/route.ts'));process.env.NEXT_PUBLIC_SUPABASE_URL='https://fyqvvkpzcwrmyozxlqkw.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-not-live';process.env.APP_URL='http://localhost:3000';process.env.RADAS_PAYMENTS_ENABLED='true';
const req=body=>new Request('http://localhost:3000/api/payments',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(body)});
actor=null;assert.equal((await route.GET(new Request('http://localhost:3000/api/payments'))).status,401);actor=user;
assert.equal((await route.GET(new Request('http://localhost:3000/api/payments?admin=1'))).status,403);
assert.equal((await route.POST(req({action:'create',id:randomUUID(),packageId:'try',userId:other}))).status,400);
assert.equal((await route.POST(new Request('http://localhost:3000/api/payments',{method:'POST',headers:{origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}))).status,403);
assert.equal((await route.POST(req({action:'create',id:randomUUID(),packageId:'try'}))).status,200);
assert.match((await route.GET(new Request('http://localhost:3000/api/payments'))).headers.get('cache-control'),/no-store/);
process.env.RADAS_PAYMENTS_ENABLED='false';assert.equal((await route.POST(req({action:'create',id:randomUUID(),packageId:'try'}))).status,503);
console.log('PASS real HTTP handlers: verified auth, CSRF, feature gate, strict fields, admin denial, no cache');
const checks=(await db.query(fs.readFileSync('supabase/verify-payments.sql','utf8'))).rows;assert.ok(checks.every(x=>x.passed));
await assert.rejects(db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_manual_payments.sql')),'utf8')),/payments_already_installed/);await db.exec('rollback');
await require('./payment-safety-fixture.cjs')({db,op,as,admin,user,other,load,route,req,setActor:value=>actor=value});
const safetyChecks=(await db.query(fs.readFileSync('supabase/verify-payment-safety.sql','utf8'))).rows;assert.ok(safetyChecks.every(x=>x.passed));
console.log('PAYMENTS_LOCAL=PASS (isolated PGlite queued connection; no bank requests or live credit mutation)');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
