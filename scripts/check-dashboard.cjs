// Actual migration and authenticated API in an isolated SQL fixture, no hosted resources.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const admin=randomUUID(),user=randomUUID(),pending=randomUUID();let actor=admin,db;const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;const native=Module.createRequire(file);m.require=name=>{
 if(name==='server-only')return {};
 if(name==='@supabase/supabase-js')return {createClient:()=>({rpc:async(name,p)=>{assert.equal(name,'radas_v4_video_examples_operation');try{return {data:await operation(p.p_actor,p.p_action,p.p_example),error:null};}catch(e){return {data:null,error:e};}}})};
 const resolved=name.startsWith('@/')?path.resolve('src',name.slice(2)+'.ts'):name.startsWith('.')?path.resolve(path.dirname(file),name+'.ts'):null;
 if(resolved?.split(path.sep).join('/').endsWith('/supabase/server.ts'))return {createClient:async()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null},error:null})}})};
 return resolved?load(resolved):native(name);
 };m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports;}
async function as(role,jwt,sql,params=[]){await db.exec('begin;set local role '+role);try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:jwt})]);const r=await db.query(sql,params);await db.exec('commit');return r;}catch(e){await db.exec('rollback');throw e;}}
async function operation(who,action,example=null){return(await as('service_role','service_role','select public.radas_v4_video_examples_operation($1,$2,$3) as result',[who,action,example])).rows[0].result;}
const file=suffix=>'supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith(suffix));
(async()=>{db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;insert into auth.users values('${admin}',now()),('${user}',now()),('${pending}',null);`);
 await db.exec(fs.readFileSync(file('_credit_engine.sql'),'utf8'));await db.exec(`create table radas_v4.payment_admins(user_id uuid primary key);insert into radas_v4.payment_admins values('${admin}');`);
 const before=(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='radas_v4'::regnamespace order by proname")).rows;
 const migration=fs.readFileSync(file('_dashboard_video_examples.sql'),'utf8');await db.exec(migration);
 const after=(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='radas_v4'::regnamespace order by proname")).rows;for(const item of before)assert.deepEqual(after.find(p=>p.proname===item.proname),item);
 assert.equal((await operation(user,'list')).examples.length,0,'No invented examples seeded');
 const types=load('src/lib/video-examples/types.ts'),base={id:randomUUID(),title:'UGC fixture',videoId:'abcdefghijk',description:'A sample video.',sortOrder:10,published:true,revision:0};
 const variants=[base,{...base,videoId:'',published:false},...['','https://evil.invalid','a'.repeat(12),'<iframe>'].map(videoId=>({...base,videoId})),{...base,extra:'x'},{...base,revision:-1},{...base,sortOrder:10000},{...base,sortOrder:1.5},{...base,published:null},{...base,title:' '},{...base,description:'x'.repeat(241)},null,[],{}];
 for(const v of variants)assert.equal((await db.query('select radas_v4.video_example_valid($1) as valid',[v])).rows[0].valid,types.validExample(v),JSON.stringify(v));
 for(const link of ['https://youtu.be/abcdefghijk?si=x','https://www.youtube.com/watch?v=abcdefghijk&t=2','https://youtube.com/shorts/abcdefghijk','https://m.youtube.com/watch?v=abcdefghijk','https://www.youtube.com/embed/abcdefghijk'])assert.equal(types.youtubeVideoId(link),base.videoId);
 for(const link of ['http://youtu.be/abcdefghijk','https://youtube.com.evil.invalid/watch?v=abcdefghijk','https://user@youtube.com/watch?v=abcdefghijk','https://youtu.be:444/abcdefghijk','https://youtube.com/watch?v=abcdefghijk&v=12345678901','https://youtube.com/watch?v=short','<iframe src=x>','https://youtube.com/redirect?q=x','https://www.youtube-nocookie.com/embed/abcdefghijk'])assert.equal(types.youtubeVideoId(link),null,link);
 console.log('PASS canonical YouTube ID/link validation, SQL/TS shape parity, unseeded gallery and unchanged existing functions');
 for(const role of ['anon','authenticated']){await assert.rejects(as(role,role,'select public.radas_v4_video_examples_operation($1,$2,null)',[admin,'admin_list']),/permission denied/);for(const table of ['video_examples','video_example_audit'])await assert.rejects(as(role,role,'select * from radas_v4.'+table),/permission denied/);}
 await assert.rejects(as('service_role','authenticated','select public.radas_v4_video_examples_operation($1,$2,null)',[admin,'list']),/server_only/);
 for(const action of ['admin_list','save','delete'])await assert.rejects(operation(user,action,base),/forbidden/);
 await assert.rejects(operation(pending,'list'),/unauthorized/);
 const audit=async()=>(await db.query('select count(*)::int n from radas_v4.video_example_audit')).rows[0].n;
 let saved=(await operation(admin,'save',base)).examples[0];assert.equal(saved.revision,1);await operation(admin,'save',base);assert.equal(await audit(),1);
 await assert.rejects(operation(admin,'save',{...base,title:'Competing update'}),/example_conflict/);
 const draft={...base,id:randomUUID(),title:'Draft fixture',published:false,videoId:'',sortOrder:0};await operation(admin,'save',draft);
 assert.equal((await operation(user,'list')).examples.length,1);assert.equal((await operation(admin,'list')).examples.length,1,'Admin dashboard also only shows Published');assert.equal((await operation(admin,'admin_list')).examples[0].id,draft.id);
 types.parseExamples(await operation(user,'list'));assert.throws(()=>types.parseExamples({admin:false,examples:[{...draft,revision:1}]}),/invalid_examples/);
 saved=(await operation(admin,'save',{...saved,sortOrder:0,published:false})).examples.find(e=>e.id===base.id);assert.equal((await operation(user,'list')).examples.length,0);
 await db.exec("create function radas_v4.fixture_fail_audit() returns trigger language plpgsql as $$begin raise exception 'fixture_failure';end$$;create trigger fixture_fail before insert on radas_v4.video_example_audit for each row execute function radas_v4.fixture_fail_audit();");
 await assert.rejects(operation(admin,'save',{...saved,title:'Must roll back'}),/fixture_failure/);assert.deepEqual((await operation(admin,'admin_list')).examples.find(e=>e.id===saved.id),saved);await db.exec('drop trigger fixture_fail on radas_v4.video_example_audit');
 const count=await audit();await operation(admin,'delete',saved);await operation(admin,'delete',saved);assert.equal(await audit(),count+1);await assert.rejects(operation(admin,'save',base),/example_conflict/);
 console.log('PASS service-only/admin/confirmed-user/RLS gates, Published filtering, ordering, stale revision conflicts, response replay, delete tombstones and audit rollback');
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://fyqvvkpzcwrmyozxlqkw.supabase.co',SUPABASE_SECRET_KEY:'fixture-secret',APP_URL:'http://localhost:3000'});
 const route=load('src/app/api/video-examples/route.ts'),url='http://localhost:3000/api/video-examples';const req=(body,origin='http://localhost:3000')=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 actor=null;assert.equal((await route.GET(new Request(url))).status,401);actor=user;assert.equal((await route.GET(new Request(url+'?admin=1'))).status,403);assert.equal((await route.POST(req({action:'save',example:base}))).status,403);actor=admin;
 assert.equal((await route.GET(new Request(url+'?admin=1&admin=1'))).status,400);assert.equal((await route.GET(new Request(url+'?extra=1'))).status,400);assert.equal((await route.POST(req({action:'save',example:base},'https://evil.invalid'))).status,403);
 assert.equal((await route.POST(req({action:'save',example:{...base,iframe:'x'}}))).status,400);assert.equal((await route.POST(req({action:'save',example:{...base,description:'x'.repeat(17000)}}))).status,413);
 const entry={...base,id:randomUUID()};const response=await route.POST(req({action:'save',example:entry}));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).examples.some(e=>e.id===entry.id),true);
 assert.equal((await route.POST(req({action:'save',example:entry}))).status,200);assert.equal((await route.POST(req({action:'save',example:{...entry,title:'Conflict'}}))).status,409);
 assert.deepEqual((await db.query('select (select count(*)::int from radas_v4.credit_wallets) wallets,(select count(*)::int from radas_v4.credit_transactions) ledger')).rows[0],{wallets:0,ledger:0});
 await assert.rejects(db.exec(migration),/already exists/);await db.exec('rollback');assert.ok((await operation(admin,'admin_list')).examples.length);
 console.log('PASS actual authenticated API, same-origin/strict query/body limits, retained-ID replay, fail-closed errors; zero wallet/ledger writes; DASHBOARD_SQL_API=PASS');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
