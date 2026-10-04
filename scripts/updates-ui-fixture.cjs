// Actual component handlers with isolated fetch fixtures; no live network.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react');
module.exports=async()=>{
let hooks=null;
function load(file,cache=new Map()){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',out)(name=>{if(name==='react')return hooks||React;if(name.endsWith('.module.css'))return{default:new Proxy({},{get:(_,k)=>String(k)})};if(name.startsWith('@/')||name.startsWith('.')){let p=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);if(!path.extname(p))p+=fs.existsSync(p+'.tsx')?'.tsx':'.ts';return load(p,cache);}return require(name);},m,m.exports);return m.exports;}
function harness(){const slots=[];let i=0;hooks={...React,useState(initial){const n=i++;if(!(n in slots))slots[n]=initial;return[slots[n],v=>slots[n]=typeof v==='function'?v(slots[n]):v];},useRef(initial){const n=i++;return slots[n]||(slots[n]={current:initial});},useEffect(){i++;}};const C=load('src/components/updates-panel.tsx').UpdatesPanel;hooks=null;return()=>{i=0;return C({admin:true});};}
function nodes(t,o=[]){if(Array.isArray(t))t.forEach(x=>nodes(x,o));else if(t&&t.props){o.push(t);nodes(t.props.children,o);}return o;}
function words(t){if(Array.isArray(t))return t.map(words).join('');return t&&t.props?words(t.props.children):typeof t==='string'||typeof t==='number'?String(t):'';}
const settle=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
const original=global.fetch,oldWindow=global.window;global.window={location:{assign:()=>{}},confirm:()=>true};
try{
let calls=[];global.fetch=async(url,init)=>{calls.push({url,init});return Response.json({admin:true,updates:[]});};
const panel=harness(),button=text=>nodes(panel()).find(x=>x.type==='button'&&words(x).includes(text));
await nodes(panel()).find(x=>x.type==='button').props.onClick();await settle();button('Tambah update').props.onClick();
const change=(id,value)=>nodes(panel()).find(x=>x.props.id===id).props.onChange({target:{value}});change('update-title','Fixture title');change('update-body','Fixture body');
global.fetch=async(url,init)=>{calls.push({url,init});throw Error('PRIVATE_PROVIDER_TEXT');};
const form=()=>nodes(panel()).find(x=>x.type==='form');form().props.onSubmit({preventDefault(){}});await settle();assert.match(words(panel()),/rujukan asal dikekalkan/);assert.doesNotMatch(words(panel()),/PRIVATE_PROVIDER_TEXT/);assert.equal(calls.filter(x=>x.init.method==='POST').length,1);
const command=JSON.parse(calls.at(-1).init.body);const entry={...command.update,revision:1,publishedAt:null,updatedAt:new Date().toISOString()};
global.fetch=async(url,init)=>{calls.push({url,init});assert.deepEqual(JSON.parse(init.body),command);return Response.json({admin:true,updates:[entry]});};
await button('Ulang request yang sama').props.onClick();await settle();assert.match(words(panel()),/Update disimpan/);assert.match(words(panel()),/Fixture title/);assert.equal(calls.filter(x=>x.init.method==='POST').length,2);
// Old refresh must not overwrite a newer successful read.
let resolveOld;global.fetch=()=>new Promise(r=>resolveOld=r);nodes(panel()).find(x=>x.type==='button').props.onClick();global.fetch=async()=>Response.json({admin:true,updates:[]});nodes(panel()).find(x=>x.type==='button').props.onClick();await settle();resolveOld(Response.json({admin:true,updates:[entry]}));await settle();assert.doesNotMatch(words(panel()),/Fixture title/);
console.log('PASS actual admin handlers preserve UUID/body on lost response, explicit exact retry, no automatic write retry, sanitized failure and stale read protection');
}finally{global.fetch=original;global.window=oldWindow;}
};
