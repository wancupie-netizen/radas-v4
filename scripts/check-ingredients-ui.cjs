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
 const originalWindow=global.window,create=URL.createObjectURL,revoke=URL.revokeObjectURL,fetch=global.fetch;
 let revoked=[],uploads=[],serial=0;
 URL.createObjectURL=()=>`blob:fixture-${++serial}`;URL.revokeObjectURL=url=>revoked.push(url);
 global.window={Image:class{naturalWidth=2;naturalHeight=2;async decode(){}}};
 global.fetch=async(url,init)=>{uploads.push(init.body);return Response.json({id:init.body.get('requestId'),status:'queued',expiresAt:new Date(Date.now()+3600000).toISOString(),refunded:false});};
 try{
 const panel=harness('src/components/video-studio.tsx','VideoStudio',{credits:{status:'ready',balance:60},generationEnabled:true,onCreditsChanged:async()=>{}});
 const find=(type,predicate)=>nodes(panel()).find(n=>n.type===type&&predicate(n));
 find('select',n=>n.props.id==='mode').props.onChange({target:{value:'ingredients'}});
 assert.deepEqual(nodes(panel()).filter(n=>n.type==='option').map(n=>words(n)),['Text to Video','Image to Video · 1 img','Ingredients to Video · 1–3 img']);
 const file=()=>new File([Buffer.from([137,80,78,71,13,10,26,10])],'photo.png',{type:'image/png'});
 const add=async(files)=>{find('input',n=>n.props.type==='file').props.onChange({currentTarget:{files,value:'x'}});await settle();await settle();};
 assert.equal(find('input',n=>n.props.type==='file').props.multiple,true);
 await add([file(),file()]);assert.match(words(panel()),/2 img rujukan/);
 await add([file(),file()]);assert.match(words(panel()),/Maksimum 3 img/);assert.match(words(panel()),/2 img rujukan/);
 find('button',n=>n.props['aria-label']?.startsWith('Buang img 1')).props.onClick();assert.equal(revoked.length,1);
 await add([file(),file()]);assert.match(words(panel()),/3 img rujukan/);
 assert.ok(find('button',n=>words(n)==='Tambah img').props.disabled);
 find('select',n=>n.props.id==='mode').props.onChange({target:{value:'image'}});
 assert.equal(find('input',n=>n.props.type==='file').props.multiple,false);
 await add([file(),file()]);assert.match(words(panel()),/Maksimum 1 img/);
 await add([file()]);assert.match(words(panel()),/1 img rujukan/);
 find('textarea',()=>true).props.onChange({target:{value:'Single image prompt'}});
 find('select',n=>n.props.id==='mode').props.onChange({target:{value:'ingredients'}});assert.match(words(panel()),/3 img rujukan/);assert.equal(find('textarea',()=>true).props.value,'');
 find('textarea',()=>true).props.onChange({target:{value:'Gunakan tiga img ini.'}});
 find('form',()=>true).props.onSubmit({preventDefault(){}});await settle();await settle();
 assert.equal(uploads.length,1);assert.equal(uploads[0].getAll('image').length,3);assert.equal(uploads[0].get('mode'),'ingredients');
 assert.equal(find('fieldset',n=>n.props.className==='generation-settings').props.disabled,true);
 console.log('PASS actual Ingredients UI handlers: add, remove, max-three guard, previews, multipart upload and locked generation settings');
 }finally{global.window=originalWindow;URL.createObjectURL=create;URL.revokeObjectURL=revoke;global.fetch=fetch;}
})().catch(e=>{console.error(e);process.exitCode=1;});
