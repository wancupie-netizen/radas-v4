// Real client functions, component event handlers and SSR fallbacks; no live services.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{randomUUID}=require('node:crypto');
let hooks=null;
function load(file,cache=new Map()) {
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const req=name=>{
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
(async()=>{const original=global.fetch;global.window={location:{assign(){}},confirm:()=>true};try{
 const p={id:randomUUID(),name:'Fixture Blender',imageUrl:'https://example.com/image.jpg',category:'Dapur',priceSen:9900,commissionSen:2000,url:'https://example.com/product',reviewedOn:new Date().toISOString().slice(0,10),contentTypes:['POV','UGC'],published:true,revision:1};
 let access='locked',topups=0,posts=[];
 global.fetch=async(_url,init)=>{if(init.method){posts.push(JSON.parse(init.body));throw Error('lost response');}return Response.json({admin:false,access,products:access==='allowed'?[p]:[]});};
 const props={balance:60,onTopUp:()=>topups++},panel=harness('src/components/affiliate-panel.tsx','AffiliatePanel',props);
 const refresh=async render=>{nodes(render()).find(n=>n.type==='button'&&words(n)==='Semak semula').props.onClick();await settle();await settle();};
 assert.match(words(panel()),/Menyemak akses/);assert.doesNotMatch(words(panel()),/Belum ada produk/);await refresh(panel);assert.match(words(panel()),/dikunci/);assert.equal(nodes(panel()).filter(n=>n.type==='img').length,0);nodes(panel()).find(n=>n.type==='button'&&words(n)==='Top Up RM5').props.onClick();assert.equal(topups,1);
 access='allowed';await refresh(panel);assert.equal(nodes(panel()).filter(n=>n.type==='img').length,1);assert.equal(nodes(panel()).find(n=>n.type==='a').props.rel,'noopener noreferrer sponsored');
 nodes(panel()).find(n=>n.type==='input'&&n.props.type==='search').props.onChange({target:{value:'not found'}});assert.match(words(panel()),/Tiada produk sepadan/);nodes(panel()).find(n=>n.type==='input'&&n.props.type==='search').props.onChange({target:{value:''}});
 props.balance=0;assert.equal(nodes(panel()).filter(n=>n.type==='img').length,0);assert.match(words(panel()),/dikunci/);
 props.balance=-1;assert.equal(nodes(panel()).filter(n=>n.type==='img').length,0);
 props.balance=60;access='locked';await refresh(panel);assert.equal(nodes(panel()).filter(n=>n.type==='img').length,0);
 global.fetch=async(_url,init)=>{if(init.method){posts.push(JSON.parse(init.body));throw Error('lost response');}return Response.json({admin:true,access:'allowed',products:[p]});};
 const admin=harness('src/components/affiliate-panel.tsx','AffiliatePanel',{admin:true});await refresh(admin);nodes(admin()).find(n=>n.type==='button'&&words(n)==='Edit').props.onClick();
 const save=async()=>{nodes(admin()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();await settle();};await save();assert.match(words(admin()),/draf dan ID asal dikekalkan/);assert.equal(posts.length,1);await save();assert.deepEqual(posts[0],posts[1]);
 assert.doesNotMatch(words(admin()),/Prompt video/);console.log('PASS actual client handlers: locked/no stale cards, zero/unavailable credit, top-up CTA, filters, safe links, lost-save draft and same ID; no automatic write retry');
}finally{global.fetch=original;delete global.window;}})().catch(e=>{console.error(e);process.exitCode=1;});
