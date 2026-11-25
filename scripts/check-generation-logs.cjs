const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod=new Module(file);cache.set(file,mod);const native=Module.createRequire(file);mod.require=name=>{if(name==='server-only')return{};const resolved=name.startsWith('@/')?path.resolve('src',name.slice(2)+'.ts'):name.startsWith('.')?path.resolve(path.dirname(file),name+'.ts'):null;return resolved?load(resolved):native(name);};mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return mod.exports;}
const {createNexabotClient,NexabotError}=load('src/lib/nexabot/client.ts'),{GenerationError}=load('src/lib/generations/input.ts'),{generationLog,observeGeneration}=load('src/lib/generations/log.ts'),{createGenerationFlow}=load('src/lib/generations/flow.ts');
const id='71b6d07f-1d26-44d2-83b7-718aa34f0d35',records=[],original=console.info;
const secret='PRIVATE-SENTINEL-prompt-api-key-email-image';
(async()=>{console.info=line=>records.push(JSON.parse(line));try{
 for(const [kind,fetcher,status] of [
  ['network',async()=>{throw new Error(secret);}],
  ['invalid_response',async()=>new Response(secret,{status:202}),202],
  ['http',async()=>new Response(secret,{status:502}),502],
  ['timeout',async(_url,init)=>new Promise((_r,reject)=>init.signal.addEventListener('abort',()=>reject(new Error(secret)),{once:true}))]
 ]){const client=createNexabotClient({apiKey:'nxb_PRIVATE',fetcher,timeoutMs:5});await assert.rejects(observeGeneration('provider_submit',id,()=>client.submitVideo({mode:'text',prompt:secret,orientation:'portrait',resolution:'720'})),e=>e instanceof NexabotError&&e.outcome==='unknown');const log=records.at(-1);assert.equal(log.kind,kind);assert.equal(log.requestId,id);assert.equal(log.httpStatus,status);assert.ok(log.durationMs>=0);}
 const unknownError=new NexabotError('TIMEOUT','unknown',{kind:'timeout'});let posts=0,transitions=0;
 const generation={id,status:'reserved',expiresAt:new Date(Date.now()+10000).toISOString(),refunded:false,providerJobId:null,pollAllowed:false,created:true,claimAllowed:false};
 const store={operation:async(action,_user,_id,data)=>{if(action==='read')throw new GenerationError('not_found',404);if(action==='reserve')return generation;if(action==='claim')return{...generation,status:'submitting',claimAllowed:true};if(action==='transition'){transitions++;return{...generation,status:data.status,providerJobId:data.providerJobId??null};}throw new Error('unexpected');}};
 const provider={getCredit:async()=>({creditCost:0.15,credit:10}),submitVideo:async()=>{posts++;throw unknownError;},getJob:async()=>{throw new Error(secret);}};
 const input={mode:'text',prompt:secret,orientation:'portrait',resolution:'720'};
 const result=await createGenerationFlow(store,provider).submit('private-user',id,input,'private-hash');assert.equal(result.status,'unknown');assert.equal(posts,1);assert.equal(transitions,1);assert.ok(records.some(r=>r.stage==='generation_outcome'&&r.status==='unknown'));
 provider.submitVideo=async()=>{posts++;return{jobId:'accepted_job_123'};};store.operation=async(action,...args)=>{if(action==='transition'){transitions++;throw new GenerationError('unavailable');}if(action==='read')throw new GenerationError('not_found',404);if(action==='reserve')return generation;if(action==='claim')return{...generation,status:'submitting',claimAllowed:true};};
 await assert.rejects(createGenerationFlow(store,provider).submit('private-user',id,input,'private-hash'));assert.equal(posts,2);assert.equal(transitions,3);assert.ok(records.some(r=>r.stage==='provider_submit'&&r.providerJobId==='accepted_job_123'&&r.result==='ok'));
 const err=new GenerationError('active_generation',409,'11111111-1111-4111-8111-111111111111');generationLog('database_reserve',{requestId:id,error:err});assert.equal(records.at(-1).activeGenerationId,err.activeId);
 generationLog('database_transition',{requestId:id,error:new Error(secret),sqlState:'42501'});assert.equal(records.at(-1).sqlState,'42501');
 generationLog('request_input',{requestId:secret,error:new Error(secret),providerJobId:secret+'@',status:secret});assert.equal(records.at(-1).requestId,undefined);
 generationLog('video_provider_body',{requestId:id,error:new TypeError(secret,{cause:{code:'UND_ERR_SOCKET',url:secret}})});
 assert.equal(records.at(-1).stage,'video_provider_body');assert.equal(records.at(-1).transportCode,'UND_ERR_SOCKET');
 generationLog('video_storage_upload',{requestId:id,error:new Error(secret),httpStatus:403,storageCode:'AccessDenied'});
 assert.equal(records.at(-1).httpStatus,403);assert.equal(records.at(-1).storageCode,'AccessDenied');
 generationLog('video_metadata_mark',{requestId:id,error:new Error(secret),sqlState:'42501',storageCode:secret});
 assert.equal(records.at(-1).sqlState,'42501');assert.equal(records.at(-1).storageCode,undefined);
 generationLog('playback_request',{requestId:id,httpStatus:200});
 assert.equal(records.at(-1).result,'ok');assert.equal(records.at(-1).httpStatus,200);
 const blocked='abcdefghijklmnopqrst.supabase.co';
 const redirected=createNexabotClient({apiKey:'nxb_PRIVATE',fetcher:async()=>new Response(null,{status:307,headers:{location:'https://'+blocked+'/private-path?token='+secret}})});
 await assert.rejects(observeGeneration('video_provider_download',id,()=>redirected.downloadVideo('fixture')),e=>e.code==='UNSAFE_DOWNLOAD_REDIRECT');
 assert.equal(records.at(-1).redirectHost,blocked);assert.equal(records.at(-1).redirectFromHost,'nexabot.id');assert.equal(records.at(-1).redirectReason,'unapproved_origin');assert.equal(records.at(-1).redirectHop,1);
 const malformed=new NexabotError('UNSAFE_DOWNLOAD_REDIRECT','read',{kind:'invalid_response',redirect:{reason:'unapproved_origin',fromHost:'nexabot.id/'+secret,toHost:'https://'+blocked+'/?token='+secret,hop:9,url:secret}});
 generationLog('video_finalize',{requestId:id,error:malformed});assert.equal(records.at(-1).redirectHost,undefined);assert.equal(records.at(-1).redirectFromHost,undefined);assert.equal(records.at(-1).redirectHop,undefined);
 for(const toHost of ['nexabot.id\n','nexabot.id:443','nexabot.id?token='+secret,'nexabot.id/'+secret]){generationLog('video_finalize',{error:new NexabotError('UNSAFE_DOWNLOAD_REDIRECT','read',{kind:'invalid_response',redirect:{reason:'unapproved_origin',toHost}})});assert.equal(records.at(-1).redirectHost,undefined);}
 for(const reason of ['invalid_download_policy','provider_path','storage_origin_changed','invalid_storage_path','unsafe_address']){generationLog('video_finalize',{error:new NexabotError('UNSAFE_DOWNLOAD_REDIRECT','read',{kind:'invalid_response',redirect:{reason,fromHost:'nexabot.id',toHost:blocked,hop:1}})});assert.equal(records.at(-1).redirectReason,reason);assert.equal(records.at(-1).redirectHost,blocked);}
 const badReason=new NexabotError('UNSAFE_DOWNLOAD_REDIRECT','read',{kind:'invalid_response',redirect:{reason:secret,fromHost:'nexabot.id',toHost:blocked,hop:1}});
 generationLog('video_finalize',{requestId:id,error:badReason});assert.equal(records.at(-1).redirectReason,undefined);assert.equal(records.at(-1).redirectHost,undefined);
 process.env.NEXABOT_DOWNLOAD_ORIGINS=secret;
 try{createNexabotClient({apiKey:'nxb_PRIVATE'});}catch(e){generationLog('video_finalize',{error:e});}finally{delete process.env.NEXABOT_DOWNLOAD_ORIGINS;}
 assert.equal(records.at(-1).redirectReason,'invalid_origin_config');assert.equal(records.at(-1).redirectHost,undefined);
 assert.ok(!JSON.stringify(records).includes(secret));assert.ok(!JSON.stringify(records).includes('private-user'));assert.ok(!JSON.stringify(records).includes('nxb_PRIVATE'));
 console.info=()=>{throw new Error('log sink unavailable');};assert.equal(await observeGeneration('provider_credit',id,async()=>42,true),42);await assert.rejects(observeGeneration('provider_submit',id,async()=>{throw unknownError;}),e=>e===unknownError);
}finally{console.info=original;}console.log('PASS generation logs: provider errors, request correlation, no POST retry, redacted redirect hosts/reasons/hops, invalid diagnostic rejection and failing log sink preserves outcome');})().catch(e=>{console.info=original;console.error(e);process.exitCode=1;});
