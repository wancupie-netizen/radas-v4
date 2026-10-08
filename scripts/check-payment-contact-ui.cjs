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
 let payments=[],posts=[];global.fetch=async(_url,init={})=>{if(init.method){posts.push(JSON.parse(init.body));return Response.json({payment:payments[0]});}return Response.json({payments,admin:false});};
 let permission=false,serverAdmin=false,failRead=false;
 const baseFetch=global.fetch;global.fetch=async(url,init={})=>{if(!init.method&&failRead)throw new Error("offline");const response=await baseFetch(url,init);if(!init.method){const data=await response.json();return Response.json({...data,admin:serverAdmin});}return response;};
 const panel=harness('src/components/payment-panel.tsx','PaymentPanel',{onAdminResolved:value=>permission=value});
 const refresh=async p=>{nodes(p()).find(n=>n.type==='button'&&words(n).startsWith('Semak status')).props.onClick();await settle();await settle();};
 await refresh(panel);const packages=()=>nodes(panel()).filter(n=>n.type==='button'&&n.props.className?.includes('payment-package'));
 assert.ok(packages().every(n=>n.props.disabled));
 nodes(panel()).find(n=>n.type==='input'&&n.props.type==='tel').props.onChange({target:{value:'012-345 6789'}});
 assert.ok(packages().every(n=>!n.props.disabled));packages()[0].props.onClick();await settle();await settle();assert.equal(posts[0].whatsapp,'60123456789');assert.equal(posts[0].action,'create');
 const p={id:randomUUID(),user_id:randomUUID(),package_id:'try',amount_sen:500,credits:60,status:'pending',customer_reference:null,reason:null,created_at:new Date().toISOString(),whatsapp:null,customer_email:'customer@example.com'};
 payments=[p];await refresh(panel);assert.match(words(panel()),/Lengkapkan nombor WhatsApp/);
 nodes(panel()).find(n=>n.type==='input'&&n.props.minLength===3).props.onChange({target:{value:'UNSENT-BANK-REF'}});
 nodes(panel()).find(n=>n.type==='input'&&n.props.type==='tel').props.onChange({target:{value:'0191234567'}});
 nodes(panel()).find(n=>n.type==='form'&&words(n).includes('Simpan WhatsApp')).props.onSubmit({preventDefault(){}});await settle();await settle();assert.equal(posts.at(-1).action,'contact');assert.equal(posts.at(-1).whatsapp,'60191234567');assert.equal(nodes(panel()).find(n=>n.type==='input'&&n.props.minLength===3).props.value,'UNSENT-BANK-REF');
 const admin=harness('src/components/payment-panel.tsx','PaymentPanel',{admin:true});await refresh(admin);assert.match(words(admin()),/customer@example.com/);assert.match(words(admin()),/Belum diisi/);assert.equal(nodes(admin()).filter(n=>n.type==='a'&&n.props.href.startsWith('https://wa.me/')).length,0);
 payments=[{...p,whatsapp:'60123456789'}];await refresh(admin);const link=nodes(admin()).find(n=>n.type==='a'&&n.props.href==='https://wa.me/60123456789');assert.ok(link);assert.equal(link.props.rel,'noopener noreferrer');assert.equal(posts.length,2);
 serverAdmin=true;await refresh(panel);assert.equal(permission,true);assert.ok(nodes(panel()).some(n=>n.type==='a'&&n.props.href==='/admin/payments'));
 serverAdmin=false;await refresh(panel);assert.equal(permission,false);
 serverAdmin=true;await refresh(panel);failRead=true;await refresh(panel);assert.equal(permission,false);assert.ok(!nodes(panel()).some(n=>n.type==='a'&&n.props.href==='/admin/payments'));failRead=false;
 renderToStaticMarkup(admin());console.log('PASS actual payment UI handlers: gate package until contact, normalized creation, legacy contact save, admin email and manual WhatsApp link');
}finally{global.fetch=original;}})().catch(e=>{console.error(e);process.exitCode=1;});
