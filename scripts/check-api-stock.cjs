// Isolated stock SQL, actual server adapter/routes and client handlers. No live requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const admin=randomUUID(),user=randomUUID(),other=randomUUID();
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;insert into auth.users values('${admin}','wancupie@gmail.com',now()),('${user}','fixture@example.com',now()),('${other}','dekstop87@gmail.com',now());`);
for(const suffix of ['_credit_engine.sql','_generation_flow.sql','_credit_safety.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
await require('./storage-fixture.cjs').installStorage(db);await db.exec('alter table storage.objects add column created_at timestamptz default now();');
for(const suffix of ['_auto_cleanup.sql','_manual_payments.sql','_payment_safety.sql']) {
 if(suffix==='_payment_safety.sql') { await as('service_role',admin,'select public.radas_v4_credit_apply($1,$2,$3)',[admin,'topup','legacy-before-phase12']); await as('service_role',other,'select public.radas_v4_credit_apply($1,$2,$3)',[other,'topup','legacy-other']); }
 await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
}
assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[admin])).rows[0].balance,60);
async function as(role,actor,sql,params=[]){await db.exec(`begin;set local role ${role};select set_config('request.jwt.claims','${JSON.stringify({role,sub:actor})}',true);`);try{const result=await db.query(sql,params);await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}}
async function op(actor,action,body={}){return(await as('service_role',actor,'select public.radas_v4_payment_operation($1,$2,$3,$4,$5,$6,$7) as result',[actor,action,body.id??null,body.packageId??null,body.reference??null,body.amountSen??null,body.reason??null])).rows[0].result;}

const migration='supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_api_stock_summary.sql'));
await db.exec(fs.readFileSync(migration,'utf8'));
const groupMigration='supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_api_stock_account_groups.sql'));
await db.query("update auth.users set email='missing@example.com' where id=$1",[other]);
await assert.rejects(db.exec(fs.readFileSync(groupMigration,'utf8')),/verified_internal_account_missing/);await db.exec('rollback');
assert.equal((await db.query("select to_regclass('radas_v4.internal_stock_accounts') t")).rows[0].t,null);
await db.query("update auth.users set email='dekstop87@gmail.com' where id=$1",[other]);
await db.exec(fs.readFileSync(groupMigration,'utf8'));
await assert.rejects(op(other,'admin_list'),/forbidden/);
async function snapshot(actor){return(await as('service_role',actor,'select public.radas_v4_api_stock_snapshot($1) result',[actor])).rows[0].result;}
for(const role of ['anon','authenticated'])for(const fn of ['public.radas_v4_api_stock_snapshot','radas_v4.api_stock_snapshot'])await assert.rejects(as(role,admin,'select '+fn+'($1)',[admin]),/permission denied/);
await assert.rejects(snapshot(user),/forbidden/);await assert.rejects(snapshot(null),/unauthorized/);
for(const role of ['authenticated','service_role'])await assert.rejects(as(role,admin,'select * from radas_v4.credit_wallets'),/permission denied/);
let initial=await snapshot(admin);assert.equal(initial.outstandingCredits,120);assert.equal(initial.fundedAccounts,2);assert.equal(initial.internalAccounts,2);assert.equal(initial.internalCredits,120);assert.equal(initial.customerAccounts,0);assert.equal(initial.customerCredits,0);
for(const role of ['anon','authenticated','service_role'])await assert.rejects(as(role,admin,'select * from radas_v4.internal_stock_accounts'),/permission denied/);
await db.query("update auth.users set email='renamed@example.com' where id=$1",[other]);assert.equal((await snapshot(admin)).internalCredits,120);await db.query("update auth.users set email='dekstop87@gmail.com' where id=$1",[other]);
const payment=randomUUID();await op(user,'create',{id:payment,packageId:'try'});await op(user,'submit',{id:payment,reference:'STOCK-BANK'});assert.equal((await snapshot(admin)).outstandingCredits,120);
await op(admin,'approve',{id:payment,reference:'STOCK-BANK',amountSen:500});assert.equal((await snapshot(admin)).outstandingCredits,180);
await as('service_role',user,'select public.radas_v4_credit_apply($1,$2,$3)',[user,'debit','stock-video']);assert.equal((await snapshot(admin)).outstandingCredits,179);
await as('service_role',user,'select public.radas_v4_credit_apply($1,$2,$3)',[user,'refund','stock-video']);assert.equal((await snapshot(admin)).outstandingCredits,180);
const before=JSON.stringify((await db.query('select * from radas_v4.credit_transactions order by id')).rows);await snapshot(admin);assert.equal(JSON.stringify((await db.query('select * from radas_v4.credit_transactions order by id')).rows),before);
console.log('PASS admin-only aggregate SQL; all wallet balances included; pending excluded; approval/debit/refund reflected; no credit writes');
let actor=admin,providerCalls=0,providerData={ok:true,registered:true,credit:14.7,credit_cost:.15,telegram_id:'private-provider-id'},dbFailure=false,invalidDb=false;
const mods={};function load(file){file=path.resolve(file);if(mods[file])return mods[file];const m={exports:{}};mods[file]=m.exports;const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',out)(name=>{
if(name==='server-only')return{};
if(name==='@supabase/supabase-js')return{createClient:()=>({rpc:async(name,p)=>{assert.equal(name,'radas_v4_api_stock_snapshot');if(dbFailure)return{data:null,error:{code:'XX000',message:'private database text'}};if(invalidDb)return{data:{outstandingCredits:-1},error:null};try{return{data:await snapshot(p.p_actor),error:null};}catch(error){return{data:null,error};}}})};
if(name==='../supabase/server')return{createClient:async()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null},error:null})}})};
if(name.startsWith('@/'))return load(path.resolve('src',name.slice(2))+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');return require(name);},m,m.exports);mods[file]=m.exports;return m.exports;}
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fyqvvkpzcwrmyozxlqkw.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-not-live';process.env.NEXABOT_API_KEY='nxb_fixture';process.env.RADAS_PAYMENTS_ENABLED='true';
const original=global.fetch;global.fetch=async(url,init)=>{providerCalls++;assert.equal(url,'https://nexabot.id/api/v1/api/credit');assert.equal(init.method,'GET');assert.equal(init.cache,'no-store');assert.equal(init.headers['x-api-key'],'nxb_fixture');if(providerData==='fail')throw Error('private provider text');return Response.json(providerData);};
try{
const route=load('src/app/api/admin/api-stock/route.ts'),summary=load('src/lib/api-stock/summary.ts'),req=(query='')=>new Request('http://localhost:3000/api/admin/api-stock'+query);
actor=null;assert.equal((await route.GET(req())).status,401);actor=user;assert.equal((await route.GET(req())).status,403);assert.equal(providerCalls,0);actor=admin;
assert.equal((await route.GET(req('?actor='+user))).status,400);assert.equal(providerCalls,0);
process.env.RADAS_PAYMENTS_ENABLED='false';assert.equal((await route.GET(req())).status,503);process.env.RADAS_PAYMENTS_ENABLED='true';
let response=await route.GET(req());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);let result=summary.parseStockSummary(await response.json());assert.equal(result.availableVideos,98);assert.equal(result.status,'sufficient');assert.equal(result.customerAccounts,1);assert.equal(result.customerCredits,60);assert.equal(result.internalAccounts,2);assert.equal(result.internalCredits,120);assert.equal(result.requiredCredit,9);assert.equal(result.targetCredit,10.8);assert.equal(result.suggestedTopUp,0);assert.equal(result.totalRequiredCredit,27);assert.equal(result.totalTargetCredit,32.4);assert.equal(result.totalSuggestedTopUp,17.7);assert.equal('telegram_id'in result,false);
const wallet={outstandingCredits:60,fundedAccounts:1,walletCheckedAt:new Date().toISOString(),customerCredits:60,customerAccounts:1,internalCredits:0,internalAccounts:2,otherCredits:0,otherAccounts:0};
for(const [credit,status,topup] of [[0,'insufficient',10.8],[8.99,'insufficient',1.81],[9,'buffer_low',1.8],[10.79,'buffer_low',.01],[10.8,'sufficient',0],[15,'sufficient',0]]){let s=summary.calculateStock(wallet,{credit,creditCost:.15});assert.equal(s.status,status);assert.equal(s.suggestedTopUp,topup);}
assert.equal(summary.calculateStock({...wallet,outstandingCredits:0,fundedAccounts:0,customerCredits:0},{credit:0,creditCost:.15}).status,'sufficient');
for(const [n,required]of[[60,9],[120,18],[250,37.5],[620,93]])assert.equal(summary.calculateStock({...wallet,outstandingCredits:n,customerCredits:n},{credit:0,creditCost:.15}).requiredCredit,required);
assert.equal(summary.calculateStock(wallet,{credit:15,creditCost:.2}).requiredCredit,12);
for(const data of [null,{...result,status:'insufficient'},{...result,suggestedTopUp:1},{...result,internalCredits:0},{...result,totalRequiredCredit:0},{...result,outstandingCredits:-1},{...result,checkedAt:'invalid'},{...result,providerCredit:.001},{...result,creditCost:0}])assert.throws(()=>summary.parseStockSummary(data));
for(const mode of ['db','invalidDb','provider']){dbFailure=mode==='db';invalidDb=mode==='invalidDb';providerData=mode==='provider'?'fail':{ok:true,registered:true,credit:15,credit_cost:.15};response=await route.GET(req());assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'unavailable'});}dbFailure=invalidDb=false;
await db.query('insert into radas_v4.payment_admins values($1)',[other]);actor=other;assert.equal((await snapshot(other)).outstandingCredits,180);await db.query('delete from radas_v4.payment_admins where user_id=$1',[other]);let calls=providerCalls;assert.equal((await route.GET(req())).status,403);assert.equal(providerCalls,calls);actor=admin;
await db.query('update auth.users set email_confirmed_at=null where id=$1',[admin]);assert.equal((await route.GET(req())).status,403);await db.query('update auth.users set email_confirmed_at=now() where id=$1',[admin]);
console.log('PASS actual server/route auth, revoked admin, feature gate, no provider reads before authorization, no-store, sanitized outages and malformed snapshots');
console.log('PASS locked packages, zero stock, exact coverage/buffer boundaries, decimal-safe capacity, current provider cost and top-up deficit');
}finally{global.fetch=original;}
const internalPay=randomUUID();await op(other,'create',{id:internalPay,packageId:'try'});await op(other,'submit',{id:internalPay,reference:'STOCK-INTERNAL'});await op(admin,'approve',{id:internalPay,reference:'STOCK-INTERNAL',amountSen:500});let grouped=await snapshot(admin);assert.equal(grouped.customerAccounts,1);assert.equal(grouped.customerCredits,60);assert.equal(grouped.internalCredits,180);
// Remaining legacy/non-paying balances are visible in a separate group, never silently lost.
const legacy=randomUUID();await db.query('insert into auth.users values($1,$2,now())',[legacy,'legacy@example.com']);await db.query('insert into radas_v4.credit_wallets(user_id,balance) values($1,1)',[legacy]);await db.query("insert into radas_v4.credit_transactions(user_id,type,amount,reference,balance_before,balance_after) values($1,'refund',1,'legacy-fixture',0,1)",[legacy]);grouped=await snapshot(admin);assert.equal(grouped.otherCredits,1);assert.equal(grouped.otherAccounts,1);assert.equal(grouped.outstandingCredits,241);
const repeatedCustomerPay=randomUUID();await op(user,'create',{id:repeatedCustomerPay,packageId:'try'});await op(user,'submit',{id:repeatedCustomerPay,reference:'STOCK-CUSTOMER-SECOND'});await op(admin,'approve',{id:repeatedCustomerPay,reference:'STOCK-CUSTOMER-SECOND',amountSen:500});assert.equal((await snapshot(admin)).customerAccounts,1);
for(let i=0;i<120;i++)await as('service_role',user,'select public.radas_v4_credit_apply($1,$2,$3)',[user,'debit','stock-consumed-'+i]);grouped=await snapshot(admin);assert.equal(grouped.customerAccounts,1);assert.equal(grouped.customerCredits,0);assert.equal(grouped.internalCredits,180);
console.log('PASS stable user-ID internal labels, missing-account install rollback, unchanged admin privileges, internal test payments excluded, repeat customers counted once, other balances visible, paid customer retained at zero balance');
const checks=(await db.query(fs.readFileSync('supabase/verify-api-stock.sql','utf8'))).rows;assert.ok(checks.every(c=>c.passed),JSON.stringify(checks));
await assert.rejects(db.exec(fs.readFileSync(groupMigration,'utf8')),/stock_groups_already_installed/);await db.exec('rollback');
await assert.rejects(db.exec(fs.readFileSync(migration,'utf8')),/api_stock_already_installed/);await db.exec('rollback');
await require('./api-stock-ui-fixture.cjs')();
console.log('API_STOCK_LOCAL=PASS (isolated SQL, mocked provider GET, actual route and UI handlers; live snapshot separate)');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
