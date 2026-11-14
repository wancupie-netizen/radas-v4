// Real catalogue/preview handlers and clipboard outcomes; no live services or paid requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
let hooks=null;
function load(file,cache=new Map()) {
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const mod={exports:{}};cache.set(file,mod);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(name.endsWith('.css'))return {};
  if(name==='react')return hooks||React;
  if(name.startsWith('@/')||name.startsWith('.')){let target=name.startsWith('@/')?path.resolve('src',name.slice(2)):path.resolve(path.dirname(file),name);if(!path.extname(target))target+=fs.existsSync(target+'.tsx')?'.tsx':'.ts';return load(target,cache);}
  return require(name);
 },mod,mod.exports);return mod.exports;
}
function nodes(tree,out=[]) {if(Array.isArray(tree))tree.forEach(child=>nodes(child,out));else if(tree?.props){out.push(tree);nodes(tree.props.children,out);}return out;}
function words(tree){if(Array.isArray(tree))return tree.map(words).join('');return tree?.props?words(tree.props.children):typeof tree==='string'||typeof tree==='number'?String(tree):'';}
function harness(file,name,props,childName) {
 const slots=[];let index=0;
 hooks={...React,useState(initial){const n=index++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;return [slots[n],v=>slots[n]=typeof v==='function'?v(slots[n]):v];},useRef(initial){const n=index++;return slots[n]||(slots[n]={current:initial});},useEffect(){index++;},useCallback(fn){index++;return fn;}};
 let component=load(file)[name];hooks=null;
 if(childName){const child=nodes(component(props)).find(n=>n.type.name===childName);component=child.type;props=child.props;}
 return ()=>{index=0;return component(props);};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const originalFetch=global.fetch,originalNavigator=Object.getOwnPropertyDescriptor(global,'navigator'),originalWindow=global.window;
 try {
  const {CONTENT_TYPES,parseCatalog}=load('src/lib/affiliate/types.ts');
  const {productTemplates}=load('src/lib/affiliate/templates.ts');
  assert.deepEqual(CONTENT_TYPES,['POV','UGC','Demonstrasi','Unboxing','Review','Storytelling','Perbandingan']);
  const supported=CONTENT_TYPES.filter(t=>t!=='Perbandingan');
  for(let mask=0;mask<128;mask++) {
   const selected=CONTENT_TYPES.filter((_,i)=>mask&(1<<i));
   const templates=productTemplates('Jam AL FALAH',selected);
   assert.deepEqual(templates.map(t=>t.type),supported.filter(t=>selected.includes(t)));
   for(const template of templates){assert.ok(template.text.includes('Jam AL FALAH'));assert.ok(template.text.includes('15 saat'));assert.ok(!template.text.includes('[nama produk]'));}
  }
  assert.ok(productTemplates('', ['UGC'])[0].text.includes('[nama produk]'));
  assert.ok(productTemplates('$& [produk]', ['UGC'])[0].text.includes('$& [produk]'));
  const components=load('src/components/product-prompt-templates.tsx');
  assert.equal(components.ProductPromptTemplates({name:'Jam',contentTypes:['Perbandingan']}),null);
  const html=renderToStaticMarkup(React.createElement(components.ProductPromptTemplates,{name:'</textarea><script>alert(1)</script>',contentTypes:['UGC','Review','Perbandingan']}));
  assert.equal((html.match(/<textarea/g)||[]).length,2);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!/<details[^>]*\sopen/.test(html));assert.ok(html.includes('readOnly'));
  console.log('PASS all 128 content combinations: six shared templates, Perbandingan retained without template, product names escaped, sections collapsed');

  let reads=0,posts=[];
  const product={id:'12345678-1234-4234-8234-123456789abc',name:'AL FALAH',imageUrl:'',category:'Rumah',priceSen:14990,commissionSen:750,url:'',reviewedOn:'2026-11-14',contentTypes:['UGC','Review','Perbandingan'],published:true,revision:1,sourceNotes:'PRIVATE_SOURCE'};
  let saved={...product};
  global.window={location:{assign(){throw Error('unexpected login redirect');}},confirm:()=>true};
  global.fetch=async(url,init)=>{
   assert.match(url,/^\/api\/affiliate(?:\?admin=1)?$/);
   if(init.method==='POST'){const body=JSON.parse(init.body);posts.push(body);assert.deepEqual(Object.keys(body).sort(),['action','product']);assert.ok(!('templates' in body.product));assert.ok(!('examplePrompt' in body.product));saved={...body.product,revision:saved.revision+1};}
   else reads++;
   const admin=url.includes('admin=1')||init.method==='POST';const visible={...saved};if(!admin)delete visible.sourceNotes;
   return Response.json({admin,access:'allowed',products:admin||visible.published?[visible]:[]});
  };
  const admin=harness('src/components/affiliate-panel.tsx','AffiliatePanel',{admin:true});
  const refresh=async panel=>{nodes(panel()).find(n=>n.type==='button'&&words(n)==='Semak semula').props.onClick();await settle();await settle();};
  const promptProps=panel=>nodes(panel()).filter(n=>n.type.name==='ProductPromptTemplates').map(n=>n.props);
  await refresh(admin);assert.equal(promptProps(admin).length,1);assert.ok(!promptProps(admin)[0].preview);
  nodes(admin()).find(n=>n.type==='button'&&words(n)==='Edit').props.onClick();
  const checkbox=label=>nodes(admin()).find(n=>n.type==='label'&&words(n)===label).props.children[0];
  assert.equal(checkbox('Perbandingan').props.checked,true);
  assert.equal(promptProps(admin)[0].preview,true);
  checkbox('UGC').props.onChange({target:{checked:false}});checkbox('Review').props.onChange({target:{checked:false}});
  assert.equal(productTemplates(promptProps(admin)[0].name,promptProps(admin)[0].contentTypes).length,0);
  checkbox('POV').props.onChange({target:{checked:true}});
  assert.deepEqual(productTemplates(promptProps(admin)[0].name,promptProps(admin)[0].contentTypes).map(t=>t.type),['POV']);
  assert.equal(posts.length,0,'tick/untick must not save automatically');
  nodes(admin()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();await settle();
  assert.equal(posts.length,1);assert.equal(posts[0].action,'save');assert.deepEqual(posts[0].product.contentTypes,['Perbandingan','POV']);
  assert.equal(posts[0].product.sourceNotes,'PRIVATE_SOURCE');assert.equal(posts[0].product.revision,1);
  assert.ok(!promptProps(admin)[0].preview);await refresh(admin);
  assert.deepEqual(promptProps(admin)[0].contentTypes,['Perbandingan','POV']);
  const user=harness('src/components/affiliate-panel.tsx','AffiliatePanel',{});await refresh(user);
  assert.deepEqual(promptProps(user)[0].contentTypes,['Perbandingan','POV']);assert.doesNotMatch(words(user()),/PRIVATE_SOURCE/);
  assert.ok(!nodes(user()).some(n=>n.type==='button'&&words(n)==='Edit'));
  saved={...saved,contentTypes:['Perbandingan']};assert.equal(parseCatalog({admin:false,access:'allowed',products:[saved]}).products.length,1);
  await refresh(user);assert.equal(productTemplates(promptProps(user)[0].name,promptProps(user)[0].contentTypes).length,0);
  saved={...saved,published:false};await refresh(user);assert.equal(promptProps(user).length,0);
  console.log('PASS actual admin tick/untick, preview before save, unchanged save payload/revision/private notes, refreshed customer catalogue and draft exclusion');

  // Clipboard tests execute the actual button handler, including older browsers without the API.
  let copied=[],selected=0,focused=0;
  const copyPanel=()=>harness('src/components/product-prompt-templates.tsx','ProductPromptTemplates',{name:'AL FALAH',contentTypes:['Review']},'PromptTemplate');
  Object.defineProperty(global,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>copied.push(text)}}});
  const copy=copyPanel();nodes(copy()).find(n=>n.type==='button').props.onClick();await settle();
  assert.deepEqual(copied,[productTemplates('AL FALAH',['Review'])[0].text]);assert.match(words(copy()),/Disalin/);
  let attempts=0;
  for(const navigatorValue of [{},{clipboard:{writeText:async()=>{attempts++;throw Error('PRIVATE_CLIPBOARD_ERROR');}}}]) {
   Object.defineProperty(global,'navigator',{configurable:true,value:navigatorValue});const fallback=copyPanel();
   nodes(fallback()).find(n=>n.type==='textarea').props.ref.current={focus(){focused++;},select(){selected++;}};
   nodes(fallback()).find(n=>n.type==='button').props.onClick();await settle();
   assert.match(words(fallback()),/salin secara manual/);assert.doesNotMatch(words(fallback()),/Disalin|PRIVATE_CLIPBOARD_ERROR/);
   assert.equal(nodes(fallback()).find(n=>n.type==='textarea').props.value,productTemplates('AL FALAH',['Review'])[0].text);
  }
  assert.equal(attempts,1);assert.equal(selected,2);assert.equal(focused,2);
  assert.equal(posts.length,1);assert.equal(reads,5,'copy actions must not issue network requests');
  console.log('PASS exact clipboard text, success only after copy, unavailable/rejected API selects readable manual fallback, no network or automatic retries');
 } finally {
  global.fetch=originalFetch;if(originalNavigator)Object.defineProperty(global,'navigator',originalNavigator);else delete global.navigator;
  if(originalWindow===undefined)delete global.window;else global.window=originalWindow;
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
