const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{renderToStaticMarkup}=require('react-dom/server');
let states=[],cursor=0;
function load(file){file=path.resolve(file);const m=new Module(file);m.filename=file;const native=Module.createRequire(file);m.require=name=>{
 if(name==='react')return {...native(name),useEffect:()=>{},useState:initial=>[states[cursor++]??initial,()=>{}]};
 if(name.endsWith('.css'))return {};
 if(name==='./generation-timer')return {GenerationTimer:()=>null};
 if(name==='./generation-wait')return {GenerationWait:()=>null};
 if(name==='@/lib/generations/types')return load('src/lib/generations/types.ts');
 return native(name);
};m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);return m.exports;}
const {GenerationResult}=load('src/components/generation-result.tsx');
const generation={id:'11111111-1111-4111-8111-111111111111',status:'done',expiresAt:new Date(Date.now()+3600000).toISOString(),refunded:false};
function html(g,values=[]){states=values;cursor=0;return renderToStaticMarkup(GenerationResult({generation:g,onAgain:()=>{}}));}
for(const g of [generation,{...generation,videoState:'finalizing'},{...generation,videoState:'ready'}]){const s=html(g);assert.match(s,/Finalizing video/);assert.doesNotMatch(s,/>Video ready</);}
assert.doesNotMatch(html({...generation,videoState:'ready'},['blob:fixture',false]),/>Video ready</);
assert.match(html({...generation,videoState:'ready'},['blob:fixture',true]),/>Video ready</);
assert.match(html({...generation,videoState:'needs_review'}),/Video needs support/);
assert.match(html({...generation,videoState:'expired'}),/Video expired/);
const expired={...generation,status:'queued',slotReleasedAt:new Date().toISOString()};assert.match(html(expired),/Request expired/);assert.match(html(expired),/Generate Again/);
console.log('PASS UI: provider done and stored Blob alone never show Video ready; media loaded event gates readiness; review/expiry/slot-release states render explicitly');
