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
(async()=>{
 const original=global.fetch;global.window={location:{assign(){}},confirm:()=>true};let urls=[];
 const p={id:randomUUID(),user_id:randomUUID(),package_id:'try',amount_sen:500,credits:60,status:'approved',customer_reference:'CUSTOMER-REF',reason:null,created_at:new Date().toISOString(),reviewed_at:new Date().toISOString(),whatsapp:'60123456789',customer_email:'customer@example.com'};
 global.fetch=async(url)=>{urls.push(url);const q=new URL(url,'http://localhost:3000').searchParams,page=Number(q.get('page')||1),search=q.get('q')||'';const payments=search==='missing'?[]:Array.from({length:page===1?9:1},(_,i)=>({...p,id:page===1&&i===0?p.id:randomUUID()}));return Response.json({payments,total:search==='missing'?0:10,page:search==='missing'?1:page,pageSize:9});};
 try{
 const panel=harness('src/components/payment-history-panel.tsx','PaymentHistoryPanel',{});
 const find=(type,pred)=>nodes(panel()).find(n=>n.type===type&&pred(n));
 find('button',n=>words(n)==='Semak status rekod').props.onClick();await settle();await settle();
 assert.equal(nodes(panel()).filter(n=>n.type==='article').length,9);assert.match(words(panel()),/customer@example.com/);const wa=find('a',n=>n.props.href==='https://wa.me/60123456789');assert.equal(wa.props.target,'_blank');assert.equal(wa.props.rel,'noopener noreferrer');assert.equal(nodes(panel()).some(n=>n.type==='button'&&words(n).includes('Sahkan wang')),false);
 find('button',n=>words(n)==='Seterusnya').props.onClick();await settle();await settle();assert.equal(nodes(panel()).filter(n=>n.type==='article').length,1);assert.equal(new URL(urls.at(-1),'http://localhost:3000').searchParams.get('page'),'2');
 find('input',()=>true).props.onChange({target:{value:'missing'}});find('form',()=>true).props.onSubmit({preventDefault(){}});await settle();await settle();assert.match(words(panel()),/Tiada rekod bayaran ditemui/);assert.equal(new URL(urls.at(-1),'http://localhost:3000').searchParams.get('page'),'1');
 global.fetch=async()=>new Response('unavailable',{status:503});find('button',n=>words(n)==='Semak status rekod').props.onClick();await settle();await settle();assert.ok(find('p',n=>n.props.role==='alert'));renderToStaticMarkup(panel());
 // Invoke the actual review success handler: completion opens history automatically.
 let completed=0;let payment={...p,status:'submitted',reviewed_at:null};global.fetch=async(_url,init={})=>{if(init.method)payment={...p};return Response.json(init.method?{payment}:{payments:payment.status==='submitted'?[payment]:[]});};
 const review=harness('src/components/payment-panel.tsx','PaymentPanel',{admin:true,onReviewed:()=>completed++});
 const n=()=>nodes(review());n().find(x=>x.type==='button'&&words(x).startsWith('Semak status')).props.onClick();await settle();await settle();
 n().find(x=>x.type==='button'&&words(x)==='Semak pesanan ini').props.onClick();const inputs=n().filter(x=>x.type==='input');inputs[0].props.onChange({target:{value:'BANK-REAL'}});inputs[1].props.onChange({target:{value:'5'}});n().find(x=>x.type==='button'&&words(x)==='Sahkan wang diterima').props.onClick();await settle();await settle();assert.equal(completed,1);
 const wrapper=harness('src/components/admin-payments.tsx','AdminPayments',{});
 const reviewNode=nodes(wrapper()).find(x=>typeof x.type==='function'&&x.type.name==='PaymentPanel');assert.ok(reviewNode);reviewNode.props.onReviewed();assert.ok(nodes(wrapper()).find(x=>typeof x.type==='function'&&x.type.name==='PaymentHistoryPanel'));
 nodes(wrapper()).find(x=>x.type==='button'&&words(x)==='Perlu Disemak').props.onClick();assert.ok(nodes(wrapper()).find(x=>typeof x.type==='function'&&x.type.name==='PaymentPanel'));
 console.log('PASS real history UI handlers: nine cards, pagination/search reset, WhatsApp link, safe load errors, read-only history and approval completion callback');
 }finally{global.fetch=original;}
})().catch(e=>{console.error(e);process.exitCode=1;});
