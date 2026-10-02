// Isolated PostgreSQL + real route/flow/adapter code. No live Supabase/NexaBot or paid requests.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module');
const ts = require('typescript'); const { PGlite } = require('@electric-sql/pglite'); const { randomUUID } = require('node:crypto');
const uid = '11111111-1111-4111-8111-111111111111'; const other = '22222222-2222-4222-8222-222222222222';
const migration = fs.readdirSync('supabase/migrations').find(name => name.endsWith('_generation_flow.sql'));
const cache = new Map(); let db; let authUser = uid; let rpcFailures = 0; let submitKind = 'ok'; let providerStatus = 'processing';
let loseResponse = '';
let credit = 3; let posts = 0; let providerReads = 0; let jobCounter = 0; const jobs = new Set();
async function operation(action, user, id, data = {}) {
  return (await db.query('select public.radas_v4_generation_operation($1,$2,$3,$4) as result', [action,user,id,JSON.stringify(data)])).rows[0].result;
}
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file).exports;
  const module = new Module(file); cache.set(file,module); module.filename=file;
  const native=Module.createRequire(file);
  module.require=name=> {
    if(name==='server-only') return {};
    if(name==='@supabase/supabase-js') return {createClient:()=>({rpc:async(name,args)=>{
      try {
        assert.equal(name,'radas_v4_generation_operation');
        if(args.p_action==='transition' && rpcFailures>0){rpcFailures--;throw new Error('transport');}
        const data=await operation(args.p_action,args.p_user_id,args.p_id,args.p_data);
        if(args.p_action===loseResponse){loseResponse='';throw new Error('lost committed response');}
        return {data,error:null};
      } catch(error){return {data:null,error};}
    }})};
    const resolved=name.startsWith('@/') ? path.resolve('src',name.slice(2)+'.ts') : name.startsWith('.') ? path.resolve(path.dirname(file),name+'.ts') : null;
    if(resolved?.split(path.sep).join('/').endsWith('/supabase/server.ts')) return {createClient:async()=>({auth:{getUser:async()=>({data:{user:authUser?{id:authUser}:null},error:null})}})};
    return resolved?load(resolved):native(name);
  };
  module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
  return module.exports;
}
async function actor(role, sub) {
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,...(sub?{sub}:{})})]);await db.exec(`set role ${role}`);
}
const spec={hash:'a'.repeat(64),mode:'text',prompt:'Test scene',orientation:'portrait',resolution:720};
function form(id, extras={}) {const f=new FormData();for(const [k,v] of Object.entries({requestId:id,mode:'text',prompt:'Test scene',orientation:'portrait',resolution:'720',...extras}))f.set(k,v);return f;}
function request(f,origin='http://localhost:3000') {return new Request('http://localhost:3000/api/generations',{method:'POST',headers:{Origin:origin},body:f});}
(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
    insert into auth.users values ('${uid}'),('${other}');`);
  await db.exec(fs.readFileSync('supabase/migrations/202610020001_credit_engine.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  const safetyMigration=fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_credit_safety.sql'));
  await db.exec(fs.readFileSync('supabase/migrations/'+safetyMigration,'utf8'));
  for(const role of ['anon','authenticated']) {
    await actor(role,uid);await assert.rejects(operation('reserve',uid,randomUUID(),spec),/permission denied/);
    await assert.rejects(db.exec('select * from radas_v4.generations'),/permission denied/);
  }
  await actor('service_role');await assert.rejects(db.exec('update radas_v4.generations set prompt=\'bypass\''),/permission denied/);
  let id=randomUUID();assert.equal((await operation('reserve',uid,id,spec)).error,'insufficient_credits');
  await db.query('select public.radas_v4_credit_apply($1,$2,$3)',[uid,'topup','fixture-paid-1']);
  await db.query('select public.radas_v4_credit_apply($1,$2,$3)',[other,'topup','fixture-paid-2']);
  let g=await operation('reserve',uid,id,spec);assert.equal(g.created,true);assert.equal(g.status,'reserved');
  assert.equal((await operation('reserve',uid,id,spec)).created,false);
  assert.equal((await operation('reserve',uid,id,{...spec,hash:'b'.repeat(64)})).error,'request_conflict');
  assert.equal((await operation('reserve',uid,randomUUID(),spec)).error,'active_generation');
  assert.equal((await operation('read',other,id)).error,'not_found');
  const initialToken=randomUUID();await operation('claim',uid,id,{claimToken:initialToken});
  assert.equal((await operation('transition',uid,id,{status:'rejected',claimToken:initialToken})).refunded,true);
  assert.equal((await operation('transition',uid,id,{status:'rejected'})).refunded,true);
  console.log('PASS SQL permissions, ownership, zero balance, atomic reservation, matching retry and fixed refund');
  await db.exec('reset role');
  await db.exec(`create function radas_v4.fail_generation_insert() returns trigger language plpgsql as $$ begin raise exception 'fixture_insert_failure';end $$;
    create trigger fixture_failure before insert on radas_v4.generations for each row execute function radas_v4.fail_generation_insert();`);
  await actor('service_role');const rollback=randomUUID();await assert.rejects(operation('reserve',uid,rollback,spec),/fixture_insert_failure/);
  await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from radas_v4.credit_transactions where reference=$1',[rollback])).rows[0].n,0);
  await db.exec('drop trigger fixture_failure on radas_v4.generations;drop function radas_v4.fail_generation_insert();');
  await actor('service_role');const burst=await Promise.all(Array.from({length:20},()=>operation('reserve',uid,randomUUID(),spec)));
  assert.equal(burst.filter(x=>x.created).length,1);assert.equal(burst.filter(x=>x.error==='active_generation').length,19);
  const active=burst.find(x=>x.created);const activeToken=randomUUID();await operation('claim',uid,active.id,{claimToken:activeToken});await operation('transition',uid,active.id,{status:'queued',providerJobId:'sql-job',claimToken:activeToken});
  assert.equal((await operation('poll',uid,active.id)).pollAllowed,true);assert.equal((await operation('poll',uid,active.id)).pollAllowed,false);
  await operation('transition',uid,active.id,{status:'processing',providerJobId:'sql-job'});
  assert.equal((await operation('transition',uid,active.id,{status:'queued',providerJobId:'sql-job'})).status,'processing');
  assert.equal((await operation('transition',uid,active.id,{status:'done',providerJobId:'sql-job'})).status,'done');
  assert.equal((await operation('transition',uid,active.id,{status:'failed',providerJobId:'sql-job'})).status,'done');
  console.log('PASS insert failure rolls back debit; burst permits one active job; polling throttled; states never regress');
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-secret';
  process.env.NEXABOT_API_KEY='nxb_FIXTURE';process.env.APP_URL='http://localhost:3000';process.env.RADAS_GENERATION_ENABLED='true';
  const originalFetch=global.fetch;
  global.fetch=async(url,init)=>{
    assert.equal(new URL(url).origin,'https://nexabot.id');assert.equal(init.headers['x-api-key'],'nxb_FIXTURE');
    const p=new URL(url).pathname;
    const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
    if(p==='/api/v1/api/credit'){providerReads++;return reply({ok:true,registered:true,credit,credit_cost:.15});}
    if(p==='/api/v1/api'){
      posts++;const body=JSON.parse(init.body);assert.equal(typeof body.ratio,'number');assert.equal(typeof body.resolution,'number');assert.equal('duration' in body,false);
      if(submitKind==='unknown')throw new Error('upstream key secret');
      if(submitKind==='reject')return reply({secret:'upstream'},402);
      const job='fixture-'+(++jobCounter);jobs.add(job);
      return reply({ok:true,job_id:job,status:'queued',credit_cost:.15,credit_balance:2,est_seconds:60},202);
    }
    const match=/^\/api\/v1\/jobs\/(fixture-\d+)(\/download)?$/.exec(p);assert.ok(match);assert.ok(jobs.has(match[1]));
    if(match[2])return new Response(Buffer.from('fixture-mp4'),{headers:{'content-type':'video/mp4'}});
    return reply({ok:true,job:{id:match[1],mode:'t2v',status:providerStatus,progress:'private@email',error:'private'}});
  };
  const POST=load('src/app/api/generations/route.ts').POST;
  const GET=load('src/app/api/generations/[id]/route.ts').GET;
  const VIDEO=load('src/app/api/generations/[id]/video/route.ts').GET;
  const get=id=>GET(new Request('http://localhost:3000/api/generations/'+id),{params:Promise.resolve({id})});
  const video=id=>VIDEO(new Request('http://localhost:3000/api/generations/'+id+'/video'),{params:Promise.resolve({id})});
  let response; id=randomUUID();authUser=null;response=await POST(request(form(id)));assert.equal(response.status,401);authUser=uid;
  response=await POST(request(form(id),'https://evil.example'));assert.equal(response.status,403);
  process.env.RADAS_GENERATION_ENABLED='false';response=await POST(request(form(id)));assert.equal(response.status,503);process.env.RADAS_GENERATION_ENABLED='true';
  response=await POST(request(form(id,{userId:other})));assert.equal(response.status,400);
  response=await POST(request(form(id,{prompt:' '})));assert.equal(response.status,400);
  response=await POST(request(form(id,{mode:'image',image:new File([Buffer.from([137,80,78,71,13,10,26,10])],'broken.png',{type:'image/png'})})));assert.equal(response.status,400);
  const png=await require('sharp')({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer();
  const parsed=await load('src/lib/generations/input.ts').readGenerationInput(request(form(id,{mode:'image',image:new File([png],'valid.png',{type:'image/png'})})));
  assert.equal(parsed.input.mode,'image');assert.match(parsed.input.imageDataUri,/^data:image\/png;base64,/);
  credit=0;response=await POST(request(form(id)));assert.equal(response.status,503);assert.equal(posts,0);credit=3;
  response=await POST(request(form(id)));assert.equal(response.status,202);g=await response.json();assert.equal(g.status,'queued');assert.equal(posts,1);
  assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal('providerJobId' in g,false);
  response=await POST(request(form(id)));assert.equal(response.status,202);assert.equal(posts,1);
  response=await POST(request(form(id,{prompt:'different'})));assert.equal(response.status,409);assert.equal(posts,1);
  authUser=other;assert.equal((await get(id)).status,404);assert.equal((await video(id)).status,404);authUser=uid;
  assert.equal((await video(id)).status,409);
  g=await (await get(id)).json();assert.equal(g.status,'processing');
  await db.exec('reset role');await db.query("update radas_v4.generations set last_polled_at=clock_timestamp()-interval '5 seconds' where id=$1",[id]);await actor('service_role');
  providerStatus='done';g=await (await get(id)).json();assert.equal(g.status,'done');assert.equal(g.refunded,false);
  response=await video(id);assert.equal(response.status,200);assert.equal(await response.text(),'fixture-mp4');
  const cancelled = new AbortController(); cancelled.abort();
  response = await VIDEO(new Request('http://localhost:3000/api/generations/'+id+'/video',{signal:cancelled.signal}),{params:Promise.resolve({id})});
  await assert.rejects(response.text(),/video_unavailable/);
  await db.exec('reset role');await db.query("update radas_v4.generations set expires_at=created_at+interval '1 second',created_at=clock_timestamp()-interval '13 hours' where id=$1",[id]);
  // Set expiry explicitly, retaining a valid created/expiry interval.
  await db.query("update radas_v4.generations set expires_at=created_at+interval '12 hours' where id=$1",[id]);await actor('service_role');assert.equal((await video(id)).status,410);
  console.log('PASS real routes: verified auth, CSRF, feature gate, strict body, full image decode, provider-zero denial, replay, ownership, poll, MP4 and expiry');
  providerStatus='done';
  for(const lostAction of ['reserve','claim']) {
    loseResponse=lostAction;id=randomUUID();const beforePosts=posts;
    response=await POST(request(form(id)));assert.equal(response.status,202);assert.equal(posts,beforePosts+1);
    await POST(request(form(id)));assert.equal(posts,beforePosts+1);
    assert.equal((await (await get(id)).json()).status,'done');
  }
  const duplicateId=randomUUID();const beforeBurstPosts=posts;
  const duplicates=await Promise.all(Array.from({length:20},()=>POST(request(form(duplicateId)))));
  assert.ok(duplicates.every(r=>r.status===202));assert.equal(posts,beforeBurstPosts+1);
  assert.equal((await (await get(duplicateId)).json()).status,'done');
  for(const terminal of ['done','failed']) {
    const oldId=randomUUID();await POST(request(form(oldId)));
    await db.exec('reset role');await db.query("update radas_v4.generations set created_at=clock_timestamp()-interval '13 hours',expires_at=clock_timestamp()-interval '1 hour' where id=$1",[oldId]);await actor('service_role');
    providerStatus=terminal;const beforePosts=posts;const newId=randomUUID();
    response=await POST(request(form(newId)));assert.equal(response.status,202);assert.equal(posts,beforePosts+1);
    assert.equal((await video(oldId)).status,410);
    await db.exec('reset role');const oldJob=(await db.query('select status,refunded from radas_v4.generations where id=$1',[oldId])).rows[0];assert.equal(oldJob.status,terminal);assert.equal(oldJob.refunded,terminal==='failed');await actor('service_role');
    providerStatus='done';await get(newId);
  }
  console.log('PASS new request reconciles owned known jobs after refresh/expiry; old output stays inaccessible; failed old job refunded');
  // An existing unclaimed reservation can be refunded safely when provider credit disappears.
  id=randomUUID();await operation('reserve',uid,id,{...spec,hash:(await load('src/lib/generations/input.ts').readGenerationInput(request(form(id)))).hash});
  credit=0;g=await (await POST(request(form(id)))).json();assert.equal(g.status,'rejected');assert.equal(g.refunded,true);credit=3;
  console.log('PASS lost committed reserve/claim responses recover safely; twenty HTTP retries send one paid POST; unclaimed provider outage refund');
  submitKind='reject';id=randomUUID();g=await (await POST(request(form(id)))).json();assert.equal(g.status,'rejected');assert.equal(g.refunded,true);
  const rejectedPosts=posts;await POST(request(form(id)));assert.equal(posts,rejectedPosts);
  submitKind='ok';providerStatus='failed';id=randomUUID();await POST(request(form(id)));g=await (await get(id)).json();assert.equal(g.status,'failed');assert.equal(g.refunded,true);
  submitKind='unknown';id=randomUUID();g=await (await POST(request(form(id)))).json();assert.equal(g.status,'unknown');assert.equal(g.refunded,false);
  const unknownPosts=posts;await POST(request(form(id)));assert.equal(posts,unknownPosts);assert.equal((await POST(request(form(randomUUID())))).status,409);
  await assert.rejects(operation('transition',uid,id,{status:'rejected'}),/unknown_cannot_be_refunded|claim_owner_required/);
  // Free only this isolated fixture account for crash-persistence testing, never live data.
  await db.exec('reset role');await db.query('delete from radas_v4.generations where id=$1',[id]);await actor('service_role');
  submitKind='ok';rpcFailures=2;id=randomUUID();response=await POST(request(form(id)));assert.equal(response.status,503);
  const savedPosts=posts;g=await (await POST(request(form(id)))).json();assert.equal(g.status,'submitting');assert.equal(posts,savedPosts);
  await db.exec('reset role');await db.query("update radas_v4.generations set created_at=clock_timestamp()-interval '3 minutes',updated_at=clock_timestamp()-interval '3 minutes' where id=$1",[id]);await actor('service_role');
  g=await (await get(id)).json();assert.equal(g.status,'unknown');assert.equal(g.refunded,false);
  global.fetch=originalFetch;
  console.log('PASS definitive rejection/failure refund once; ambiguous submit and accepted-but-unsaved job never repost or refund');
  await db.exec('reset role');
  const rows=(await db.query(fs.readFileSync('supabase/verify-generation-flow.sql','utf8'))).rows;assert.ok(rows.every(x=>x.passed),JSON.stringify(rows));
  await assert.rejects(db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8')),/generation_rpc_name_conflict/);await db.exec('rollback');
  console.log('PASS verification SQL and migration rerun preserve existing data; PGlite burst uses one queued connection');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(db)await db.close();});
