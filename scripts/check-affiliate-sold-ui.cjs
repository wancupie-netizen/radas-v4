// Actual React handlers/state and rendering, with local fetch fixtures only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{randomUUID}=require('node:crypto');
let hooks=null;
function load(file,cache=new Map()){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m=new Module(file);cache.set(file,m);m.filename=file;const native=Module.createRequire(file);m.require=name=>{
  if(name==='react')return hooks??React;if(name.endsWith('.css'))return {};
  if(name.startsWith('@/')||name.startsWith('.')){let target=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);if(!path.extname(target))target+=fs.existsSync(target+'.tsx')?'.tsx':'.ts';return load(target,cache);}return native(name);
 };
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);return m.exports;
}
function nodes(tree,out=[]){if(Array.isArray(tree))tree.forEach(x=>nodes(x,out));else if(tree?.props){out.push(tree);nodes(tree.props.children,out);}return out;}
function words(tree){return Array.isArray(tree)?tree.map(words).join(''):tree?.props?words(tree.props.children):typeof tree==='string'||typeof tree==='number'?String(tree):'';}
function mount(file,name,props){const slots=[];let index=0,pending=[];
 hooks={...React,useState(initial){const n=index++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;return [slots[n],v=>slots[n]=typeof v==='function'?v(slots[n]):v];},useRef(initial){const n=index++;return slots[n]||(slots[n]={current:initial});},useEffect(fn,deps){const n=index++,old=slots[n];if(!old||deps.some((d,i)=>d!==old.deps[i])){slots[n]={deps,cleanup:old?.cleanup};pending.push(()=>{slots[n].cleanup?.();slots[n].cleanup=fn();});}}};
 const Component=load(file)[name];hooks=null;
 const render=()=>{index=0;return Component(props);};
 const cycle=()=>{for(let i=0;i<3;i++){render();const p=pending;pending=[];p.forEach(fn=>fn());}return render();};return {render,cycle,unmount(){slots.forEach(x=>x?.cleanup?.());}};
}
const settle=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const day=load('src/lib/affiliate/sold.ts').soldToday();
 const base={id:randomUUID(),name:'Fixture Product',imageUrl:'',category:'Home',priceSen:3300,commissionSen:330,url:'',reviewedOn:day,contentTypes:['UGC'],published:true,revision:1};
 const {ProductSold}=load('src/components/affiliate-sold-list.tsx');assert.equal(renderToStaticMarkup(ProductSold({product:base})), '');assert.equal(renderToStaticMarkup(ProductSold({product:{...base,soldText:'',soldCheckedOn:''}})), '');
 assert.match(renderToStaticMarkup(ProductSold({product:{...base,soldText:'0',soldCheckedOn:day}})),/0 sold/);assert.match(renderToStaticMarkup(ProductSold({product:{...base,soldText:'10K+',soldCheckedOn:day}})),/10K\+ sold/);
 let edits=[],saved=[],confirmed=false;
 const props={products:[base],busy:false,onEditingChange:v=>edits.push(v),onSave:async v=>{saved.push({...v});return confirmed;}};
 const list=mount('src/components/affiliate-sold-list.tsx','AffiliateSoldList',props);
 nodes(list.render()).find(x=>x.type==='button'&&words(x)==='Update sold').props.onClick();assert.equal(edits.at(-1),true);
 let tree=list.render();let input=nodes(tree).find(x=>x.type==='input'&&x.props.type==='text');assert.equal(input.props.value,'');assert.equal(input.props.maxLength,20);assert.equal(nodes(tree).find(x=>x.type==='input'&&x.props.type==='date').props.value,day);
 input.props.onChange({target:{value:'1.2K+'}});tree=list.render();assert.equal(nodes(tree).find(x=>x.type==='button'&&words(x)==='Save sold').props.disabled,false);
 nodes(tree).find(x=>x.type==='button'&&words(x)==='Save sold').props.onClick();await settle();assert.equal(saved.length,1);assert.equal(saved[0].soldText,'1.2K+');assert.equal(nodes(list.render()).find(x=>x.type==='input'&&x.props.type==='text').props.value,'1.2K+','Lost response must preserve input');
 confirmed=true;nodes(list.render()).find(x=>x.type==='button'&&words(x)==='Save sold').props.onClick();await settle();assert.deepEqual(saved[1],saved[0]);assert.equal(edits.at(-1),false);assert.equal(nodes(list.render()).filter(x=>x.type==='input').length,0);
 props.products=[{...base,soldText:'10K+',soldCheckedOn:day}];nodes(list.render()).find(x=>x.type==='button'&&words(x)==='Update sold').props.onClick();nodes(list.render()).find(x=>x.type==='button'&&words(x)==='Clear sold').props.onClick();tree=list.render();assert.ok(nodes(tree).filter(x=>x.type==='input').every(x=>x.props.value===''));
 props.busy=true;tree=list.render();assert.ok(nodes(tree).filter(x=>x.type==='input'||x.type==='button').every(x=>x.props.disabled));props.busy=false;
 nodes(list.render()).find(x=>x.type==='button'&&words(x)==='Cancel').props.onClick();assert.equal(nodes(list.render()).filter(x=>x.type==='input').length,0);
 console.log('PASS sold badge missing-versus-zero, K+ preservation, date input, lost-response retry, clear/cancel and busy controls');
 let href='http://localhost/admin/products',posts=[],fail=false;const listeners=new Map();
 const originalFetch=global.fetch,originalWindow=global.window,originalDocument=global.document;
 const products=Array.from({length:12},(_,i)=>({...base,id:randomUUID(),name:'Product '+i}));
 global.window={location:{get href(){return href;},get pathname(){return new URL(href).pathname;},get search(){return new URL(href).search;},get hash(){return new URL(href).hash;},assign(){}},history:{state:{},replaceState(_s,_t,value){href=new URL(value,href).href;}},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){}};
 global.document={visibilityState:'visible',addEventListener(){},removeEventListener(){},getElementById(){return {focus(){}};}};
 global.fetch=async(_url,init={})=>{if(init.method==='POST'){const body=JSON.parse(init.body);posts.push(body);if(fail)throw Error('fixture lost response');const p=products.find(p=>p.id===body.product.id);Object.assign(p,{soldText:body.product.soldText,soldCheckedOn:body.product.soldCheckedOn,revision:p.revision+1});}return Response.json({admin:true,access:'allowed',products});};
 try{
  const panel=mount('src/components/affiliate-panel.tsx','AffiliatePanel',{admin:true});panel.cycle();await settle();panel.cycle();
  nodes(panel.cycle()).find(x=>x.type==='button'&&words(x)==='Update Sold').props.onClick();tree=panel.cycle();assert.match(href,/af_view=sold/);assert.ok(nodes(tree).find(x=>x.type?.name==='AffiliateSoldList'));assert.equal(nodes(tree).filter(x=>x.type==='article').length,0);
  let child=nodes(tree).find(x=>x.type?.name==='AffiliateSoldList');child.props.onEditingChange(true);tree=panel.cycle();assert.ok(nodes(tree).find(x=>x.type==='input'&&x.props.type==='search').props.disabled);assert.ok(nodes(tree).find(x=>x.type==='button'&&words(x)==='Refresh').props.disabled);assert.ok(nodes(tree).find(x=>x.type==='button'&&x.props['aria-label']==='Page 2').props.disabled);
  const prior=href;href='http://localhost/admin/products?af_page=2';listeners.get('popstate')();assert.equal(href,prior);assert.ok(nodes(panel.cycle()).find(x=>x.type?.name==='AffiliateSoldList'));
  const update={id:products[0].id,revision:1,soldText:'10K+',soldCheckedOn:day};fail=true;assert.equal(await child.props.onSave(update),false);assert.match(words(panel.cycle()),/retained/);fail=false;assert.equal(await child.props.onSave(update),true);assert.deepEqual(posts[0],posts[1]);assert.deepEqual(Object.keys(posts[0].product).sort(),['id','revision','soldCheckedOn','soldText']);
  child=nodes(panel.cycle()).find(x=>x.type?.name==='AffiliateSoldList');child.props.onEditingChange(false);tree=panel.cycle();nodes(tree).find(x=>x.type==='button'&&words(x)==='Products').props.onClick();assert.equal(new URL(href).searchParams.has('af_view'),false);assert.equal(nodes(panel.cycle()).filter(x=>x.type==='article').length,9);
  const reader=mount('src/components/affiliate-panel.tsx','AffiliatePanel',{admin:false});reader.cycle();await settle();tree=reader.cycle();assert.ok(!nodes(tree).some(x=>x.type==='button'&&words(x)==='Update Sold'));reader.unmount();panel.unmount();
 }finally{global.fetch=originalFetch;global.window=originalWindow;global.document=originalDocument;}
 console.log('PASS admin-only sold view, URL restoration, 9-row paging, edit navigation locks and minimal save payload/retry; SOLD_UI_LOCAL=PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
