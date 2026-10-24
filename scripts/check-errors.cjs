// Real client functions, component event handlers and SSR fallbacks; no live services.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{randomUUID}=require('node:crypto');
let hooks=null;
function load(file,cache=new Map()) {
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const req=name=>{
  if(name.endsWith('.css'))return {};
  if(name==='react')return hooks||React;
  if(name==='next/image')return {default:'img'};
  if(name.startsWith('@/')||name.startsWith('.')){let target=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);if(!path.extname(target))target+=fs.existsSync(target+'.tsx')?'.tsx':'.ts';return load(target,cache);}
  return require(name);
 };
 new Function('require','module','exports',code)(req,mod,mod.exports);return mod.exports;
}
function harness(file,name,props){const slots=[];let index=0;hooks={...React,useState(initial){const n=index++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;return[slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},useRef(initial){const n=index++;return slots[n]||(slots[n]={current:initial});},useEffect(){index++;},useCallback(fn){index++;return fn;}};const component=load(file)[name];hooks=null;return()=>{index=0;return component(props);};}
function nodes(tree,out=[]){if(Array.isArray(tree)){for(const t of tree)nodes(t,out);}else if(tree&&typeof tree==='object'&&tree.props){out.push(tree);nodes(tree.props.children,out);}return out;}
function words(tree){if(Array.isArray(tree))return tree.map(words).join('');return tree&&typeof tree==='object'&&tree.props?words(tree.props.children):typeof tree==='string'||typeof tree==='number'?String(tree):'';}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{const original=global.fetch;global.window={location:{assign(){}}};try{
 const {requestJson,RequestError,generationIssue,paymentIssue}=load('src/lib/errors/client.ts');let calls=0;
 global.fetch=async(_url,init)=>{calls++;assert.equal(init.cache,'no-store');return Response.json({error:'database secret nxb_TEST',private:'fixture'},{status:503});};
 let failure;try{await requestJson('/fixture',{method:'POST'});}catch(e){failure=e;}assert.equal(calls,1);assert.equal(generationIssue(failure).retainRequest,true);assert.doesNotMatch(generationIssue(failure).message,/secret|nxb_TEST/);assert.doesNotMatch(paymentIssue(failure,true),/secret|nxb_TEST/);
 global.fetch=async()=>new Response('<html>private debug</html>',{status:502});await assert.rejects(requestJson('/fixture'),e=>e.code==='unavailable');
 for(const data of [null,[],42,'invalid']){global.fetch=async()=>Response.json(data);await assert.rejects(requestJson('/fixture'),e=>e.code==='unavailable');}
 global.fetch=async()=>new Response('not-json',{status:401});await assert.rejects(requestJson('/fixture'),e=>e.status===401);
 let aborts=0;global.fetch=(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>{aborts++;reject(Error('private transport'));},{once:true}));
 // Keep the process alive while native AbortSignal.timeout's unref timer fires.
 const keepAlive=setInterval(()=>{},50);try{await assert.rejects(requestJson('/fixture',{method:'POST'},15),e=>e.code==='unavailable');}finally{clearInterval(keepAlive);}assert.equal(aborts,1);
 for(const code of ['invalid_input','invalid_image','image_too_large','insufficient_credits','provider_unavailable','active_generation','generation_disabled','forbidden'])assert.equal(generationIssue(new RequestError(code,400)).retainRequest,false);
 assert.equal(generationIssue(new RequestError('rate_limited',429)).retainRequest,true);assert.match(paymentIssue(new RequestError('rate_limited',429),true),/60 saat/);
 for(const status of [403,409,500,503])assert.equal(generationIssue(new RequestError('unknown-proxy-error',status)).retainRequest,true);
 console.log('PASS timeout, malformed/HTML responses and auth handling; one request only; unknown outcomes retained and private text hidden');
 // Actual VideoStudio handlers: timeout, same-ID replay, wrong-ID response, then successful original ID.
 let bodies=[],reads=[],stage='lost',originalId;
 global.fetch=async(url,init)=>{
   if(init.method==='POST') {assert.equal(url,'/api/generations');bodies.push(init.body);originalId=init.body.get('requestId');throw Error('lost response');}
   reads.push(url);assert.equal(init.body,undefined);assert.equal(url,'/api/generations/'+originalId);
   const id=stage==='wrong'?randomUUID():originalId;
   return Response.json({id,status:'unknown',expiresAt:new Date(Date.now()+3600000).toISOString(),refunded:false,
     releasedAt:stage==='released'?new Date().toISOString():null,releaseAfter:stage==='released'?null:new Date(Date.now()+120000).toISOString()});
 };
 const studio=harness('src/components/video-studio.tsx','VideoStudio',{credits:{status:'ready',balance:60,transactions:[]},generationEnabled:true,onCreditsChanged:async()=>{}});
 nodes(studio()).find(n=>n.type==='textarea').props.onChange({target:{value:'A cat running in a field'}});
 async function generate(){nodes(studio()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();await settle();}
 await generate();assert.match(words(studio()),/Semak request semula/);const id=bodies[0].get('requestId');assert.match(words(studio()),new RegExp(id));
 stage='wrong';await generate();assert.equal(bodies.length,1);assert.match(words(studio()),/Semak request semula/);
 stage='released';await generate();assert.equal(bodies.length,1);assert.equal(reads.length,2);assert.doesNotMatch(words(studio()),/Respons belum dapat dipastikan/);
 assert.equal(nodes(studio()).find(n=>n.type==='button'&&words(n).includes('Generate Video')).props.disabled,false);
 assert.equal(nodes(studio()).find(n=>n.type==='fieldset'&&n.props.className==='generation-settings').props.disabled,false);
 // A new intentional generation receives a different ID after server-confirmed release.
 await generate();assert.equal(bodies.length,2);assert.notEqual(bodies[1].get('requestId'),id);
 console.log('PASS actual generator handlers: lost response -> GET-only same-ID recovery, wrong-ID remains pending, released unknown unlocks form, new generation gets new ID');
 let paymentBodies=[],payStage='lost';global.fetch=async(url,init)=>{if(!init.method)return Response.json({admin:false,payments:[]});paymentBodies.push(JSON.parse(init.body));if(payStage==='lost')throw Error('timeout');return Response.json({status:'fixture'});};
 const panel=harness('src/components/payment-panel.tsx','PaymentPanel',{});
 assert.doesNotMatch(words(panel()),/Tiada pesanan/);
 nodes(panel()).find(n=>n.type==='button'&&words(n).startsWith('Semak status')).props.onClick();await settle();await settle();
 const create=()=>nodes(panel()).find(n=>n.type==='button'&&words(n).includes('Try · RM5')).props.onClick();create();await settle();await settle();assert.match(words(panel()),/jangan bayar semula/);create();await settle();await settle();assert.equal(paymentBodies[0].id,paymentBodies[1].id);assert.equal(paymentBodies.length,2);

 const order={id:randomUUID(),user_id:randomUUID(),package_id:'try',amount_sen:500,credits:60,status:'pending',customer_reference:null,reason:null,created_at:new Date().toISOString()};let reloadFails=false;
 global.fetch=async(_url,init)=>{if(!init.method){if(reloadFails)throw Error('status outage');return Response.json({admin:false,payments:[order]});}reloadFails=true;return Response.json({payment:{...order,status:'submitted',customer_reference:'ORIGINAL-REF'}});};
 const submission=harness('src/components/payment-panel.tsx','PaymentPanel',{});
 nodes(submission()).find(n=>n.type==='button'&&words(n).startsWith('Semak status')).props.onClick();await settle();await settle();
 nodes(submission()).find(n=>n.type==='input').props.onChange({target:{value:'ORIGINAL-REF'}});
 nodes(submission()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();await settle();await settle();
 assert.equal(nodes(submission()).find(n=>n.type==='input').props.value,'ORIGINAL-REF');assert.match(words(submission()),/belum dapat dimuatkan/);
 console.log('PASS actual payment handlers distinguish unavailable list from empty list, show safe failure and preserve create ID without automatic write retry');
 // Real React static render of failure states and boundaries, without exposing raw error.
 const {GenerationResult}=load('src/components/generation-result.tsx');const base={id:randomUUID(),status:'failed',expiresAt:new Date(Date.now()+1000).toISOString(),refunded:true};
 for(const status of ['reserved','submitting','queued','processing','done','failed','rejected','unknown']) {
  const html=renderToStaticMarkup(React.createElement(GenerationResult,{generation:{...base,status},onAgain(){}}));
  const active=['reserved','submitting','queued','processing'].includes(status);
  assert.equal(html.includes('class="generation-working"'),active);assert.equal(html.includes('class="generation-working-track"'),active);
  assert.ok(html.includes(`aria-busy="${active}"`));assert.doesNotMatch(html,/aria-valuenow|[0-9]+%/);
 }
 const animationCSS=fs.readFileSync('src/components/generation-result.css','utf8');assert.match(animationCSS,/prefers-reduced-motion: reduce/);assert.match(animationCSS,/animation: none/);
 console.log('PASS preview working animation only for active states, busy accessibility, reduced motion and no fabricated progress');
 const refunded=renderToStaticMarkup(React.createElement(GenerationResult,{generation:base,onAgain(){}}));assert.match(refunded,/1 credit telah dipulangkan/);
 const held=renderToStaticMarkup(React.createElement(GenerationResult,{generation:{...base,refunded:false},onAgain(){}}));assert.doesNotMatch(held,/1 credit telah dipulangkan/);assert.match(held,/belum disahkan/);
 const unknown=renderToStaticMarkup(React.createElement(GenerationResult,{generation:{...base,status:'unknown',refunded:false},onAgain(){}}));assert.match(unknown,/membuka semula generation secara automatik/);assert.doesNotMatch(unknown,/Generate Again/);
 const released=renderToStaticMarkup(React.createElement(GenerationResult,{generation:{...base,status:'unknown',refunded:false,releasedAt:new Date().toISOString()},onAgain(){}}));
 assert.match(released,/Generate Again/);assert.match(released,/Setiap generation baharu menggunakan 1 credit/);assert.doesNotMatch(released,/1 credit telah dipulangkan/);
 for(const file of ['src/app/error.tsx','src/app/global-error.tsx']){const Component=load(file).default;const html=renderToStaticMarkup(React.createElement(Component,{error:Error('nxb_PRIVATE'),retry(){}}));assert.match(html,/Paparan belum tersedia/);assert.doesNotMatch(html,/nxb_PRIVATE/);}
 console.log('PASS React failure/refund/unknown states and Next boundaries; refund shown only when confirmed; ERRORS_LOCAL=PASS');
 }finally{global.fetch=original;delete global.window;}})().catch(e=>{console.error(e);process.exitCode=1;});
