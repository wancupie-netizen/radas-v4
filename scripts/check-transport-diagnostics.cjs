const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod=new Module(file);cache.set(file,mod);const native=Module.createRequire(file);mod.require=name=>{if(name==='server-only')return{};const resolved=name.startsWith('@/')?path.resolve('src',name.slice(2)+'.ts'):name.startsWith('.')?path.resolve(path.dirname(file),name+'.ts'):null;return resolved?load(resolved):native(name);};mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return mod.exports;}
const {createNexabotClient,NexabotError}=load('src/lib/nexabot/client.ts'),{GenerationError}=load('src/lib/generations/input.ts'),{generationLog,observeGeneration}=load('src/lib/generations/log.ts'),{createGenerationFlow}=load('src/lib/generations/flow.ts');
const records=[],original=console.info,id='8d171846-acea-472e-aef8-1fdff34a2224';
const secret='PRIVATE-PROMPT-EMAIL-KEY';
const accepted={ok:true,job_id:'job_transport',status:'queued',credit_cost:0.15,credit_balance:1,est_seconds:150};
const img='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
(async()=>{console.info=line=>records.push(JSON.parse(line));try{
 for(const [mode,count]of[['text',0],['image',1],['ingredients',3]]){
  let posted,metadata,calls=0;const client=createNexabotClient({apiKey:'nxb_SECRET',fetcher:async(_url,init)=>{calls++;posted=init.body;return Response.json(accepted,{status:202});}});
  const input={mode,prompt:secret,orientation:'portrait',resolution:'720',...(count?{imageDataUris:Array(count).fill(img)}:{})};
  assert.equal((await client.submitVideo(input,t=>metadata=t)).jobId,'job_transport');assert.equal(calls,1);assert.equal(metadata.payloadBytes,Buffer.byteLength(posted));assert.equal(metadata.imageCount,count);assert.deepEqual(metadata.imageBytes,Array(count).fill(8));assert.equal(metadata.phase,'complete');assert.equal(metadata.httpStatus,202);assert.ok(metadata.headerMs>=0);
  generationLog('provider_transport',{requestId:id,transport:metadata});
 }
 for(const phase of ['before_headers','response_body']){
  let metadata,calls=0;const client=createNexabotClient({apiKey:'nxb_SECRET',timeoutMs:5,fetcher:async(_url,init)=>{calls++;if(phase==='before_headers')return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error(secret)),{once:true}));return new Response(new ReadableStream({start(controller){init.signal.addEventListener('abort',()=>controller.error(new Error(secret)),{once:true});}}),{status:202});}});
  await assert.rejects(client.submitVideo({mode:'text',prompt:secret,orientation:'portrait',resolution:'720'},t=>metadata=t),e=>{assert.equal(e.diagnostic.transport.phase,phase);generationLog('provider_submit',{requestId:id,error:e});return e.code==='TIMEOUT'&&e.outcome==='unknown';});assert.equal(calls,1);assert.equal(metadata.phase,phase);assert.equal(metadata.httpStatus,phase==='response_body'?202:undefined);
 }
 const client=createNexabotClient({apiKey:'nxb_SECRET',fetcher:async()=>Response.json(accepted,{status:202})});assert.equal((await client.submitVideo({mode:'text',prompt:secret,orientation:'portrait',resolution:'720'},()=>{throw new Error('observer fails');})).jobId,'job_transport');
 assert.ok(!JSON.stringify(records).includes(secret));assert.ok(!JSON.stringify(records).includes(img));assert.ok(!JSON.stringify(records).includes('nxb_SECRET'));assert.ok(records.some(r=>r.phase==='before_headers'&&!('httpStatus'in r)));assert.ok(records.some(r=>r.phase==='response_body'&&r.httpStatus===202));
 console.log('PASS transport diagnostics: exact UTF-8 payload/decoded img sizes; mode/count; success headers; timeout before headers vs response body; one POST; no sensitive data; observer failure harmless');
}finally{console.info=original;}})().catch(e=>{console.info=original;console.error(e);process.exitCode=1;});
