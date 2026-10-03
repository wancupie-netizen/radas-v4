const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react');
module.exports=async()=>{
let hooks=null;
function load(file,cache=new Map()){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',code)(name=>{if(name==='react')return hooks||React;if(name.endsWith('.module.css'))return{default:new Proxy({}, {get:(_target,key)=>String(key)})};if(name.startsWith('@/')||name.startsWith('.')){let p=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);if(!path.extname(p))p+=fs.existsSync(p+'.tsx')?'.tsx':'.ts';return load(p,cache);}return require(name);},m,m.exports);return m.exports;}
function harness(){const slots=[];let index=0;hooks={...React,useState(initial){const n=index++;if(!(n in slots))slots[n]=initial;return[slots[n],v=>slots[n]=typeof v==='function'?v(slots[n]):v];},useRef(initial){const n=index++;return slots[n]||(slots[n]={current:initial});},useEffect(){index++;},useCallback(fn){index++;return fn;}};const component=load('src/components/api-stock-panel.tsx').ApiStockPanel;hooks=null;return()=>{index=0;return component({revision:0});};}
function nodes(tree,out=[]){if(Array.isArray(tree))tree.forEach(x=>nodes(x,out));else if(tree&&tree.props){out.push(tree);nodes(tree.props.children,out);}return out;}
function words(tree){if(Array.isArray(tree))return tree.map(words).join('');return tree&&tree.props?words(tree.props.children):typeof tree==='string'||typeof tree==='number'?String(tree):'';}
const settle=()=>new Promise(r=>setImmediate(r)),original=global.fetch;let redirects=0;
global.window={location:{assign:()=>redirects++}};
try{
const {calculateStock}=load('src/lib/api-stock/summary.ts'),valid=calculateStock({outstandingCredits:169,fundedAccounts:3,walletCheckedAt:new Date().toISOString(),customerCredits:60,customerAccounts:1,internalCredits:109,internalAccounts:2,otherCredits:0,otherAccounts:0},{credit:15,creditCost:.15});let calls=0;
global.fetch=async(url,init)=>{calls++;assert.equal(url,'/api/admin/api-stock');assert.ok(!init.method||init.method==='GET');return Response.json(valid);};
const panel=harness(),click=()=>nodes(panel()).find(x=>x.type==='button').props.onClick();
click();await settle();await settle();assert.match(words(panel()),/Cukup/);assert.match(words(panel()),/100 video/);assert.match(words(panel()),/1 pelanggan/);assert.match(words(panel()),/2 akaun/);assert.match(words(panel()),/109 kredit RADAS/);assert.match(words(panel()),/Keperluan semua akaun/);
global.fetch=async()=>{calls++;throw Error('PRIVATE_TEXT');};click();assert.doesNotMatch(words(panel()),/Cukup/);await settle();await settle();assert.match(words(panel()),/Tidak dapat disemak/);assert.doesNotMatch(words(panel()),/PRIVATE_TEXT|100 video/);assert.equal(calls,2);
let resolveOld;global.fetch=()=>new Promise(r=>resolveOld=r);click();global.fetch=async()=>Response.json({...valid,internalCredits:0});click();await settle();await settle();assert.match(words(panel()),/Tidak dapat disemak/);resolveOld(Response.json(valid));await settle();await settle();assert.doesNotMatch(words(panel()),/Cukup/);
global.fetch=async()=>Response.json({error:'unauthorized'},{status:401});click();await settle();await settle();assert.equal(redirects,1);
console.log('PASS actual stock client handlers: failed refresh removes old sufficient status, invalid snapshots rejected, stale responses ignored, login recovery, reads only');
}finally{global.fetch=original;delete global.window;}
};
