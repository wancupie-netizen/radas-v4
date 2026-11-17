// Real SQL and route code in an isolated fixture. No hosted database, provider POST or customer data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const admin=randomUUID(),user=randomUUID(),unconfirmed=randomUUID();let actor=admin,db;
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;const native=Module.createRequire(file);m.require=name=>{
 if(name==='server-only')return {};
 if(name==='@supabase/supabase-js')return {createClient:()=>({rpc:async(name,p)=>{try{return {data:name==='radas_v4_affiliate_sold_operation'?await sold(p.p_actor,p.p_id,p.p_revision,p.p_sold_text,p.p_sold_checked_on):await cat(p.p_actor,p.p_action,p.p_product),error:null};}catch(error){return {data:null,error};}}})};
 const resolved=name.startsWith('@/')?path.resolve('src',name.slice(2)+'.ts'):name.startsWith('.')?path.resolve(path.dirname(file),name+'.ts'):null;
 if(resolved?.split(path.sep).join('/').endsWith('/supabase/server.ts'))return {createClient:async()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null},error:null})}})};
 return resolved?load(resolved):native(name);
};m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
async function as(role,jwt,query,params=[]){await db.exec('begin;set local role '+role);try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:jwt})]);const r=await db.query(query,params);await db.exec('commit');return r;}catch(e){await db.exec('rollback');throw e;}}
async function cat(who,action,product=null){return(await as('service_role','service_role','select public.radas_v4_affiliate_operation($1,$2,$3) as result',[who,action,product])).rows[0].result;}
async function sold(who,id,revision,text,day){return(await as('service_role','service_role','select public.radas_v4_affiliate_sold_operation($1,$2,$3,$4,$5) as result',[who,id,revision,text,day])).rows[0].result;}
const file=suffix=>'supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix));
(async()=>{db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
 insert into auth.users values('${admin}','admin@fixture.invalid',now()),('${user}','user@fixture.invalid',now()),('${unconfirmed}','pending@fixture.invalid',null);`);
 await db.exec(fs.readFileSync(file('_credit_engine.sql'),'utf8'));
 await db.exec(`create table radas_v4.payment_admins(user_id uuid primary key references auth.users(id));insert into radas_v4.payment_admins values('${admin}');create table radas_v4.payments(user_id uuid,status text);`);
 for(const suffix of ['_affiliate_catalog.sql','_affiliate_drafts.sql','_affiliate_optional_links.sql','_open_affiliate_catalog.sql','_affiliate_admin_newest_first.sql','_affiliate_customer_newest_first.sql'])await db.exec(fs.readFileSync(file(suffix),'utf8'));
 const types=load('src/lib/affiliate/types.ts'),fields=load('src/lib/affiliate/sold.ts');const day=fields.soldToday();
 assert.equal(fields.soldToday(new Date('2026-11-17T17:00:00Z')),'2026-11-18');
 const base={id:randomUUID(),name:'Fixture Product',imageUrl:'',category:'Home',priceSen:3300,commissionSen:330,url:'',reviewedOn:day,contentTypes:['UGC'],published:true,revision:0,sourceNotes:'Admin-only fixture notes'};
 let product=(await cat(admin,'save',base)).products[0];const draft={...base,id:randomUUID(),name:'Name-only draft',category:'',priceSen:null,commissionSen:null,reviewedOn:'',contentTypes:[],published:false};await cat(admin,'save',draft);
 const snapshots=async()=>JSON.stringify((await db.query('select (select jsonb_agg(p order by id) from radas_v4.affiliate_products p) products,(select jsonb_agg(a order by id) from radas_v4.affiliate_audit a) audit,(select jsonb_agg(w order by user_id) from radas_v4.credit_wallets w) wallets,(select jsonb_agg(t order by id) from radas_v4.credit_transactions t) ledger')).rows);
 const before=await snapshots();const originals=(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where oid in ('radas_v4.affiliate_valid_product(jsonb)'::regprocedure,'radas_v4.affiliate_operation(uuid,text,jsonb)'::regprocedure) order by proname")).rows;
 await db.exec(fs.readFileSync(file('_affiliate_sold.sql'),'utf8'));assert.equal(await snapshots(),before,'Migration must not backfill/rewrite any product, audit or credit row');
 for(const original of originals){const signature=original.proname==='affiliate_operation'?'uuid,text,jsonb':'jsonb';const copied=(await db.query('select pg_get_functiondef($1::regprocedure) as definition',['radas_v4.'+original.proname+'_before_sold('+signature+')'])).rows[0].definition;assert.equal(copied,original.definition.replace('FUNCTION radas_v4.'+original.proname+'(','FUNCTION radas_v4.'+original.proname+'_before_sold('));}
 for(const role of ['anon','authenticated'])await assert.rejects(as(role,role,'select public.radas_v4_affiliate_sold_operation($1,$2,$3,$4,$5)',[admin,base.id,1,'250',day]),/permission denied/);
 await assert.rejects(as('service_role','authenticated','select public.radas_v4_affiliate_sold_operation($1,$2,$3,$4,$5)',[admin,base.id,1,'250',day]),/server_only/);
 await assert.rejects(sold(user,base.id,1,'250',day),/forbidden/);await assert.rejects(sold(unconfirmed,base.id,1,'250',day),/unauthorized/);
 for(const query of ['select radas_v4.affiliate_valid_product_before_sold(null::jsonb)','select radas_v4.affiliate_operation_before_sold(null::uuid,null::text,null::jsonb)'])await assert.rejects(as('service_role','service_role',query),/permission denied/);
 const cases=[{}, {soldText:'',soldCheckedOn:''},...['0','250','1,250','1.2K','10K+','0.5k','1M+','999,999,999'].map(soldText=>({soldText,soldCheckedOn:day})),...['-1','1.23','1,2','1.2K sold',' 250','250 ','<script>','x'.repeat(21),'01','1.234K'].map(soldText=>({soldText,soldCheckedOn:day})),{soldText:'250'},{soldCheckedOn:day},{soldText:null,soldCheckedOn:day},{soldText:'250',soldCheckedOn:''},{soldText:'',soldCheckedOn:day},{soldText:'250',soldCheckedOn:'2026-02-30'},{soldText:'250',soldCheckedOn:'9999-01-01'}];
 for(const value of cases){const sql=(await db.query('select radas_v4.affiliate_valid_sold_fields($1) as valid',[value])).rows[0].valid;assert.equal(sql,fields.validSoldFields(value),JSON.stringify(value));assert.equal(types.validProduct({...product,...value}),sql);}
 console.log('PASS additive migration snapshots and copied live behavior; browser/service JWT/admin guards; TS/SQL sold format/date parity, legacy blanks and MYT day boundary');
 const count=async()=>(await db.query('select count(*)::int as n from radas_v4.affiliate_audit')).rows[0].n;const auditBefore=await count();
 let result=await sold(admin,product.id,product.revision,'10K+',day);let saved=result.products.find(p=>p.id===product.id);
 assert.equal(saved.soldText,'10K+');assert.deepEqual({...saved,soldText:undefined,soldCheckedOn:undefined,revision:0},{...product,soldText:undefined,soldCheckedOn:undefined,revision:0});assert.equal(await count(),auditBefore+1);
 await sold(admin,product.id,product.revision,'10K+',day);assert.equal(await count(),auditBefore+1,'Lost response replay must not create another audit/revision');
 await assert.rejects(sold(admin,product.id,product.revision,'20K+',day),/catalog_conflict/);
 const legacy={...saved,name:'Edited by a cached older form'};delete legacy.soldText;delete legacy.soldCheckedOn;
 saved=(await cat(admin,'save',legacy)).products.find(p=>p.id===product.id);assert.equal(saved.soldText,'10K+');assert.equal(saved.soldCheckedOn,day);assert.equal(saved.name,legacy.name);
 assert.equal((await cat(user,'list')).products.some(p=>p.id===draft.id),false);assert.equal((await cat(user,'list')).products.find(p=>p.id===product.id).sourceNotes,undefined);
 assert.equal(types.parseCatalog(await cat(user,'list')).products.find(p=>p.id===product.id).soldText,'10K+');
 const fresh=(await cat(admin,'admin_list')).products.find(p=>p.id===draft.id);const editedDraft=(await sold(admin,fresh.id,fresh.revision,'250',day)).products.find(p=>p.id===fresh.id);assert.equal(editedDraft.published,false);assert.equal(editedDraft.priceSen,null);
 const cleared=(await sold(admin,saved.id,saved.revision,'','')).products.find(p=>p.id===saved.id);assert.equal(cleared.soldText,'');assert.equal(cleared.soldCheckedOn,'');
 console.log('PASS sold-only updates preserve other fields, private notes and drafts; stale revision conflicts; idempotent replay; cached legacy forms preserve sold snapshots; explicit clear');
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://fyqvvkpzcwrmyozxlqkw.supabase.co',SUPABASE_SECRET_KEY:'fixture-not-live',APP_URL:'http://localhost:3000'});
 const route=load('src/app/api/affiliate/route.ts');const req=(body,origin='http://localhost:3000')=>new Request('http://localhost:3000/api/affiliate',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 const update={id:cleared.id,revision:cleared.revision,soldText:'1.2K',soldCheckedOn:day};
 actor=null;assert.equal((await route.POST(req({action:'sold',product:update}))).status,401);actor=user;assert.equal((await route.POST(req({action:'sold',product:update}))).status,403);actor=admin;
 assert.equal((await route.POST(req({action:'sold',product:update},'https://evil.invalid'))).status,403);
 assert.equal((await route.POST(req({action:'sold',product:{...update,name:'overwrite'}}))).status,400);
 assert.equal((await route.POST(req({action:'sold',product:{...update,soldText:'<img>'}}))).status,400);
 assert.equal((await route.POST(req({action:'sold',product:{...update,id:randomUUID()}}))).status,409);
 const response=await route.POST(req({action:'sold',product:update}));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).products.find(p=>p.id===update.id).soldText,'1.2K');
 assert.equal((await route.POST(req({action:'sold',product:update}))).status,200);assert.equal((await route.POST(req({action:'sold',product:{...update,soldText:'999'}}))).status,409);
 const financial=await db.query('select (select count(*)::int from radas_v4.credit_transactions) transactions,(select count(*)::int from radas_v4.credit_wallets) wallets');assert.deepEqual(financial.rows[0],{transactions:0,wallets:0});
 await assert.rejects(db.exec(fs.readFileSync(file('_affiliate_sold.sql'),'utf8')),/affiliate_sold_already_installed/);await db.exec('rollback');
 console.log('PASS actual API auth/origin/allowlist, missing-product and stale-edit handling, persistence/replay and unchanged wallet/ledger; SOLD_SQL_LOCAL=PASS');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
