// Isolated PostgreSQL + real route/flow/adapter code. No live Supabase/NexaBot or paid requests.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module');
const ts = require('typescript'); const { PGlite } = require('@electric-sql/pglite'); const { randomUUID } = require('node:crypto');
const uid = '11111111-1111-4111-8111-111111111111'; const other = '22222222-2222-4222-8222-222222222222';
const migration = fs.readdirSync('supabase/migrations').find(name => name.endsWith('_generation_flow.sql'));
const {installStorage,mockStorage,mp4}=require('./storage-fixture.cjs');const storage=mockStorage();
const cache = new Map(); let db; let authUser = uid; let rpcFailures = 0; let submitKind = 'ok'; let providerStatus = 'processing';
let loseResponse = '';
let credit = 3; let posts = 0; let providerReads = 0; let jobCounter = 0; const jobs = new Map(); const providerBodies=[];
async function operation(action, user, id, data = {}) {
  return (await db.query('select public.radas_v4_generation_operation($1,$2,$3,$4) as result', [action,user,id,JSON.stringify(data)])).rows[0].result;
}
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file).exports;
  const module = new Module(file); cache.set(file,module); module.filename=file;
  const native=Module.createRequire(file);
  module.require=name=> {
    if(name==='server-only') return {};
    if(name==='@supabase/supabase-js') return {createClient:()=>({storage,rpc:async(name,args)=>{
      try {
        if(name==='radas_v4_request_limit')return {data:{allowed:true,retryAfter:0},error:null}; // Rate limiting tested separately.
        if(name==='radas_v4_video_object_operation')return {data:(await db.query('select public.radas_v4_video_object_operation($1,$2,$3,$4) as result',[args.p_action,args.p_user_id,args.p_id,args.p_size])).rows[0].result,error:null};
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
  const ingredientsMigration=fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_ingredients_mode.sql'));
  await db.exec(fs.readFileSync('supabase/migrations/'+ingredientsMigration,'utf8'));
  const expiredUnknownMigration=fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_release_expired_unknown.sql'));
  await db.exec(fs.readFileSync('supabase/migrations/'+expiredUnknownMigration,'utf8'));
  await db.exec(fs.readFileSync('supabase/auto-release-install.sql','utf8'));
  await installStorage(db);
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
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fyqvvkpzcwrmyozxlqkw.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-secret';
  process.env.NEXABOT_API_KEY='nxb_FIXTURE';process.env.APP_URL='http://localhost:3000';process.env.RADAS_GENERATION_ENABLED='true';
  const originalFetch=global.fetch;
  global.fetch=async(url,init)=>{
    assert.equal(new URL(url).origin,'https://nexabot.id');assert.equal(init.headers['x-api-key'],'nxb_FIXTURE');
    const p=new URL(url).pathname;
    const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
    if(p==='/api/v1/api/credit'){providerReads++;return reply({ok:true,registered:true,credit,credit_cost:.15});}
    if(p==='/api/v1/api'){
      posts++;const body=JSON.parse(init.body);providerBodies.push(body);assert.equal(typeof body.ratio,'number');assert.equal(typeof body.resolution,'number');assert.equal('duration' in body,false);
      if(submitKind==='unknown')throw new Error('upstream key secret');
      if(submitKind==='reject')return reply({secret:'upstream'},402);
      const job='fixture-'+(++jobCounter);jobs.set(job,body.mode);
      return reply({ok:true,job_id:job,status:'queued',credit_cost:.15,credit_balance:2,est_seconds:60},202);
    }
    const match=/^\/api\/v1\/jobs\/(fixture-\d+)(\/download)?$/.exec(p);assert.ok(match);assert.ok(jobs.has(match[1]));
    if(match[2])return new Response(mp4,{headers:{'content-type':'video/mp4'}});
    return reply({ok:true,job:{id:match[1],mode:jobs.get(match[1]),status:providerStatus,progress:'private@email',error:'private'}});
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
  assert.equal(parsed.input.mode,'image');assert.match(parsed.input.imageDataUris[0],/^data:image\/png;base64,/);
  const parser=load('src/lib/generations/input.ts').readGenerationInput;
  const blue=await require('sharp')({create:{width:3,height:2,channels:3,background:'blue'}}).png().toBuffer();
  function ingredients(id,buffers){const f=form(id,{mode:'ingredients'});for(const bytes of buffers)f.append('image',new File([bytes],'ingredient.png',{type:'image/png'}));return f;}
  const {createHash}=require('node:crypto');
  assert.equal(parsed.hash,createHash('sha256').update(JSON.stringify({mode:'image',prompt:'Test scene',orientation:'portrait',resolution:'720',imageHash:createHash('sha256').update(png).digest('hex')})).digest('hex'));
  const pair=await parser(request(ingredients(id,[png,blue])));
  assert.equal(pair.input.imageDataUris.length,2);
  assert.notEqual(pair.hash,(await parser(request(ingredients(id,[blue,png])))).hash);
  assert.notEqual(pair.hash,(await parser(request(ingredients(id,[png,png])))).hash);
  const tooManyForSingle=ingredients(randomUUID(),[png,blue]);tooManyForSingle.set('mode','image');assert.equal((await POST(request(tooManyForSingle))).status,400);
  for(const buffers of [[],[png,png,png,png],[png,Buffer.from('broken')]]) {const before=posts;assert.equal((await POST(request(ingredients(randomUUID(),buffers)))).status,400);assert.equal(posts,before);}
  const duplicate=form(randomUUID());duplicate.append('prompt','spoof');assert.equal((await POST(request(duplicate))).status,400);
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
  response=await video(id);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),mp4);
  const cancelled = new AbortController(); cancelled.abort();
  response = await VIDEO(new Request('http://localhost:3000/api/generations/'+id+'/video',{signal:cancelled.signal}),{params:Promise.resolve({id})});
  assert.equal(response.status,503);
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
  submitKind='ok';providerStatus='done';
  const matrixStartPosts=posts;let matrixCases=0;
  for(const selection of [{mode:'text',count:0},{mode:'image',count:1},{mode:'ingredients',count:1},{mode:'ingredients',count:2},{mode:'ingredients',count:3}])for(const orientation of ['portrait','landscape'])for(const resolution of ['720','1080']) {
    const {mode,count}=selection;
    const matrixId=randomUUID();await db.exec('reset role');const beforeBalance=(await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[uid])).rows[0].balance;await actor('service_role');
    const extras={mode,orientation,resolution};if(mode!=='text')extras.image=new File([png],'matrix.png',{type:'image/png'});
    const matrixForm=form(matrixId,extras);if(mode!=='text')for(let index=1;index<count;index++)matrixForm.append('image',new File([blue],'extra.png',{type:'image/png'}));
    const submitted=await POST(request(matrixForm));assert.equal(submitted.status,202);assert.equal((await submitted.json()).status,'queued');
    const body=providerBodies.at(-1);assert.equal(body.mode,mode==='text'?'t2v':mode==='image'?'sfv':'i2v');assert.equal(body.ratio,orientation==='portrait'?2:1);assert.equal(body.resolution,Number(resolution));
    if(mode!=='text'){assert.match(body.media[0],/^data:image\/png;base64,/);assert.equal(body.media.length,count); const previousPosts=posts;assert.equal((await POST(request(matrixForm))).status,202);assert.equal(posts,previousPosts);if(count>1){const changed=form(matrixId,extras);changed.append('image',new File([png],'changed.png',{type:'image/png'}));assert.equal((await POST(request(changed))).status,409);assert.equal(posts,previousPosts);}}else assert.equal(body.media,undefined);
    const finished=await get(matrixId);assert.equal(finished.status,200);assert.equal((await finished.json()).status,'done');
    const output=await video(matrixId);assert.equal(output.status,200);assert.equal(output.headers.get('content-type'),'video/mp4');assert.match(output.headers.get('content-disposition'),new RegExp(matrixId));assert.deepEqual(Buffer.from(await output.arrayBuffer()),mp4);
    await db.exec('reset role');assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[uid])).rows[0].balance,beforeBalance-1);
    const settings=(await db.query('select mode,orientation,resolution from radas_v4.generations where id=$1',[matrixId])).rows[0];assert.deepEqual(settings,{mode,orientation,resolution:Number(resolution)});await actor('service_role');matrixCases++;
  }
  assert.equal(matrixCases,20);assert.equal(posts,matrixStartPosts+20);
  console.log('PASS all 20 text / image 1 img / ingredients 1–3 img × portrait/landscape × 720/1080 combinations: ordered hashes, legacy hash compatibility, invalid media, idempotent retries, real input decode, adapter payload, SQL settings, one debit, done status and private MP4 route (provider/Storage fixtures)');
  submitKind='unknown';id=randomUUID();g=await (await POST(request(form(id)))).json();assert.equal(g.status,'unknown');assert.equal(g.refunded,false);
  const unknownPosts=posts;await POST(request(form(id)));assert.equal(posts,unknownPosts);assert.equal((await POST(request(form(randomUUID())))).status,409);
  await assert.rejects(operation('transition',uid,id,{status:'rejected'}),/unknown_cannot_be_refunded|claim_owner_required/);
  // The real account blocker: an old unknown with no provider job. Release without deletion/refund.
  await db.exec('reset role');await db.query("update radas_v4.generations set created_at=clock_timestamp()-interval '5 days',expires_at=clock_timestamp()-interval '4 days' where id=$1",[id]);
  const oldUnknown=id;const oldLedger=(await db.query('select * from radas_v4.credit_transactions where reference=$1',[oldUnknown])).rows;
  await db.exec(fs.readFileSync('supabase/migrations/'+expiredUnknownMigration,'utf8'));
  await db.exec(fs.readFileSync('supabase/auto-release-install.sql','utf8'));await actor('service_role');
  assert.equal((await POST(request(form(oldUnknown)))).status,202);assert.equal(posts,unknownPosts);
  submitKind='ok';providerStatus='done';const afterUnknown=randomUUID();response=await POST(request(form(afterUnknown)));assert.equal(response.status,202);assert.equal(posts,unknownPosts+1);await get(afterUnknown);
  await db.exec('reset role');const archived=(await db.query('select status,refunded,provider_job_id,unknown_released_at from radas_v4.generations where id=$1',[oldUnknown])).rows[0];
  assert.equal(archived.status,'unknown');assert.equal(archived.refunded,false);assert.equal(archived.provider_job_id,null);assert.ok(archived.unknown_released_at);
  assert.deepEqual((await db.query('select * from radas_v4.credit_transactions where reference=$1',[oldUnknown])).rows,oldLedger);await actor('service_role');
  console.log('PASS actual expired-unknown blocker: migration releases slot, old ID returns 410 without paid POST, fresh ID generates once, old record/ledger retained');
  submitKind='ok';rpcFailures=2;id=randomUUID();response=await POST(request(form(id)));assert.equal(response.status,503);
  const savedPosts=posts;g=await (await POST(request(form(id)))).json();assert.equal(g.status,'submitting');assert.equal(posts,savedPosts);
  await db.exec('reset role');await db.query("update radas_v4.generations set created_at=clock_timestamp()-interval '3 minutes',updated_at=clock_timestamp()-interval '3 minutes' where id=$1",[id]);await actor('service_role');
  g=await (await get(id)).json();assert.equal(g.status,'unknown');assert.equal(g.refunded,false);
  await db.exec('reset role');const rowsBefore=await db.query('select id,mode,request_hash,status from radas_v4.generations order by id');
  await db.exec(fs.readFileSync('supabase/migrations/'+ingredientsMigration,'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/'+expiredUnknownMigration,'utf8'));
  await db.exec(fs.readFileSync('supabase/auto-release-install.sql','utf8'));
  assert.deepEqual((await db.query('select id,mode,request_hash,status from radas_v4.generations order by id')).rows,rowsBefore.rows);
  // Unresolved submit releases automatically after two minutes, without changing its ledger.
  await db.exec('reset role');
  await db.query("update radas_v4.generations set updated_at=clock_timestamp()-interval '121 seconds' where id=$1",[id]);
  const unresolved=id;
  const ledgerBefore=(await db.query('select * from radas_v4.credit_transactions where reference=$1',[id])).rows;
  await actor('service_role');
  g=await (await get(id)).json();assert.equal(g.status,'unknown');assert.ok(g.releasedAt);assert.equal(g.releaseAfter,null);assert.equal(g.refunded,false);
  const postsBeforeRelease=posts;
  const oldReplay=await POST(request(form(id)));assert.equal(oldReplay.status,202);assert.ok((await oldReplay.json()).releasedAt);assert.equal(posts,postsBeforeRelease);
  await assert.rejects(operation('claim',uid,id,{claimToken:randomUUID()}),/expired_unknown_read_only/);
  await assert.rejects(operation('transition',uid,id,{status:'queued',providerJobId:'late-response'}),/expired_unknown_read_only/);
  await db.exec('reset role');assert.deepEqual((await db.query('select * from radas_v4.credit_transactions where reference=$1',[id])).rows,ledgerBefore);await actor('service_role');
  // Burst of new IDs still gets just one reservation/debit after release.
  const burstAfterRelease=await Promise.all(Array.from({length:20},()=>operation('reserve',uid,randomUUID(),spec)));
  assert.equal(burstAfterRelease.filter(x=>x.created).length,1);
  assert.equal(burstAfterRelease.filter(x=>x.error==='active_generation').length,19);
  await operation('cancel',uid,burstAfterRelease.find(x=>x.created).id);
  // GET-before-retry: existing jobs never POST; missing/late reservations reuse the exact ID.
  const {recoverGeneration}=load('src/lib/generations/recovery.ts');
  const RequestError=load('src/lib/errors/client.ts').RequestError;
  let checks=[];const retainedForm=form(unresolved);
  const recovered=await recoverGeneration(unresolved,retainedForm,async(url,init)=>{checks.push({url,init});return (await get(unresolved)).json();});
  assert.ok(recovered.releasedAt);assert.equal(checks.length,1);assert.equal(checks[0].init,undefined);assert.equal(posts,postsBeforeRelease);
  const absent=randomUUID();const absentForm=form(absent);checks=[];
  await recoverGeneration(absent,absentForm,async(url,init)=>{
    checks.push({url,init});
    if(!init){ // Original request reserves AFTER the missing status response.
      await operation('reserve',uid,absent,{...spec,hash:(await parser(request(absentForm))).hash});
      throw new RequestError('not_found',404);
    }
    assert.equal(init.body,absentForm);return (await POST(request(init.body))).json();
  });
  assert.equal(checks.length,2);assert.equal(posts,postsBeforeRelease+1);providerStatus='done';await get(absent);
  for(const error of [new RequestError('unavailable',503),new RequestError('unavailable',0),new RequestError('unauthorized',401)]){
    let calls=0;await assert.rejects(recoverGeneration(absent,absentForm,async()=>{calls++;throw error;}));assert.equal(calls,1);
  }
  // Unreleased unknown is locked, then GET unlocks it; server time, never browser time.
  submitKind='unknown';id=randomUUID();g=await (await POST(request(form(id)))).json();assert.equal(g.status,'unknown');assert.equal(g.releasedAt,null);assert.ok(g.releaseAfter);
  assert.equal(load('src/lib/generations/types.ts').canGenerateAgain(g),false);
  assert.equal((await POST(request(form(randomUUID())))).status,409);
  await db.exec('reset role');await db.query("update radas_v4.generations set updated_at=clock_timestamp()-interval '121 seconds' where id=$1",[id]);await actor('service_role');
  g=await (await get(id)).json();assert.ok(g.releasedAt);assert.equal(load('src/lib/generations/types.ts').canGenerateAgain(g),true);
  authUser=other;assert.equal((await get(id)).status,404);authUser=uid;
  // Accepted queued/processing requests stay locked regardless of age.
  submitKind='ok';id=randomUUID();await POST(request(form(id)));
  await db.exec('reset role');await db.query("update radas_v4.generations set updated_at=clock_timestamp()-interval '1 hour' where id=$1",[id]);await actor('service_role');
  for(const state of ['queued','processing']) {
    providerStatus=state;const current=await operation('read',uid,id);assert.equal(current.releasedAt,null);
    assert.equal((await POST(request(form(randomUUID())))).status,409);
    await db.exec('reset role');await db.query("update radas_v4.generations set last_polled_at=null where id=$1",[id]);await actor('service_role');
  }
  providerStatus='done';await get(id);
  // Existing admin release extension must survive installation/rerun.
  await db.exec('reset role');await db.exec('alter table radas_v4.generations add column admin_released_at timestamptz');
  await db.exec(fs.readFileSync('supabase/auto-release-install.sql','utf8'));await actor('service_role');
  submitKind='unknown';id=randomUUID();await POST(request(form(id)));
  await db.exec('reset role');await db.query('update radas_v4.generations set admin_released_at=clock_timestamp() where id=$1',[id]);await actor('service_role');
  g=await (await get(id)).json();assert.ok(g.releasedAt);assert.equal(g.releaseAfter,null);
  const adminReplayPosts=posts;await POST(request(form(id)));assert.equal(posts,adminReplayPosts);
  submitKind='ok';id=randomUUID();assert.equal((await POST(request(form(id)))).status,202);providerStatus='done';await get(id);
  // A crashed submitting process waits two leases, rather than unlocking a live POST.
  const crashed=randomUUID();await operation('reserve',uid,crashed,spec);await operation('claim',uid,crashed,{claimToken:randomUUID()});
  await db.exec('reset role');await db.query("update radas_v4.generations set updated_at=clock_timestamp()-interval '121 seconds' where id=$1",[crashed]);await actor('service_role');
  let crashedState=await operation('read',uid,crashed);assert.equal(crashedState.status,'unknown');assert.equal(crashedState.releasedAt,null);assert.ok(crashedState.releaseAfter);
  assert.equal((await operation('reserve',uid,randomUUID(),spec)).error,'active_generation');
  await db.exec('reset role');await db.query("update radas_v4.generations set updated_at=clock_timestamp()-interval '121 seconds' where id=$1",[crashed]);await actor('service_role');
  crashedState=await operation('read',uid,crashed);assert.ok(crashedState.releasedAt);
  const {parseGeneration}=load('src/lib/generations/types.ts');
  assert.throws(()=>parseGeneration({...crashedState,status:'queued'}),/invalid_generation_release/);
  assert.throws(()=>parseGeneration({...crashedState,releaseAfter:new Date().toISOString()}),/invalid_generation_release/);
  await db.exec('reset role');
  const autoChecks=(await db.query(fs.readFileSync('supabase/verify-auto-release.sql','utf8'))).rows;
  assert.ok(autoChecks.every(row=>row.passed),JSON.stringify(autoChecks));await actor('service_role');
  console.log('PASS automatic 2-minute unknown release, browser recovery GET-first, missing-record race, same-ID no-repost, one debit, concurrent new IDs, ownership, known-job locks, manual/admin releases and rerunnable installer');
  global.fetch=originalFetch;
  console.log('PASS definitive rejection/failure refund once; ambiguous submit and accepted-but-unsaved job never repost or refund');
  await db.exec('reset role');
  const rows=(await db.query(fs.readFileSync('supabase/verify-generation-flow.sql','utf8'))).rows;assert.ok(rows.every(x=>x.passed),JSON.stringify(rows));
  await assert.rejects(db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8')),/generation_rpc_name_conflict/);await db.exec('rollback');
  console.log('PASS verification SQL and migration rerun preserve existing data; PGlite burst uses one queued connection');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(db)await db.close();});
