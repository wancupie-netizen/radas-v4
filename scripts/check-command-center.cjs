// Real GET handler with isolated Auth/file IO. No live accounts or database writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
let user=null,error=null,unavailable=false,reads=0,calls=0;
const html=fs.readFileSync('src/lib/command-center/center.html','utf8');
const source=fs.readFileSync('src/app/command-center/route.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',code)(name=>{
 if(name==='@/lib/supabase/server')return{createClient:async()=>({auth:{getUser:async()=>{calls++;if(unavailable)throw new Error('offline');return{data:{user},error};}}})};
 if(name==='node:fs/promises')return{readFile:async()=>{reads++;return html;}};
 return require(name);
},mod,mod.exports);
(async()=>{
 const get=()=>mod.exports.GET();
 let res=await get();assert.equal(res.status,303);assert.equal(res.headers.get('location'),'/login');assert.equal(reads,0);
 user={email:'other@example.com',email_confirmed_at:'2026-10-01',user_metadata:{email:'wancupie@gmail.com',admin:true}};
 res=await get();assert.equal(res.status,403);assert.equal(reads,0);
 user={email:'wancupie@gmail.com',email_confirmed_at:null};assert.equal((await get()).status,403);assert.equal(reads,0);
 user={email:'Wancupie@gmail.com',email_confirmed_at:'2026-10-01'};res=await get();assert.equal(res.status,200);assert.equal(await res.text(),html);assert.equal(reads,1);
 assert.match(res.headers.get('cache-control'),/private, no-store/);assert.equal(res.headers.get('vary'),'Cookie');assert.equal(res.headers.get('x-frame-options'),'DENY');assert.match(res.headers.get('content-type'),/text\/html/);
 error={message:'invalid token'};assert.equal((await get()).status,303);assert.equal(reads,1);error=null;
 unavailable=true;assert.equal((await get()).status,503);assert.equal(reads,1);assert.equal(calls,6);
 assert.match(html,/localStorage\.getItem\(STORAGE_KEY\)/);assert.match(html,/localStorage\.setItem\(STORAGE_KEY/);
 assert.ok(!fs.existsSync('public/center.html'));assert.ok(!fs.existsSync('public/center-v3.html'));
 new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 console.log('PASS Command Center: verified owner only, metadata spoof rejected, unconfirmed/anonymous/error denied, private no-cache, original HTML and browser storage, script syntax');
})().catch(e=>{console.error(e);process.exitCode=1;});
