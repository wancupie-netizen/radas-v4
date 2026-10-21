// Isolated PostgreSQL + actual API handlers + shipped browser sync code. No live writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const uid = '33333333-3333-4333-8333-333333333333';
const confirmed = { id: uid, email: 'wancupie@gmail.com', email_confirmed_at: '2026-10-01' };
let user = confirmed, authError = null, offline = false, loseResponse = false, putCalls = 0;
const fixture = { activeProject: 'isteri', isteriView: 'videos', radasView:'dashboard',dexsatoView:'dashboard',radasContentNotes:[],dexsatoContentNotes:[],radasNote:'default',radasProducts:[],isteriVideos: [{id:'v1',title:'Keep video',url:'https://example.com/one.mp4'}],
  isteriContentSeedVersion:1,dexsatoContentSeedVersion:1,weekStart:'2026-10-19',isteriContentNotes:[{id:'note',title:'Keep note'}],
  projects:{radas:{tasks:[{id:'task',title:'Keep task'}]},biscotto:{tasks:[]},dexsato:{tasks:[]},isteri:{tasks:[]}},productStatuses:{7:'done'} };
const db = new PGlite();
// Minimal PostgREST adapter executes the real table statements in isolated PostgreSQL.
const client = { from(table) {
  assert.equal(table,'radas_v4_command_center');
  let operation='select',values,columns='*';const filters=[];
  const q = {
    select(v){columns=v;return q;}, insert(v){operation='insert';values=v;return q;},
    update(v){operation='update';values=v;return q;},eq(k,v){filters.push([k,v]);return q;},
    async maybeSingle(){
      let sql,params=[];
      if(operation==='insert'){
        const keys=Object.keys(values);params=keys.map(k=>values[k]);
        sql=`insert into public.${table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning ${columns}`;
      }else{
        const set=operation==='update' ? Object.keys(values).map(k=>{params.push(values[k]);return `${k}=$${params.length}`;}).join(',') : '';
        const where=filters.map(([k,v])=>{params.push(v);return `${k}=$${params.length}`;}).join(' and ');
        sql=operation==='update' ? `update public.${table} set ${set} where ${where} returning ${columns}` : `select ${columns} from public.${table} where ${where}`;
      }
      try{const {rows}=await db.query(sql,params);return{data:rows[0]||null,error:null};}
      catch(e){return{data:null,error:{code:e.code,message:e.message}};}
    }
  };return q;
}};
const code = ts.transpileModule(fs.readFileSync('src/app/api/command-center/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',code)(name=>{
  if(name==='@/lib/supabase/server')return{createClient:async()=>({auth:{getUser:async()=>({data:{user},error:authError})}})};
  if(name==='@supabase/supabase-js')return{createClient:()=>client};
  return require(name);
},mod,mod.exports);
const savedEnv={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY,app:process.env.APP_URL};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fyqvvkpzcwrmyozxlqkw.supabase.co';process.env.SUPABASE_SECRET_KEY='isolated-test';process.env.APP_URL='https://video.radas.my';
const request=(body,origin='https://video.radas.my')=>new Request('https://video.radas.my/api/command-center',{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const put=body=>mod.exports.PUT(request(body));
const html=fs.readFileSync('src/lib/command-center/center.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function browser(initial,cache){
  const storage=new Map(initial ? [['radasCommandCenterV2',JSON.stringify(initial)]]:[]);
  if(cache)storage.set('radasCommandCenterV2:cloud',JSON.stringify(cache));
  const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,inert:false,addEventListener(){}});return elements.get(id);};
  const ctx=vm.createContext({console,URL,Blob,Date,JSON,Set,Number,Array,AbortSignal,crypto:{randomUUID},
    state:structuredClone(initial||fixture),STORAGE_KEY:'radasCommandCenterV2',
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>({click(){}})},
    window:{addEventListener(){},confirm:()=>true,location:{reload(){}}},setTimeout:()=>1,clearTimeout(){},render(){},
    DEFAULTS:{radas:{},biscotto:{},dexsato:{},isteri:{}},makeProject:()=>({tasks:[]}),createInitialState:()=>structuredClone(fixture),
    DEFAULT_RADAS_NOTE:'default',buildDefaultProducts:()=>[],makeDefaultIsteriContentNotes:()=>[],makeDefaultDexsatoContentNotes:()=>[],
    fetch:async(path,init)=>{
      assert.equal(path,'/api/command-center');if(offline)throw Error('offline');
      if(init.method==='GET')return mod.exports.GET();
      putCalls++;const res=await mod.exports.PUT(request(JSON.parse(init.body)));
      if(loseResponse){loseResponse=false;throw Error('response lost');}return res;
    }});
  vm.runInContext(script.slice(script.indexOf('    function loadState('),script.indexOf('    let state = loadState();')),ctx);
  vm.runInContext(script.slice(script.indexOf('    function saveState(){'),script.indexOf('    function projectName(')),ctx);
  return{ctx,storage,element,run:code=>vm.runInContext(code,ctx)};
}
(async()=>{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${uid}');`);
  const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_command_center_cloud_state.sql'));
  await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='radas_v4_command_center'")).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    await assert.rejects(()=>db.query('select * from public.radas_v4_command_center'),/permission denied/);
    await assert.rejects(()=>db.query(`insert into public.radas_v4_command_center values ('${uid}','{}',1,'${randomUUID()}',now())`),/permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  for(const candidate of [null,{...confirmed,email:'other@example.com',user_metadata:{email:confirmed.email}},{...confirmed,email_confirmed_at:null}]){
    user=candidate;assert.equal((await mod.exports.GET()).status,403);assert.equal((await put({})).status,403);
  }
  user=confirmed;authError={message:'invalid'};assert.equal((await mod.exports.GET()).status,403);authError=null;
  assert.equal((await mod.exports.PUT(request({},'https://evil.test'))).status,403);
  assert.equal((await put({state:fixture,version:-1,mutationId:randomUUID()})).status,400);
  assert.equal((await put({state:fixture,version:0,mutationId:'bad'})).status,400);
  assert.equal((await put({state:'bad',version:0,mutationId:randomUUID()})).status,400);
  const tooLarge=await put({state:{...fixture,huge:'x'.repeat(2*1024*1024)},version:0,mutationId:randomUUID()});assert.equal(tooLarge.status,413);
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://wrong.supabase.co';assert.equal((await mod.exports.GET()).status,503);process.env.NEXT_PUBLIC_SUPABASE_URL='https://fyqvvkpzcwrmyozxlqkw.supabase.co';
  const a=browser(fixture);await a.run('initializeCloud()');
  let record=(await (await mod.exports.GET()).json()).record;
  assert.deepEqual(record.state,fixture);assert.equal(record.version,1);assert.match(a.element('cloudStatus').textContent,/Berjaya disimpan/);
  assert.equal(a.storage.get('radasCommandCenterV2:before-cloud'),JSON.stringify(fixture));
  // A second, empty browser loads cloud state and cannot reset the saved data.
  const b=browser(null);await b.run('initializeCloud()');assert.deepEqual(JSON.parse(b.run('JSON.stringify(state)')),fixture);
  a.run('state.isteriVideos.push({id:"v2",url:"https://example.com/two.mp4"});saveState()');
  offline=true;await a.run('flushCloud()');assert.match(a.element('cloudStatus').textContent,/Belum berjaya/);
  assert.equal((await (await mod.exports.GET()).json()).record.version,1);
  offline=false;loseResponse=true;await a.run('flushCloud()');assert.match(a.element('cloudStatus').textContent,/Belum berjaya/);
  const attempts=putCalls;await a.run('flushCloud()');assert.equal(putCalls,attempts+1);
  record=(await (await mod.exports.GET()).json()).record;assert.equal(record.version,2);assert.equal(record.state.isteriVideos.length,2);
  b.run('state.isteriVideos=[];saveState()');await b.run('flushCloud()');
  assert.equal(b.element('centerMain').inert,true);assert.match(b.element('cloudStatus').textContent,/peranti lain/);
  assert.equal((await (await mod.exports.GET()).json()).record.state.isteriVideos.length,2);
  // Pending browser changes survive reload and resume against the same cloud version.
  a.run('state.isteriContentNotes.push({id:"new",title:"Unsynced"});saveState()');
  const cache=JSON.parse(a.storage.get('radasCommandCenterV2:cloud'));
  const resumed=browser(record.state,cache);await resumed.run('initializeCloud()');
  assert.equal((await (await mod.exports.GET()).json()).record.state.isteriContentNotes.length,2);
  // DB read failure leaves the legacy snapshot untouched and editing locked.
  offline=true;const c=browser(fixture);await c.run('initializeCloud()');assert.equal(c.element('centerMain').inert,true);
  assert.equal(c.storage.get('radasCommandCenterV2'),JSON.stringify(fixture));offline=false;
  const result=await mod.exports.GET();assert.match(result.headers.get('cache-control'),/private, no-store/);
  console.log('PASS cloud Command Center: PostgreSQL RLS/grants, verified-owner API, CSRF, size/shape/project guards, first migration, cross-browser load, offline retry, lost-response idempotency, stale-tab conflict, pending reload recovery and legacy backup.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:savedEnv.url,SUPABASE_SECRET_KEY:savedEnv.key,APP_URL:savedEnv.app})){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  await db.close();
});
