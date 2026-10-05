// Isolated affiliate SQL and actual HTTP route verification. No live network.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const admin=randomUUID(),user=randomUUID(),other=randomUUID();
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;insert into auth.users values('${admin}','wancupie@gmail.com',now()),('${user}','fixture@example.com',now()),('${other}','other@example.com',now());`);
for(const suffix of ['_credit_engine.sql','_generation_flow.sql','_credit_safety.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
await require('./storage-fixture.cjs').installStorage(db);await db.exec('alter table storage.objects add column created_at timestamptz default now();');
for(const suffix of ['_auto_cleanup.sql','_manual_payments.sql','_payment_safety.sql']) {
 if(suffix==='_payment_safety.sql') { await as('service_role',admin,'select public.radas_v4_credit_apply($1,$2,$3)',[admin,'topup','legacy-before-phase12']); await as('service_role',other,'select public.radas_v4_credit_apply($1,$2,$3)',[other,'topup','legacy-other']); }
 await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix)),'utf8'));
}
assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[admin])).rows[0].balance,60);
async function as(role,actor,sql,params=[]){await db.exec(`begin;set local role ${role};select set_config('request.jwt.claims','${JSON.stringify({role,sub:actor})}',true);`);try{const result=await db.query(sql,params);await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}}
async function op(actor,action,body={}){return(await as('service_role',actor,'select public.radas_v4_payment_operation($1,$2,$3,$4,$5,$6,$7) as result',[actor,action,body.id??null,body.packageId??null,body.reference??null,body.amountSen??null,body.reason??null])).rows[0].result;}

const migration='supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_affiliate_catalog.sql'));
await db.exec(fs.readFileSync(migration,'utf8'));
await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_affiliate_drafts.sql')),'utf8'));
await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_affiliate_optional_links.sql')),'utf8'));
async function cat(actor,action,product=null){return (await as('service_role',actor,'select public.radas_v4_affiliate_operation($1,$2,$3) result',[actor,action,product])).rows[0].result;}
const product={id:randomUUID(),name:'Fixture Blender',imageUrl:'https://example.com/image.jpg',category:'Dapur',priceSen:9900,commissionSen:2000,url:'https://example.com/product',reviewedOn:new Date().toISOString().slice(0,10),contentTypes:['POV','UGC'],published:false,revision:0};
for(const role of ['anon','authenticated'])await assert.rejects(as(role,user,'select public.radas_v4_affiliate_operation($1,$2)',[user,'list']),/permission denied/);
for(const table of ['affiliate_products','affiliate_audit'])for(const role of ['anon','authenticated','service_role'])await assert.rejects(as(role,user,'select * from radas_v4.'+table),/permission denied/);
await assert.rejects(cat(null,'list'),/unauthorized/);await assert.rejects(cat(user,'admin_list'),/forbidden/);await assert.rejects(cat(user,'save',product),/forbidden/);
assert.equal((await cat(user,'list')).access,'locked');assert.equal((await cat(other,'list')).access,'locked');assert.equal((await cat(admin,'admin_list')).access,'allowed');
let saved=await cat(admin,'save',product);assert.equal(saved.products[0].revision,1);await cat(admin,'save',product);assert.equal((await db.query('select count(*)::int n from radas_v4.affiliate_audit')).rows[0].n,1);
assert.equal((await cat(admin,'list')).products.length,0);
let current=saved.products[0];current={...current,published:true};saved=await cat(admin,'save',current);current=saved.products[0];
let payment=randomUUID();await op(user,'create',{id:payment,packageId:'try'});assert.equal((await cat(user,'list')).access,'locked');await op(user,'submit',{id:payment,reference:'AFFILIATE-BANK'});assert.equal((await cat(user,'list')).access,'locked');await op(admin,'approve',{id:payment,reference:'AFFILIATE-BANK',amountSen:500});
assert.equal((await cat(user,'list')).products.length,1);assert.equal((await cat(other,'list')).products.length,0);
for(let i=0;i<60;i++)await as('service_role',user,'select public.radas_v4_credit_apply($1,$2,$3)',[user,'debit','fixture-'+i]);
assert.equal((await cat(user,'list')).access,'locked');assert.equal((await cat(user,'list')).products.length,0);
payment=randomUUID();await op(user,'create',{id:payment,packageId:'try'});await op(user,'submit',{id:payment,reference:'AFFILIATE-RESTORE'});await op(admin,'approve',{id:payment,reference:'AFFILIATE-RESTORE',amountSen:500});assert.equal((await cat(user,'list')).access,'allowed');
console.log('PASS approved top-up plus positive balance; pending/no top-up/zero denied; top-up restores; admin independent of balance; published-only');
await assert.rejects(cat(admin,'save',{...product,name:'stale'}),/catalog_conflict/);await assert.rejects(cat(admin,'delete',product),/catalog_conflict/);
for(const bad of [{...current,url:'javascript:alert(1)'},{...current,imageUrl:'http://example.com/image'},{...current,priceSen:-1},{...current,commissionSen:10000},{...current,reviewedOn:'2026-02-30'},{...current,contentTypes:['invented']},{...current,contentTypes:['UGC','UGC']},{...current,admin:true},{...current,name:null},{...current,revision:0.5}])await assert.rejects(cat(admin,'save',bad),/invalid_product/);
const before=(await db.query('select count(*)::int n from radas_v4.credit_transactions')).rows[0].n;
await cat(admin,'delete',current);await cat(admin,'delete',current);assert.equal((await cat(user,'list')).products.length,0);assert.equal((await db.query('select count(*)::int n from radas_v4.credit_transactions')).rows[0].n,before);
console.log('PASS strict product fields, unsafe URLs, stale revision denial, same-ID save/delete replay, private audit; no credit mutations');
let actor=user;const mods={};function load(file){if(mods[file])return mods[file];const m={exports:{}};const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',out)(name=>{if(name==='server-only')return{};if(name==='@supabase/supabase-js')return{createClient:()=>({rpc:async(name,p)=>{try{return{data:await cat(p.p_actor,p.p_action,p.p_product),error:null};}catch(error){return{data:null,error};}}})};if(name==='@/lib/supabase/server'||name==='../supabase/server')return{createClient:async()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null},error:null})}})};if(name.startsWith('@/'))return load(path.resolve('src',name.slice(2))+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');return require(name);},m,m.exports);mods[file]=m.exports;return m.exports;}
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fyqvvkpzcwrmyozxlqkw.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-not-live';process.env.APP_URL='http://localhost:3000';
const route=load(path.resolve('src/app/api/affiliate/route.ts')),types=load(path.resolve('src/lib/affiliate/types.ts'));
const req=(body,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/affiliate',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
actor=null;assert.equal((await route.GET(new Request('http://localhost:3000/api/affiliate'))).status,401);actor=user;assert.equal((await route.GET(new Request('http://localhost:3000/api/affiliate?admin=1'))).status,403);
assert.equal((await route.POST(req({action:'save',product}))).status,403);actor=admin;
assert.equal((await route.POST(req({action:'save',product},'https://evil.example'))).status,403);
assert.equal((await route.POST(req({action:'save',product,userId:other}))).status,400);
assert.equal((await route.POST(req({action:'save',product:{...product,url:'javascript:alert(1)'}}))).status,400);
assert.equal((await route.POST(req({action:'save',product}))).status,200);
const response=await route.GET(new Request('http://localhost:3000/api/affiliate?admin=1'));assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(types.parseCatalog(await response.json()).products.length,1);
assert.equal((await route.GET(new Request('http://localhost:3000/api/affiliate?userId='+other))).status,400);
for(const invalid of [null,{admin:false,access:'locked',products:[product]},{admin:false,access:'allowed',products:[product]},{admin:false,access:'allowed',products:[{...product,published:true,url:'http://example.com'}]}])assert.throws(()=>types.parseCatalog(invalid));
// Draft SQL + real route, publication transition, private notes, import replay.
const incomplete={...product,id:randomUUID(),name:'Name-only draft',imageUrl:'',category:'',priceSen:null,commissionSen:null,url:'',reviewedOn:'',contentTypes:[],published:false,revision:0,sourceNotes:'RM161.59 source only'};
assert.equal(types.validProduct(incomplete),true);assert.equal(types.completeProduct(incomplete),false);
assert.equal((await route.POST(req({action:'save',product:incomplete}))).status,200);
let draftSaved=(await cat(admin,'admin_list')).products.find(p=>p.id===incomplete.id);
assert.equal(draftSaved.priceSen,null);assert.equal(draftSaved.reviewedOn,'');
assert.equal((await cat(user,'list')).products.some(p=>p.id===incomplete.id),false);
assert.throws(()=>types.parseCatalog({admin:false,access:'allowed',products:[draftSaved]}));
for(const bad of [{...draftSaved,published:true},{...draftSaved,name:''},{...draftSaved,url:'http://example.com'},{...draftSaved,priceSen:-1},{...draftSaved,contentTypes:['UGC','UGC']},{...draftSaved,reviewedOn:'2026-02-30'},{...draftSaved,sourceNotes:null},{...draftSaved,sourceNotes:'x'.repeat(4001)},{...draftSaved,revision:2147483647}]) {
 assert.equal(types.validProduct(bad),false);await assert.rejects(cat(admin,'save',bad),/invalid_product/);
 assert.equal((await route.POST(req({action:'save',product:bad}))).status,400);
}
// Required fields cannot be missing/null, even for drafts (explicit blanks only).
for(const field of Object.keys(product)) {const bad={...draftSaved};delete bad[field];assert.equal(types.validProduct(bad),false);await assert.rejects(cat(admin,'save',bad),/invalid_product/);}
let ready={...product,id:incomplete.id,revision:draftSaved.revision,published:true,sourceNotes:incomplete.sourceNotes};
ready=(await cat(admin,'save',ready)).products.find(p=>p.id===ready.id);
assert.equal((await cat(user,'list')).products.find(p=>p.id===ready.id).sourceNotes,undefined);
assert.equal((await cat(admin,'list')).products.find(p=>p.id===ready.id).sourceNotes,undefined);
assert.equal((await cat(admin,'admin_list')).products.find(p=>p.id===ready.id).sourceNotes,incomplete.sourceNotes);
ready=(await cat(admin,'save',{...ready,imageUrl:'',url:''})).products.find(p=>p.id===ready.id);
assert.equal(ready.published,true);assert.equal(ready.imageUrl,'');assert.equal(ready.url,'');
assert.equal(types.completeProduct(ready),true);assert.equal(types.parseCatalog(await cat(user,'list')).products.find(p=>p.id===ready.id).url,'');
assert.equal((await route.POST(req({action:'save',product:ready}))).status,200);
ready=(await cat(admin,'admin_list')).products.find(p=>p.id===ready.id);
for(const field of ['imageUrl','url'])for(const value of ['Akan Dikemaskini','http://example.com','javascript:alert(1)',' https://example.com','https://example.com\\unsafe',null]) {const bad={...ready,[field]:value};assert.equal(types.validProduct(bad),false);await assert.rejects(cat(admin,'save',bad),/invalid_product/);}
for(const change of [{category:''},{priceSen:null},{commissionSen:null},{reviewedOn:''},{contentTypes:[]}]) {const bad={...ready,...change};assert.equal(types.completeProduct(bad),false);await assert.rejects(cat(admin,'save',bad),/invalid_product/);}
const downgraded=(await cat(admin,'save',{...ready,published:false,imageUrl:''})).products.find(p=>p.id===ready.id);
await assert.rejects(cat(user,'delete',downgraded),/forbidden/);await cat(admin,'delete',downgraded);
const fixtures=JSON.parse(fs.readFileSync('scripts/fixtures/affiliate-txt-v1.json','utf8'));
assert.equal(fixtures.length,99);assert.equal(new Set(fixtures.map(p=>p.name.toLowerCase())).size,99);assert.ok(fixtures.every(p=>types.validProduct(p)&&!p.published));
assert.ok(fixtures.every(p=>p.category===''&&p.imageUrl===''&&p.url===''&&p.reviewedOn===''&&p.contentTypes.length===0));
for(const number of ['007','020','034','043'])assert.equal(fixtures.find(p=>p.sourceNotes.includes('#'+number+'\n')).commissionSen,null);
assert.equal(fixtures.find(p=>p.sourceNotes.includes('#020\n')).priceSen,null);
assert.ok(!fixtures.some(p=>/#(?:022|026)\n/.test(p.sourceNotes)));
const snapshot=async()=>JSON.stringify((await db.query('select (select jsonb_agg(w order by user_id) from radas_v4.credit_wallets w) wallets,(select jsonb_agg(t order by id) from radas_v4.credit_transactions t) ledger,(select jsonb_agg(p order by id) from radas_v4.payments p) payments')).rows);
const beforeImport=await snapshot();const existingCount=(await cat(admin,'admin_list')).products.length;
const importSQL=fs.readFileSync('supabase/import-affiliate-txt-v1.sql','utf8');
// A failure late in the import rolls back all earlier inserts and audit rows.
const auditPreImport=(await db.query('select count(*)::int n from radas_v4.affiliate_audit')).rows[0].n;
await assert.rejects(db.exec(importSQL.replace('"name": "SWISS THOMAS 5.5L ELECTRIC DOUGH MIXER"','"name": ""')),/invalid_import_product/);
await db.exec('rollback');
assert.equal((await cat(admin,'admin_list')).products.length,existingCount);
assert.equal((await db.query('select count(*)::int n from radas_v4.affiliate_audit')).rows[0].n,auditPreImport);
await db.exec('insert into radas_v4.payment_admins(user_id) values ($$'+other+'$$)');
await assert.rejects(db.exec(importSQL),/Set v_actor/);await db.exec('rollback');
await db.query('delete from radas_v4.payment_admins where user_id=$1',[other]);
await db.exec(importSQL);
assert.equal((await cat(admin,'admin_list')).products.length,existingCount+99);
const imported=(await cat(admin,'admin_list')).products.find(p=>p.id===fixtures[0].id);
assert.equal(imported.revision,1);assert.equal(imported.published,false);
const changed={...imported,sourceNotes:imported.sourceNotes+'\nAdmin edited'};
await cat(admin,'save',changed);
const auditBefore=(await db.query('select count(*)::int n from radas_v4.affiliate_audit')).rows[0].n;
await db.exec(importSQL);
assert.equal((await cat(admin,'admin_list')).products.find(p=>p.id===changed.id).sourceNotes,changed.sourceNotes);
assert.equal((await db.query('select count(*)::int n from radas_v4.affiliate_audit')).rows[0].n,auditBefore);
assert.equal(await snapshot(),beforeImport);
assert.ok(!(await cat(user,'list')).products.some(p=>fixtures.some(f=>f.id===p.id)));
// Deduplicate an existing same-name entry with a different ID.
await cat(admin,'delete',(await cat(admin,'admin_list')).products.find(p=>p.id===fixtures[1].id));
const sameName={...fixtures[1],id:randomUUID(),name:'  '+fixtures[1].name+'  '};sameName.name=sameName.name.trim();
await cat(admin,'save',sameName);await db.exec(importSQL);
assert.ok(!(await cat(admin,'admin_list')).products.some(p=>p.id===fixtures[1].id));
assert.equal((await cat(admin,'admin_list')).products.length,existingCount+99);
console.log('PASS draft SQL/HTTP validation, complete publish required, unpublished-only blanks, private source notes, 99 names, duplicate-name and replay safety, admin edits preserved; wallet/payment/ledger unchanged');
const checks=(await db.query(fs.readFileSync('supabase/verify-affiliate.sql','utf8'))).rows;assert.ok(checks.every(c=>c.passed));
await assert.rejects(db.exec(fs.readFileSync(migration,'utf8')),/affiliate_already_installed/);await db.exec('rollback');
console.log('PASS real route auth, admin denial, CSRF, spoofed fields, safe response parsing, no-store headers, SQL verification and migration rerun guard');
console.log('AFFILIATE_LOCAL=PASS (isolated SQL/TS/HTTP routes; live admin and mobile visual acceptance separate)');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
