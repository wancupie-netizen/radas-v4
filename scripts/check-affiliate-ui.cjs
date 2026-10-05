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
function harness(file,name,props){const slots=[],effects=new Map();let index=0;hooks={...React,useState(initial){const n=index++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;return[slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},useRef(initial){const n=index++;return slots[n]||(slots[n]={current:initial});},useEffect(fn){effects.set(index++,fn);},useCallback(fn){index++;return fn;}};const component=load(file)[name];hooks=null;const render=()=>{index=0;return component(props);};render.runEffects=()=>Array.from(effects.values(),fn=>fn());return render;}
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
 nodes(admin()).find(n=>n.type==='button'&&words(n)==='Batal').props.onClick();
 const incomplete={...p,published:false,name:'Incomplete',imageUrl:'',category:'',priceSen:null,commissionSen:null,url:'',reviewedOn:'',contentTypes:[],sourceNotes:'Original RM161.59'};
 global.fetch=async()=>Response.json({admin:true,access:'allowed',products:[incomplete]});
 await refresh(admin);assert.equal(nodes(admin()).filter(n=>n.type==='img').length,0);assert.match(words(admin()),/Belum diisi/);assert.match(words(admin()),/Original RM161.59/);
 nodes(admin()).find(n=>n.type==='button'&&words(n)==='Edit').props.onClick();
 const editor=nodes(admin()).find(n=>n.type==='form');
 const numberInputs=nodes(editor).filter(n=>n.type==='input'&&n.props.type==='number');assert.ok(numberInputs.every(n=>n.props.value===''));
 const publish=nodes(editor).find(n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.checked===false&&n.props.disabled===true);assert.ok(publish);
 numberInputs[0].props.onChange({target:{value:'0'}});assert.equal(nodes(admin()).find(n=>n.type==='input'&&n.props.type==='number').props.value,0);
 numberInputs[0].props.onChange({target:{value:''}});assert.equal(nodes(admin()).find(n=>n.type==='input'&&n.props.type==='number').props.value,'');
 global.fetch=async(_url,init)=>{posts.push(JSON.parse(init.body));throw Error('lost response');};await save();assert.equal(posts.at(-1).product.priceSen,null);assert.equal(posts.at(-1).product.sourceNotes,incomplete.sourceNotes);
 console.log('PASS admin draft cards without broken images, source notes, null-versus-zero inputs, publish gating and save incomplete draft');
 nodes(admin()).find(n=>n.type==='button'&&words(n)==='Batal').props.onClick();
 const list=Array.from({length:99},(_,i)=>({...p,id:randomUUID(),name:`Produk ${String(i+1).padStart(3,'0')}`,category:i<10?'Dapur':'Rumah'}));
 global.fetch=async()=>Response.json({admin:true,access:'allowed',products:list});await refresh(admin);
 const cards=()=>nodes(admin()).filter(n=>n.type==='article'&&n.props.className.includes('affiliate-card'));
 const page=n=>nodes(admin()).find(x=>x.type==='button'&&x.props['aria-label']===`Halaman ${n}`);
 assert.equal(cards().length,9);assert.ok(words(cards()[0]).includes('Produk 001'));assert.ok(page(11));
 page(11).props.onClick();assert.equal(cards().length,9);assert.match(words(cards()[0]),/Produk 091/);assert.equal(page(11).props['aria-current'],'page');
 nodes(admin()).find(n=>n.type==='input'&&n.props.type==='search').props.onChange({target:{value:'Produk 099'}});
 assert.equal(cards().length,1);assert.equal(page(1).props['aria-current'],'page');assert.equal(page(2),undefined);
 nodes(admin()).find(n=>n.type==='input'&&n.props.type==='search').props.onChange({target:{value:''}});
 page(3).props.onClick();nodes(admin()).find(n=>n.type==='select').props.onChange({target:{value:'Dapur'}});
 assert.equal(cards().length,9);assert.equal(page(1).props['aria-current'],'page');page(2).props.onClick();assert.equal(cards().length,1);
 nodes(admin()).find(n=>n.type==='button'&&words(n)==='Edit').props.onClick();
 assert.equal(nodes(cards()[0]).filter(n=>n.type==='form').length,1);assert.equal(nodes(admin()).filter(n=>n.type==='form').length,1);
 assert.ok(nodes(admin()).find(n=>n.type==='input'&&n.props.type==='search').props.disabled);
 assert.ok(page(1).props.disabled);page(1).props.onClick();assert.equal(page(2).props['aria-current'],'page');
 nodes(admin()).find(n=>n.type==='button'&&words(n)==='Batal').props.onClick();assert.equal(nodes(admin()).filter(n=>n.type==='form').length,0);
 // Successful inline save preserves the current page and closes the editor.
 nodes(admin()).find(n=>n.type==='button'&&words(n)==='Edit').props.onClick();
 nodes(admin()).find(n=>n.type==='textarea').props.onChange({target:{value:'Admin note updated'}});
 let savedBody;global.fetch=async(_url,init)=>{savedBody=JSON.parse(init.body);return Response.json({admin:true,access:'allowed',products:list.map(p=>p.id===savedBody.product.id?{...savedBody.product,revision:p.revision+1}:p)});};
 await save();assert.equal(nodes(admin()).filter(n=>n.type==='form').length,0);assert.equal(page(2).props['aria-current'],'page');assert.match(words(cards()[0]),/Admin note updated/);assert.equal(savedBody.product.revision,1);
 // Deleting the only item on the last page clamps back to the remaining page.
 const remaining=list.filter(p=>p.name!=='Produk 010');global.fetch=async()=>Response.json({admin:true,access:'allowed',products:remaining});
 nodes(admin()).find(n=>n.type==='button'&&words(n)==='Padam').props.onClick();await settle();await settle();assert.equal(cards().length,9);assert.equal(page(1).props['aria-current'],'page');
 nodes(admin()).find(n=>n.type==='button'&&words(n)==='Tambah produk').props.onClick();assert.equal(nodes(admin()).filter(n=>n.type==='form').length,1);assert.match(words(admin()),/Tambah produk/);
 nodes(admin()).find(n=>n.type==='button'&&words(n)==='Batal').props.onClick();
 // Non-admin pagination still has no editor/actions and published-only responses.
 global.fetch=async()=>Response.json({admin:false,access:'allowed',products:list});const userPanel=harness('src/components/affiliate-panel.tsx','AffiliatePanel',{balance:60});await refresh(userPanel);
 assert.equal(nodes(userPanel()).filter(n=>n.type==='article').length,9);assert.equal(nodes(userPanel()).filter(n=>n.type==='form').length,0);assert.ok(!nodes(userPanel()).some(n=>n.type==='button'&&words(n)==='Edit'));
 console.log('PASS 99 products / 11 pages, 9 cards per page, search/category reset, inline edit placement, cancel, edit navigation guard, delete-last-page clamp and user pagination');
 // Published product without optional links is readable, without image/CTA.
 const optional={...p,imageUrl:'',url:''};global.fetch=async()=>Response.json({admin:false,access:'allowed',products:[optional]});await refresh(userPanel);
 assert.equal(nodes(userPanel()).filter(n=>n.type==='img').length,0);assert.equal(nodes(userPanel()).filter(n=>n.type==='a').length,0);assert.match(words(userPanel()),/Link produk akan dikemaskini/);
 global.fetch=async()=>Response.json({admin:true,access:'allowed',products:[optional]});await refresh(admin);nodes(admin()).find(n=>n.type==='button'&&words(n)==='Edit').props.onClick();
 const urls=nodes(admin()).filter(n=>n.type==='input'&&n.props.type==='url');assert.ok(urls.every(n=>n.props.value===''&&!n.props.required&&n.props.placeholder==='Akan dikemaskini'));
 let publishBox=nodes(admin()).find(n=>n.type==='label'&&words(n).includes('Terbitkan kepada pengguna')).props.children[0];
 publishBox.props.onChange({target:{checked:false}});
 publishBox=nodes(admin()).find(n=>n.type==='label'&&words(n).includes('Terbitkan kepada pengguna')).props.children[0];assert.equal(publishBox.props.disabled,false);
 nodes(admin()).find(n=>n.type==='button'&&words(n)==='Batal').props.onClick();
 console.log('PASS optional links: blank placeholders, publish enabled, no broken image/empty CTA');
 // Mount effects: admin fetches once, with no timer/focus/visibility refresh.
 const events=[],timers=[];let gets=0;
 global.document={visibilityState:'visible',addEventListener:(name,fn)=>events.push({surface:'document',name,fn}),removeEventListener(){}};
 Object.assign(global.window,{addEventListener:(name,fn)=>events.push({surface:'window',name,fn}),removeEventListener(){},setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearInterval(){}});
 global.fetch=async()=>{gets++;return Response.json({admin:true,access:'allowed',products:[p]});};
 const stableAdmin=harness('src/components/affiliate-panel.tsx','AffiliatePanel',{admin:true});stableAdmin();const adminCleanup=stableAdmin.runEffects();await settle();await settle();
 assert.equal(gets,1);assert.equal(events.length,0);assert.equal(timers.length,0);
 nodes(stableAdmin()).find(n=>n.type==='button'&&words(n)==='Edit').props.onClick();assert.equal(nodes(stableAdmin()).filter(n=>n.type==='form').length,1);
 adminCleanup.forEach(fn=>fn?.());
 // Non-admin revalidation remains unchanged: timer/focus and hidden-tab fail closed.
 global.fetch=async()=>{gets++;return Response.json({admin:false,access:'allowed',products:[p]});};
 const revalidatedUser=harness('src/components/affiliate-panel.tsx','AffiliatePanel',{balance:60});revalidatedUser();const userCleanup=revalidatedUser.runEffects();await settle();await settle();
 assert.equal(events.length,2);assert.equal(timers.length,1);assert.equal(timers[0].ms,60000);
 const beforeFocus=gets;events.find(e=>e.name==='focus').fn();await settle();await settle();assert.equal(gets,beforeFocus+1);
 document.visibilityState='hidden';events.find(e=>e.name==='visibilitychange').fn();assert.equal(nodes(revalidatedUser()).filter(n=>n.type==='article').length,0);
 document.visibilityState='visible';events.find(e=>e.name==='visibilitychange').fn();await settle();await settle();assert.equal(nodes(revalidatedUser()).filter(n=>n.type==='article').length,1);
 userCleanup.forEach(fn=>fn?.());delete global.document;
 console.log('PASS admin initial fetch only; no timer/focus/visibility refresh; user entitlement revalidation and hidden-tab clearing retained');
 assert.doesNotMatch(words(admin()),/Prompt video/);console.log('PASS actual client handlers: locked/no stale cards, zero/unavailable credit, top-up CTA, filters, safe links, lost-save draft and same ID; no automatic write retry');
}finally{global.fetch=original;delete global.window;}})().catch(e=>{console.error(e);process.exitCode=1;});
