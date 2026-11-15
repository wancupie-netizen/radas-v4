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
function harness(file,name,props){const slots=[],effects=new Map();let index=0;hooks={...React,useActionState(_action,initial){index++;return [initial,()=>{},false];},useState(initial){const n=index++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;return[slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},useRef(initial){const n=index++;return slots[n]||(slots[n]={current:initial});},useEffect(fn){effects.set(index++,fn);},useCallback(fn){index++;return fn;}};const component=load(file)[name];hooks=null;const render=()=>{index=0;return component(props);};render.runEffects=()=>Array.from(effects.values(),fn=>fn());return render;}
function nodes(tree,out=[]){if(Array.isArray(tree)){for(const t of tree)nodes(t,out);}else if(tree&&typeof tree==='object'&&tree.props){out.push(tree);nodes(tree.props.children,out);}return out;}
function words(tree){if(Array.isArray(tree))return tree.map(words).join('');return tree&&typeof tree==='object'&&tree.props?words(tree.props.children):typeof tree==='string'||typeof tree==='number'?String(tree):'';}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const greeting=load('src/components/workspace-greeting.tsx');
for(const bad of [undefined,null,{},42,' '.repeat(2),'x'.repeat(81)])assert.equal(greeting.accountDisplayName(bad),'');
assert.equal(greeting.accountDisplayName('  Wan   Sufi  '),'Wan Sufi');
for(const bad of [undefined,null,42,{},'', 'missing-at','a@@b.com','a b@example.com'])assert.equal(greeting.accountEmailName(bad),'');
assert.equal(greeting.accountEmailName('azmanm027@gmail.com'),'azmanm027');
const html=renderToStaticMarkup(React.createElement(greeting.WorkspaceGreeting,{name:'Ignored',email:'hijab3@gmail.com'}));assert.match(html,/Hi hijab3/);assert.doesNotMatch(html,/Ignored|👋/);assert.match(html,/What video would you like to create today/);
const fallback=renderToStaticMarkup(React.createElement(greeting.WorkspaceGreeting,{}));assert.match(fallback,/>Hi<\/p>/);assert.doesNotMatch(fallback,/undefined|null|👋/);
const safe=renderToStaticMarkup(React.createElement(greeting.WorkspaceGreeting,{email:'<script>alert(1)</script>@example.com'}));assert.doesNotMatch(safe,/<script>/);assert.match(safe,/&lt;script&gt;/);
const affiliateHtml=renderToStaticMarkup(React.createElement(greeting.WorkspaceGreeting,{name:'Wan',affiliate:true,id:'affiliate-title'}));assert.match(affiliateHtml,/Looking for a product for your next video/);assert.match(affiliateHtml,/estimated commissions/);assert.match(affiliateHtml,/id="affiliate-title"/);
// Real workspace handlers; mock only nested components and the server logout action.
const originalLoad=load;
function workspaceHarness(){const slots=[];let index=0;const fakeReact={...React,useEffect(){},useActionState:(_a,v)=>[v,()=>{},false],useState(initial){const n=index++;if(!(n in slots))slots[n]=initial;return[slots[n],v=>slots[n]=typeof v==='function'?v(slots[n]):v];},useRef(initial){const n=index++;return slots[n]||(slots[n]={current:initial});}};
 const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync('src/components/video-workspace.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const AffiliatePanel=()=>null,VideoStudio=()=>null,PaymentPanel=()=>null;
 new Function('require','module','exports',code)(name=>{if(name.endsWith('.css'))return{};if(name==='react')return fakeReact;if(name==='@/components/workspace-greeting')return greeting;if(name==='@/app/auth/actions')return{logout:()=>{}};if(name==='@/components/affiliate-panel')return{AffiliatePanel};if(name==='@/components/video-studio')return{VideoStudio};if(name==='@/components/payment-panel')return{PaymentPanel};if(name.startsWith('@/'))return originalLoad('src/'+name.slice(2)+'.'+(name.includes('components/')?'tsx':'ts'));return require(name);},mod,mod.exports);
 return {render(){index=0;return mod.exports.VideoWorkspace({accountName:'Wan Sufi',accountEmail:'private@example.com',initialCredits:{status:'ready',balance:55,transactions:[]},generationEnabled:true});},AffiliatePanel};
}
const originalWindow=global.window;let workspaceUrl=new URL('https://video.radas.my/studio');
global.window={location:{get href(){return workspaceUrl.href;},get pathname(){return workspaceUrl.pathname;},get search(){return workspaceUrl.search;},get hash(){return workspaceUrl.hash;}},history:{state:null,pushState(_state,_title,url){workspaceUrl=new URL(url,workspaceUrl);}}};
const ws=workspaceHarness();let tree=ws.render();const greet=nodes(tree).find(n=>n.type===greeting.WorkspaceGreeting);assert.ok(greet);assert.equal(greet.props.email,'private@example.com');assert.equal(greet.props.name,undefined);assert.equal(words(nodes(tree).find(n=>n.type==='header')), 'Create VideoCredits: 55Top Up');
greet.props.onFindProducts();tree=ws.render();const panel=nodes(tree).find(n=>n.type===ws.AffiliatePanel);assert.ok(panel);assert.equal(panel.props.accountName,'Wan Sufi');assert.equal(panel.props.balance,undefined);assert.equal(workspaceUrl.searchParams.get('tab'),'affiliate');assert.equal(words(nodes(tree).find(n=>n.type==='header')),'Affiliate ProductsCredits: 55Top Up');assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/updates'));
// Profile uses only the server-resolved payment permission, shared with Top Up.
const paymentNode=nodes(ws.render()).find(n=>n.type?.name==='PaymentPanel');
const profileLinks=()=>nodes(nodes(ws.render()).find(n=>n.type==='dialog'&&n.props['aria-labelledby']==='profile-title')).filter(n=>n.type==='a'&&n.props.href==='/admin/payments');
assert.equal(profileLinks().length,0);
paymentNode.props.onAdminResolved(true);assert.equal(profileLinks().length,1);assert.equal(words(profileLinks()[0]),'Review Payments↗');
paymentNode.props.onAdminResolved(false);assert.equal(profileLinks().length,0);
assert.equal(nodes(ws.render()).filter(n=>n.type==='button'&&words(n)==='Profile').length,2);
console.log('PASS admin Profile shortcut, default/user hidden, revoked permission hidden, shared desktop/mobile Profile');
console.log('PASS personalized greeting, missing/invalid name fallback, React escaping, affiliate copy, real CTA tab navigation and preserved credit/header/support props');

if(originalWindow===undefined)delete global.window;else global.window=originalWindow;
