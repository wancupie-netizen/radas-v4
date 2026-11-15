// Actual component effects, handlers and URL state; requests stay in the fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{randomUUID}=require('node:crypto');
let hooks=null,componentMocks=null;
function load(file,cache=new Map()) {
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(componentMocks?.[name])return componentMocks[name];
  if(name.endsWith('.css'))return {};if(name==='react')return hooks||React;
  if(name.startsWith('@/')||name.startsWith('.')){let target=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);if(!path.extname(target))target+=fs.existsSync(target+'.tsx')?'.tsx':'.ts';return load(target,cache);}return require(name);
 },mod,mod.exports);return mod.exports;
}
function nodes(tree,out=[]){if(Array.isArray(tree))tree.forEach(x=>nodes(x,out));else if(tree?.props){out.push(tree);nodes(tree.props.children,out);}return out;}
function words(tree){return Array.isArray(tree)?tree.map(words).join(''):tree?.props?words(tree.props.children):typeof tree==='string'||typeof tree==='number'?String(tree):'';}
function mount(admin=true,workspace=false) {
 const slots=[];let index=0,pending=[];
 hooks={...React,useActionState:(_action,initial)=>[initial,()=>{},false],useState(initial){const n=index++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;return [slots[n],v=>slots[n]=typeof v==='function'?v(slots[n]):v];},useRef(initial){const n=index++;return slots[n]||(slots[n]={current:initial});},useEffect(fn,deps){const n=index++,old=slots[n];if(!old||deps.some((d,i)=>d!==old.deps[i])){slots[n]={deps,cleanup:old?.cleanup};pending.push(()=>{slots[n].cleanup?.();slots[n].cleanup=fn();});}}};
 if(workspace)componentMocks={
  '@/app/auth/actions':{logout:()=>{}},
  '@/components/brand':{Brand:function Brand(){}},
  '@/components/video-studio':{VideoStudio:function VideoStudio(){}},
  '@/components/payment-panel':{PaymentPanel:function PaymentPanel(){}},
  '@/components/affiliate-panel':{AffiliatePanel:function AffiliatePanel(){}},
 };
 const Component=workspace?load('src/components/video-workspace.tsx').VideoWorkspace:load('src/components/affiliate-panel.tsx').AffiliatePanel;hooks=null;componentMocks=null;
 const render=()=>{index=0;return Component(workspace?{accountEmail:'fixture@example.com',accountName:'Fixture',initialCredits:{status:'ready',balance:8,transactions:[]},generationEnabled:true}:{admin});};
 const flush=()=>{const work=pending;pending=[];work.forEach(fn=>fn());};
 return {render,cycle(){for(let i=0;i<3;i++){render();flush();}return render();},unmount(){slots.forEach(x=>x?.cleanup?.());}};
}
const settle=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const {readCatalogLocation,writeCatalogLocation}=load('src/lib/affiliate/location.ts');
 const base=new URL('https://video.radas.my/admin/products?other=keep#catalog');
 const state={page:5,query:'jam & dapur',category:'Rumah',onlyDrafts:true};
 const location=writeCatalogLocation(base,state);assert.deepEqual(readCatalogLocation(new URL(location,base)),state);assert.ok(location.includes('other=keep'));assert.ok(location.endsWith('#catalog'));
 for(const invalid of ['0','-1','x','Infinity','1.5','10000'])assert.equal(readCatalogLocation(new URL('https://example.com/?af_page='+invalid)).page,1);
 assert.equal(readCatalogLocation(new URL('https://example.com/?af_page=999')).page,56);
 assert.equal(readCatalogLocation(new URL('https://example.com/?af_q='+'x'.repeat(999))).query.length,254);
 assert.equal(readCatalogLocation(new URL('https://example.com/?af_category='+'x'.repeat(999))).category.length,60);
 const originalFetch=global.fetch,originalWindow=global.window,originalDocument=global.document;
 let pushes=0;
 let href='https://video.radas.my/admin/products?other=keep&af_page=3&af_q=Produk&af_category=Rumah&af_drafts=1',writes=0,posts=[],focused='',timerId=0;
 let historyEntries=[href],historyIndex=0;
 const listeners=new Map(),timers=new Map();let failures=false;
 const locationObject={get href(){return href;},get pathname(){return new URL(href).pathname;},get search(){return new URL(href).search;},get hash(){return new URL(href).hash;},assign(){throw Error('unexpected login redirect');}};
 global.window={location:locationObject,history:{state:{next:'retained'},replaceState(state,_,value){assert.deepEqual(state,{next:'retained'});href=new URL(value,href).href;historyEntries[historyIndex]=href;writes++;},pushState(state,_,value){assert.deepEqual(state,{next:'retained'});href=new URL(value,href).href;historyEntries=historyEntries.slice(0,historyIndex+1);historyEntries.push(href);historyIndex++;pushes++;}},addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);if(listeners.get(name)?.size===0)listeners.delete(name);},setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},setInterval(){return ++timerId;},clearInterval(){},confirm:()=>true};
 global.document={visibilityState:'visible',addEventListener(){},removeEventListener(){},getElementById(id){return {focus(){focused=id;}};}};
 const fixture={id:randomUUID(),name:'Produk 001',imageUrl:'',category:'Rumah',priceSen:1000,commissionSen:100,url:'',reviewedOn:'2026-11-14',contentTypes:['UGC'],published:false,revision:1};
 let products=Array.from({length:50},(_,i)=>({...fixture,id:randomUUID(),name:`Produk ${String(i+1).padStart(3,'0')}`}));
 global.fetch=async(url,init)=>{
  assert.ok(['/api/affiliate?admin=1','/api/affiliate'].includes(url),'view params must never be passed to strict API query');
  if(init.method==='POST'){
   const body=JSON.parse(init.body);posts.push(body);if(failures)throw Error('fixture lost response');
   const p=body.product;
   if(body.action==='delete')products=products.filter(x=>x.id!==p.id);
   else if(p.revision===0)products=[{...p,revision:1},...products];
   else products=products.map(x=>x.id===p.id?{...p,revision:p.revision+1}:x);
  }
  return Response.json({admin:url.includes('admin=1')||init.method==='POST',access:'allowed',products:url==='/api/affiliate'&&init.method!=='POST'?products.filter(p=>p.published):products});
 };
 let admin;
 try {
  admin=mount();admin.cycle();assert.ok(href.includes('af_page=3'),'mount must not overwrite restored URL before data arrives');await settle();await settle();admin.cycle();
  const page=n=>nodes(admin.render()).find(x=>x.type==='button'&&x.props['aria-label']===`Page ${n}`);
  const button=label=>nodes(admin.render()).find(x=>x.type==='button'&&words(x)===label);
  const cards=()=>nodes(admin.render()).filter(x=>x.type==='article');
  assert.equal(page(3).props['aria-current'],'page');assert.match(words(cards()[0]),/Produk 019/);
  assert.equal(nodes(admin.render()).find(x=>x.type==='input'&&x.props.type==='search').props.value,'Produk');
  assert.equal(nodes(admin.render()).find(x=>x.type==='select').props.value,'Rumah');
  page(4).props.onClick();admin.cycle();assert.ok(href.includes('af_page=4'));assert.ok(href.includes('af_drafts=1'));
  admin.unmount();admin=mount();admin.cycle();await settle();await settle();admin.cycle();assert.equal(page(4).props['aria-current'],'page');
  button('Edit').props.onClick();admin.cycle();const editingId=posts.length;
  nodes(admin.render()).find(x=>x.type==='form').props.onSubmit({preventDefault(){}});await settle();await settle();admin.cycle();
  assert.equal(posts.length,editingId+1);assert.equal(page(4).props['aria-current'],'page');assert.ok(href.includes('af_q=Produk'));assert.ok(href.includes('af_drafts=1'));
  button("Add product").props.onClick();admin.cycle();
  nodes(admin.render()).find(x=>x.type==='input'&&x.props.maxLength===120).props.onChange({target:{value:'ZZZ New Product'}});admin.cycle();
  nodes(admin.render()).find(x=>x.type==='form').props.onSubmit({preventDefault(){}});await settle();await settle();admin.cycle();
  assert.equal(page(1).props['aria-current'],'page');assert.match(words(cards()[0]),/ZZZ New Product/);assert.match(cards()[0].props.className,/affiliate-card-added/);
  assert.equal(focused,cards()[0].props.id);assert.ok(!href.includes('af_page'));assert.ok(!href.includes('af_q'));assert.ok(!href.includes('af_category'));assert.ok(!href.includes('af_drafts'));assert.ok(href.includes('other=keep'));
  assert.equal(products[0].published,false,'new draft must remain a draft');
  const timer=[...timers.values()].at(-1);timer();admin.cycle();assert.doesNotMatch(cards()[0].props.className,/affiliate-card-added/);
  // Lost save response retains original draft/ID, with no automatic POST retry.
  button("Add product").props.onClick();admin.cycle();nodes(admin.render()).find(x=>x.type==='input'&&x.props.maxLength===120).props.onChange({target:{value:'Lost save'}});admin.cycle();
  failures=true;const postsBefore=posts.length;nodes(admin.render()).find(x=>x.type==='form').props.onSubmit({preventDefault(){}});await settle();await settle();admin.cycle();
  assert.equal(posts.length,postsBefore+1);assert.ok(nodes(admin.render()).some(x=>x.type==='form'));assert.match(words(admin.render()),/draft and original ID have been retained/);
  button("Cancel").props.onClick();admin.cycle();failures=false;
  // Delete the sole product on the last page: clamp the page and its URL together.
  page(6).props.onClick();admin.cycle();assert.equal(cards().length,6);
  products=products.slice(0,46);button("Refresh").props.onClick();await settle();await settle();admin.cycle();assert.equal(cards().length,1);
  button("Delete").props.onClick();await settle();await settle();admin.cycle();assert.equal(page(5).props['aria-current'],'page');assert.ok(href.includes('af_page=5'));
  // Back/forward URL restoration works without issuing a catalogue write.
  const postsBeforeNavigation=posts.length;href='https://video.radas.my/admin/products?af_page=2&af_q=Produk';listeners.get('popstate').forEach(fn=>fn());admin.cycle();assert.equal(page(2).props['aria-current'],'page');assert.equal(posts.length,postsBeforeNavigation);
  admin.unmount();assert.equal(listeners.has('popstate'),false);
  console.log('PASS admin URL restore/refresh/back, filters, existing save location, new draft focus, lost-save retention and deletion clamp');
  // Customer refresh retains the catalogue location, ignores forged draft filters, and makes GETs only.
  products=products.map(p=>({...p,published:p.category==='Rumah'}));
  href='https://video.radas.my/studio?tab=affiliate&af_page=3&af_q=Produk&af_category=Rumah&af_drafts=1';
  let user=mount(false);user.cycle();assert.ok(href.includes('af_page=3'));await settle();await settle();user.cycle();
  const userPage=n=>nodes(user.render()).find(x=>x.type==='button'&&x.props['aria-label']===`Page ${n}`);
  assert.equal(userPage(3).props['aria-current'],'page');assert.ok(!href.includes('af_drafts'));assert.ok(href.includes('tab=affiliate'));
  assert.equal(nodes(user.render()).find(x=>x.type==='input'&&x.props.type==='search').props.value,'Produk');
  assert.equal(nodes(user.render()).find(x=>x.type==='select').props.value,'Rumah');
  assert.ok(!nodes(user.render()).some(x=>x.type==='button'&&['Edit',"Delete","Add product"].includes(words(x))));
  userPage(4).props.onClick();user.cycle();assert.ok(href.includes('af_page=4'));
  user.unmount();user=mount(false);user.cycle();await settle();await settle();user.cycle();assert.equal(userPage(4).props['aria-current'],'page');
  const postsBeforeUser=posts.length;
  listeners.get('focus').forEach(fn=>fn());await settle();await settle();user.cycle();assert.equal(userPage(4).props['aria-current'],'page');
  nodes(user.render()).find(x=>x.type==='input'&&x.props.type==='search').props.onChange({target:{value:'Produk 03'}});user.cycle();
  assert.equal(userPage(1).props['aria-current'],'page');assert.ok(new URL(href).searchParams.get('af_q')==='Produk 03');
  userPage(2).props.onClick();user.cycle();assert.ok(href.includes('af_page=2'));
  nodes(user.render()).find(x=>x.type==='select').props.onChange({target:{value:''}});user.cycle();assert.ok(!href.includes('af_category'));assert.equal(userPage(1).props['aria-current'],'page');
  assert.equal(posts.length,postsBeforeUser);user.unmount();assert.equal(listeners.size,0);
  console.log('PASS customer catalogue restores page/search/category on refresh, resets page when filtering, keeps location during revalidation, ignores draft filters and performs reads only');
  // Real desktop/mobile workspace controls and greeting CTA keep the same tab URL contract.
  href='https://video.radas.my/studio?tab=affiliate&af_page=4&af_q=Produk&af_category=Rumah#catalog';
  let ws=mount(false,true);ws.cycle();
  const hasAffiliate=()=>nodes(ws.render()).some(n=>n.type.name==='AffiliatePanel');
  const wsButton=(label,mobile=false)=>nodes(ws.render()).find(n=>n.type==='button'&&words(n).endsWith(label)&&(mobile?n.props.className==='secondary':n.props.className.includes('nav-item')));
  assert.ok(hasAffiliate());const beforeDuplicate=pushes;wsButton("Affiliate Products").props.onClick();ws.cycle();assert.equal(pushes,beforeDuplicate);
  wsButton('Create Video',true).props.onClick();ws.cycle();assert.ok(!hasAffiliate());assert.ok(!new URL(href).searchParams.has('tab'));assert.ok(href.includes('af_page=4'));
  wsButton("Affiliate Products").props.onClick();ws.cycle();assert.ok(hasAffiliate());assert.ok(href.includes('tab=affiliate'));assert.ok(href.endsWith('#catalog'));
  ws.unmount();ws=mount(false,true);ws.cycle();assert.ok(hasAffiliate(),'refresh must restore Affiliate tab');
  href=href.replace('tab=affiliate','tab=video');listeners.get('popstate').forEach(fn=>fn());ws.cycle();assert.ok(!hasAffiliate());
  href=href.replace('tab=video','tab=affiliate');listeners.get('popstate').forEach(fn=>fn());ws.cycle();assert.ok(hasAffiliate());
  href=href.replace('tab=affiliate','tab=invalid');listeners.get('popstate').forEach(fn=>fn());ws.cycle();assert.ok(!hasAffiliate());
  nodes(ws.render()).find(n=>n.type.name==='WorkspaceGreeting').props.onFindProducts();ws.cycle();assert.ok(hasAffiliate());assert.ok(href.includes('tab=affiliate'));
  const payment=nodes(ws.render()).find(n=>n.type.name==='PaymentPanel');payment.props.onAdminResolved(true);ws.cycle();
  assert.ok(nodes(ws.render()).some(n=>n.type==='a'&&n.props.href==='/admin/payments'));assert.match(words(ws.render()),/Credits: 8/);
  ws.unmount();assert.equal(listeners.size,0);
  console.log('PASS actual Studio tab refresh/back/forward, desktop/mobile navigation and greeting CTA, invalid tab fallback, no duplicate history, preserved filters/hash/credits/Profile access');
  // Reproduce the reported browser history with workspace + catalogue listeners mounted together.
  href='https://video.radas.my/studio';historyEntries=[href];historyIndex=0;
  ws=mount(false,true);ws.cycle();wsButton("Affiliate Products").props.onClick();ws.cycle();
  user=mount(false);user.cycle();await settle();await settle();user.cycle();
  assert.equal(userPage(1).props['aria-current'],'page');
  userPage(2).props.onClick();user.cycle();userPage(3).props.onClick();user.cycle();
  assert.deepEqual(historyEntries.map(url=>new URL(url).searchParams.get('af_page')), [null,null,'2','3']);
  const pushesBeforeSame=pushes;userPage(3).props.onClick();user.cycle();assert.equal(pushes,pushesBeforeSame);
  const travel=delta=>{historyIndex+=delta;assert.ok(historyIndex>=0&&historyIndex<historyEntries.length);href=historyEntries[historyIndex];listeners.get('popstate').forEach(fn=>fn());ws.cycle();};
  const pushesBeforeBack=pushes;
  travel(-1);user.cycle();assert.ok(hasAffiliate());assert.equal(userPage(2).props['aria-current'],'page');
  travel(-1);user.cycle();assert.equal(userPage(1).props['aria-current'],'page');
  travel(-1);assert.ok(!hasAffiliate());assert.equal(new URL(href).pathname,'/studio');user.unmount();
  travel(1);assert.ok(hasAffiliate());user=mount(false);user.cycle();await settle();await settle();user.cycle();assert.equal(userPage(1).props['aria-current'],'page');
  travel(1);user.cycle();assert.equal(userPage(2).props['aria-current'],'page');
  travel(1);user.cycle();assert.equal(userPage(3).props['aria-current'],'page');
  assert.equal(pushes,pushesBeforeBack,'Back/Forward must not push new history entries');
  const currentUrl=href;user.unmount();ws.unmount();
  ws=mount(false,true);ws.cycle();user=mount(false);user.cycle();await settle();await settle();user.cycle();
  assert.ok(hasAffiliate());assert.equal(userPage(3).props['aria-current'],'page');assert.equal(href,currentUrl);assert.equal(pushes,pushesBeforeBack);
  user.unmount();ws.unmount();assert.equal(listeners.size,0);
  console.log('PASS real history sequence: Create Video -> Affiliate 1 -> 2 -> 3; Back 2 -> 1 -> Create Video; Forward restores 1 -> 2 -> 3; refresh stays on 3, no duplicate entries or listener leaks');

 } finally {
  admin?.unmount();global.fetch=originalFetch;if(originalWindow===undefined)delete global.window;else global.window=originalWindow;if(originalDocument===undefined)delete global.document;else global.document=originalDocument;
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
