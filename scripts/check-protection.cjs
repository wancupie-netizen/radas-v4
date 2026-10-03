// Isolated real SQL + real server routes. Provider/Auth/transport are fixtures, never live.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{PGlite}=require('@electric-sql/pglite'),{randomUUID}=require('node:crypto');
const uid=randomUUID(),other=randomUUID(),admin=randomUUID(),unverified=randomUUID();let db,actor=uid,rpcCalls=0,paidPosts=0,creditReads=0,outage=false,badResponse=null;
let queue=Promise.resolve();function as(role,user,sql,params=[],claimRole=role){const run=queue.then(async()=>{await db.exec(`begin;set local role ${role};`);try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:claimRole,sub:user})]);const result=await db.query(sql,params);await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}});queue=run.catch(()=>{});return run;}
const rate=(user,scope,role='service_role',claimRole=role)=>as(role,user,'select public.radas_v4_request_limit($1,$2) result',[user,scope],claimRole).then(r=>r.rows[0].result);
const mods=new Map();function load(file){file=path.resolve(file);if(mods.has(file))return mods.get(file).exports;const m={exports:{}};mods.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>{
 if(name==='server-only')return{};
 if(name==='@supabase/supabase-js')return{createClient:()=>({rpc:async(name,p)=>{rpcCalls++;try{
  if(name==='radas_v4_request_limit'){if(outage)return{data:null,error:{message:'private_server_secret'}};if(badResponse)return{data:badResponse,error:null};return{data:await rate(p.p_user_id,p.p_scope),error:null};}
  if(name==='radas_v4_generation_operation')return{data:(await as('service_role',p.p_user_id,'select public.radas_v4_generation_operation($1,$2,$3,$4) result',[p.p_action,p.p_user_id,p.p_id,p.p_data])).rows[0].result,error:null};
  assert.equal(name,'radas_v4_payment_operation');return{data:(await payment(p.p_actor,p.p_action,{id:p.p_id,packageId:p.p_package,reference:p.p_reference,amountSen:p.p_amount,reason:p.p_reason})),error:null};
 }catch(error){return{data:null,error};}}})};
 let target=name.startsWith('@/')?path.resolve('src',name.slice(2)+'.ts'):name.startsWith('.')?path.resolve(path.dirname(file),name+'.ts'):null;
 if(target?.split(path.sep).join('/').endsWith('/supabase/server.ts'))return{createClient:async()=>({auth:{getUser:async()=>({data:{user:actor?{id:actor}:null},error:null})}})};
 if(target?.split(path.sep).join('/').endsWith('/nexabot/client.ts'))return{NexabotError:class extends Error{},createNexabotClient:()=>({getCredit:async()=>{creditReads++;return{credit:24,creditCost:0.15};},submitVideo:async()=>{paidPosts++;return{jobId:'fixture_job_001'};},getJob:async()=>({status:'processing'})})};
 return target?load(target):require(name);
},m,m.exports);return m.exports;}
async function payment(user,action,b={}){return(await as('service_role',user,'select public.radas_v4_payment_operation($1,$2,$3,$4,$5,$6,$7) result',[user,action,b.id??null,b.packageId??null,b.reference??null,b.amountSen??null,b.reason??null])).rows[0].result;}
function generationRequest(id,origin='http://localhost:3000'){const form=new FormData();for(const[k,v]of Object.entries({requestId:id,mode:'text',prompt:'A cat running in a field',orientation:'portrait',resolution:'720'}))form.set(k,v);return new Request('http://localhost:3000/api/generations',{method:'POST',headers:{origin,'x-user-id':other,'x-forwarded-for':'1.2.3.4'},body:form});}
function paymentRequest(body){return new Request('http://localhost:3000/api/payments',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(body)});}
(async()=>{db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;insert into auth.users values('${uid}','fixture@example.com',now()),('${other}','other@example.com',now()),('${admin}','wancupie@gmail.com',now()),('${unverified}','unverified@example.com',null);`);
 const migration=suffix=>fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith(suffix)),'utf8');
 for(const suffix of ['_credit_engine.sql','_generation_flow.sql','_credit_safety.sql'])await db.exec(migration(suffix));
 await require('./storage-fixture.cjs').installStorage(db);await db.exec('alter table storage.objects add column created_at timestamptz default now();');
 for(const suffix of ['_auto_cleanup.sql','_manual_payments.sql','_payment_safety.sql','_basic_protection.sql'])await db.exec(migration(suffix));
 for(const role of ['anon','authenticated'])await assert.rejects(rate(uid,'generation',role),/permission denied/);
 await assert.rejects(rate(uid,'generation','service_role','authenticated'),/server_only/);
 await assert.rejects(rate(unverified,'generation'),/unauthorized/);await assert.rejects(rate(null,'generation'),/unauthorized/);await assert.rejects(rate(uid,'custom-scope'),/invalid_scope/);
 await assert.rejects(as('service_role',uid,'delete from radas_v4.request_limits'),/permission denied/);
 await assert.rejects(as('authenticated',uid,'select * from radas_v4.request_limits'),/permission denied/);
 const burst=await Promise.all(Array.from({length:40},()=>rate(uid,'generation')));assert.equal(burst.filter(r=>r.allowed).length,12);assert.ok(burst.filter(r=>!r.allowed).every(r=>r.retryAfter>=1&&r.retryAfter<=60));
 assert.equal((await rate(other,'generation')).allowed,true);assert.equal((await rate(uid,'payment')).allowed,true);
 assert.equal((await db.query("select used from radas_v4.request_limits where user_id=$1 and scope='generation'",[uid])).rows[0].used,12);
 await db.query("update radas_v4.request_limits set window_start=clock_timestamp()-interval '1 minute' where user_id=$1 and scope='generation'",[uid]);assert.equal((await rate(uid,'generation')).allowed,true);assert.equal((await db.query("select used from radas_v4.request_limits where user_id=$1 and scope='generation'",[uid])).rows[0].used,1);
 console.log('PASS real SQL role/JWT/unverified identity guards, bounded per-user/scope counters, queued burst and one-minute reset');
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fyqvvkpzcwrmyozxlqkw.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-server-only-secret';process.env.APP_URL='http://localhost:3000';process.env.RADAS_GENERATION_ENABLED='true';process.env.RADAS_PAYMENTS_ENABLED='true';
 const POST=load('src/app/api/generations/route.ts').POST,PAY=load('src/app/api/payments/route.ts').POST;let count=rpcCalls;
 actor=null;assert.equal((await POST(generationRequest(randomUUID()))).status,401);assert.equal(rpcCalls,count);actor=uid;
 assert.equal((await POST(generationRequest(randomUUID(),'https://evil.example'))).status,403);assert.equal(rpcCalls,count);
 process.env.RADAS_GENERATION_ENABLED='false';assert.equal((await POST(generationRequest(randomUUID()))).status,503);assert.equal(rpcCalls,count);process.env.RADAS_GENERATION_ENABLED='true';
 outage=true;let response=await POST(generationRequest(randomUUID()));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'unavailable'});assert.equal(paidPosts,0);assert.equal(creditReads,0);outage=false;
 for(const data of [{allowed:true,retryAfter:1},{allowed:false,retryAfter:0},{allowed:false,retryAfter:61},{allowed:'true',retryAfter:0}]){badResponse=data;assert.equal((await POST(generationRequest(randomUUID()))).status,503);}badResponse=null;
 const {requireRequestLimit}=load('src/lib/protection/rate-limit.ts');process.env.NEXT_PUBLIC_SUPABASE_URL='https://wrong-project.example';count=rpcCalls;await assert.rejects(requireRequestLimit(uid,'generation'),/unavailable/);assert.equal(rpcCalls,count);
 assert.throws(()=>load('src/lib/generations/store.ts').createGenerationStore(),/unavailable/);assert.throws(()=>load('src/lib/storage/video.ts').createVideoStorage(),/unavailable/);await assert.rejects(load('src/lib/credits/service.ts').debitCredit(uid,randomUUID()),/credit_service_not_configured/);
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fyqvvkpzcwrmyozxlqkw.supabase.co';delete process.env.SUPABASE_SECRET_KEY;await assert.rejects(requireRequestLimit(uid,'generation'),/unavailable/);process.env.SUPABASE_SECRET_KEY='fixture-server-only-secret';
 console.log('PASS real routes deny unauthenticated/cross-origin/disabled requests before limit/provider access; rate outage/invalid response/config fails closed');
 // Fund only this isolated fixture through the real approved payment path.
 const funding=randomUUID();await payment(uid,'create',{id:funding,packageId:'try'});await payment(uid,'submit',{id:funding,reference:'FIXTURE-FUND'});await payment(admin,'approve',{id:funding,reference:'FIXTURE-FUND',amountSen:500});
 await db.exec('delete from radas_v4.request_limits;');
 const id=randomUUID();for(let i=0;i<20;i++){response=await POST(generationRequest(id));assert.equal(response.status,i<12?202:429);if(i>=12){assert.deepEqual(await response.json(),{error:'rate_limited'});assert.ok(Number(response.headers.get('retry-after'))>=1);assert.match(response.headers.get('cache-control'),/no-store/);}}
 assert.equal(paidPosts,1);assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[uid])).rows[0].balance,59);assert.equal((await db.query("select count(*)::int n from radas_v4.credit_transactions where type='debit' and user_id=$1",[uid])).rows[0].n,1);
 const rows=(await db.query("select user_id from radas_v4.request_limits where scope='generation'")).rows;assert.equal(rows.length,1);assert.equal(rows[0].user_id,uid);
 await db.query("update radas_v4.request_limits set window_start=clock_timestamp()-interval '1 minute' where user_id=$1 and scope='generation'",[uid]);assert.equal((await POST(generationRequest(id))).status,202);assert.equal(paidPosts,1);
 const order=randomUUID();for(let i=0;i<21;i++){response=await PAY(paymentRequest({action:'create',id:order,packageId:'try'}));assert.equal(response.status,i<20?200:429);}assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[uid])).rows[0].balance,59);
 console.log('PASS integrated SQL+routes: 20 generation replays yield one paid fixture POST/debit, later same-ID replay safe; payment cap grants no credit; spoofed headers ignored');
 const checks=await db.query(fs.readFileSync('supabase/verify-basic-protection.sql','utf8'));assert.equal(checks.rows.length,12);assert.ok(checks.rows.every(r=>r.passed),JSON.stringify(checks.rows));const before=(await db.query('select * from radas_v4.request_limits order by user_id,scope')).rows;
 await assert.rejects(db.exec(migration('_basic_protection.sql')),/basic_protection_already_installed/);await db.exec('rollback');assert.deepEqual((await db.query('select * from radas_v4.request_limits order by user_id,scope')).rows,before);
 function scan(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())scan(file);else if(file.endsWith('.js'))assert.doesNotMatch(fs.readFileSync(file,'utf8'),/SUPABASE_SECRET_KEY|NEXABOT_API_KEY|fixture-server-only-secret/);}}
 assert.ok(fs.existsSync('.next/static'),'Run npm run build before check:protection');scan('.next/static');
 console.log('PASS 12 SQL checks, rerun preservation and built browser JS secret-boundary scan; PROTECTION_LOCAL=PASS (PGlite queued connection; real multi-session verification separate)');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
