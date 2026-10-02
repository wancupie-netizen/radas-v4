// Local contract tests against a simulated Auth server; no live Supabase accounts.
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { readFileSync, mkdtempSync, cpSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const originalNextBin = require.resolve('next/dist/bin/next');
const ts = require('typescript');

const compiled = ts.transpileModule(readFileSync('src/lib/auth/input.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const inputModule = { exports: {} };
new Function('exports', 'module', compiled)(inputModule.exports, inputModule);
const { readCredentials } = inputModule.exports;
const form = values => { const f = new FormData(); for (const [k,v] of Object.entries(values)) f.set(k,v); return f; };
assert.ok(readCredentials(form({email:'bad',password:'abcdefgh'})).error);
assert.ok(readCredentials(form({email:'a@example.com',password:'short',name:'A'}),true).error);
assert.ok(readCredentials(form({email:'a@example.com',password:'🔒'.repeat(19),name:'A'}),true).error);
assert.ok(readCredentials(form({email:'a@example.com',password:'abcdefgh',name:''}),true).error);
assert.equal(readCredentials(form({email:' A@EXAMPLE.COM ',password:'  abcdefgh  '})).password,'  abcdefgh  ');
console.log('PASS server-side input validation and password preservation');

async function stopServer(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const stopped = new Promise(resolve => proc.once('exit', resolve));
  proc.kill();
  await stopped;
}
async function runAuthTests(testRoot) {
  const nextBin = path.join(testRoot, path.relative(process.cwd(), originalNextBin));
  let revoked = false, failLogout = false, refreshCount = 0, creditFailure = false;
  const user = { id:'11111111-1111-4111-8111-111111111111', aud:'authenticated', role:'authenticated', email:'test@example.com', email_confirmed_at:new Date().toISOString(), app_metadata:{provider:'email',providers:['email']}, user_metadata:{name:'Test'}, created_at:new Date().toISOString() };
  const b64 = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  function session() { return { access_token: `${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})}.testsignature`, token_type:'bearer', expires_in:3600, refresh_token:'local-test-refresh', user }; }
  const auth = http.createServer(async(req,res) => {
    const url = new URL(req.url,'http://localhost');
    let body='';for await (const part of req) body+=part;
    const data=body ? JSON.parse(body) : {};
    res.setHeader('Content-Type','application/json');
    function send(status,data) { res.statusCode=status;res.end(JSON.stringify(data)); }
    if (url.pathname==='/auth/v1/token') {
      if(url.searchParams.get('grant_type')==='pkce' && data.auth_code==='test-confirmation-code') return send(200,session());
      if(url.searchParams.get('grant_type')==='refresh_token') { refreshCount++;return send(200,session()); }
      if(data.email==='test@example.com' && data.password==='abcdefgh') return send(200,session());
      return send(400,{code:'invalid_credentials',msg:'Invalid login credentials'});
    }
    if(url.pathname==='/rest/v1/rpc/radas_v4_credit_snapshot') {
      assert.deepEqual(data, {}, 'Wallet RPC must not accept a browser-selected user');
      return creditFailure ? send(500,{message:'test database failure'}) : send(200,{balance:59,updatedAt:'2026-10-02T00:00:00Z',transactions:[{id:'test-ledger-id',type:'debit',amount:-1,balanceAfter:59,createdAt:'2026-10-02T00:00:00Z'}]});
    }
    if(url.pathname==='/auth/v1/user') return revoked ? send(401,{code:'bad_jwt',msg:'revoked'}) : send(200,user);
    if(url.pathname==='/auth/v1/signup') return send(200,{...user,email:data.email});
    if(url.pathname==='/auth/v1/logout') return failLogout ? send(500,{code:'unexpected_failure',msg:'service failed'}) : send(204,{});
    send(404,{msg:'Not found'});
  });
  await new Promise(resolve=>auth.listen(3094,'127.0.0.1',resolve));
  const proc = spawn(process.execPath,[nextBin,'start','--hostname','127.0.0.1','--port','3093'],{cwd:testRoot,env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3094',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_test',APP_URL:'http://127.0.0.1:3093'},stdio:['ignore','pipe','pipe']});
  let logs='';proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);
  const origin='http://127.0.0.1:3093';
  const jar=new Map();
  function updateCookies(res) { for(const value of res.headers.getSetCookie()){ const pair=value.split(';')[0];const eq=pair.indexOf('=');if(!pair.slice(eq+1)) jar.delete(pair.slice(0,eq));else jar.set(pair.slice(0,eq),pair.slice(eq+1));} }
  async function request(path, options={}) { const res=await fetch(origin+path,{...options,redirect:'manual',headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers}});updateCookies(res);return res; }
  const decode=s=>s.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&amp;','&');
  async function submit(path, values, chooseLast=false) {
    const html=await (await request(path)).text();
    const forms=[...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].filter(match => /name="\$ACTION_/.test(match[0]));
    const markup=forms[chooseLast ? forms.length-1 : 0]?.[0];assert.ok(markup,'Expected server action form');
    const body=form(values);
    for(const m of markup.matchAll(/<input\b[^>]*type="hidden"[^>]*>/g)) {const name=m[0].match(/name="([^"]*)"/);const value=m[0].match(/value="([^"]*)"/);if(name)body.set(decode(name[1]),decode(value?.[1]||''));}
    return request(path,{method:'POST',body,headers:{Origin:origin}});
  }
  try {
    let ready=false;
    for(let i=0;i<80;i++){try {const r=await request('/login');if(r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,'Production server did not start');
    let r=await request('/');assert.equal(r.status,307);assert.ok(r.headers.get('location').endsWith('/login'));
    r=await request('/auth/callback?next=https://example.com');assert.ok(r.headers.get('location').includes('/login?confirmation=failed'));
    assert.equal((await request('/api/credits')).status,401);
    assert.equal((await request('/api/credits',{method:'POST',body:JSON.stringify({balance:999})})).status,405);
    console.log('PASS anonymous workspace denial, safe callback failure and credit API mutation denial');
    r=await submit('/login',{email:'test@example.com',password:'wrongpass'});assert.equal(r.status,200);assert.match(await r.text(),/Login gagal/);
    assert.equal((await request('/')).status,307);
    r=await submit('/register',{name:'Test',email:'new@example.com',password:'abcdefgh'});assert.equal(r.status,200);assert.match(await r.text(),/Semak inbox/);
    assert.equal((await request('/')).status,307);
    console.log('PASS failed login and confirmation-required signup grant no access');
    r=await request('/auth/callback?code=test-confirmation-code&next=https://example.com');assert.equal(r.status,307);assert.ok(r.headers.get('location').endsWith('/'));assert.equal((await request('/')).status,200);
    r=await submit('/',{},true);assert.equal(r.status,303);
    console.log('PASS confirmation callback establishes cookies and ignores external redirects');
    r=await submit('/login',{email:'test@example.com',password:'abcdefgh'});assert.equal(r.status,303);assert.ok(jar.size>0);
    r=await request('/');assert.equal(r.status,200);assert.match(await r.text(),/test@example.com/);assert.match(r.headers.get('cache-control'),/no-store/);
    console.log('PASS successful login sets cookies, verified user sees workspace, response not cached');
    r=await request('/api/credits?user_id=someone-else');assert.equal(r.status,200);assert.equal((await r.json()).balance,59);assert.match(r.headers.get('cache-control'),/no-store/);
    creditFailure=true;r=await request('/api/credits');assert.equal(r.status,503);assert.equal((await r.json()).status,'unavailable');
    r=await request('/');assert.equal(r.status,200);assert.match(await r.text(),/Baki belum tersedia/);creditFailure=false;
    console.log('PASS wallet API ignores spoofed user ID, never caches and fails closed on database outage');
    // Expire the session in the test cookie to exercise refresh and cookie propagation.
    for(const [key,value] of jar) { if(value.startsWith('base64-')) { const stored=JSON.parse(Buffer.from(value.slice(7),'base64url').toString());stored.expires_at=1;jar.set(key,'base64-'+Buffer.from(JSON.stringify(stored)).toString('base64url')); } }
    r=await request('/');assert.equal(r.status,200);assert.ok(refreshCount>0);assert.ok(r.headers.getSetCookie().length>0);
    console.log('PASS expired session refresh updates response cookies');
    revoked=true;r=await request('/');assert.equal(r.status,307);assert.equal((await request('/api/credits')).status,401);revoked=false;
    console.log('PASS revoked user cannot access workspace despite existing cookies');
    failLogout=true;r=await submit('/',{},true);assert.equal(r.status,200);assert.match(await r.text(),/Logout belum berjaya/);failLogout=false;
    r=await submit('/',{},true);assert.equal(r.status,303);assert.ok(r.headers.get('location').endsWith('/login'));
    assert.equal((await request('/')).status,307);
    console.log('PASS logout failure is reported; successful logout removes workspace access');
  } catch (error) {console.error(logs);throw error;}
  finally {await stopServer(proc);await new Promise(resolve=>auth.close(resolve));}
  const unconfigured = spawn(process.execPath,[nextBin,'start','--hostname','127.0.0.1','--port','3095'],{cwd:testRoot,env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''},stdio:'ignore'});
  try {
    let response;
    for(let i=0;i<80;i++){try{response=await fetch('http://127.0.0.1:3095/login');if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.equal(response?.status,200);
    const html=await response.text();assert.match(html,/Sambungan akaun belum tersedia/);assert.match(html,/<button[^>]*disabled/);
    const denied=await fetch('http://127.0.0.1:3095/',{redirect:'manual'});assert.equal(denied.status,307);
    console.log('PASS missing configuration disables auth forms and denies workspace');
  } finally { await stopServer(unconfigured); }
}

(async () => {
  // NEXT_PUBLIC_* values are baked in at build time. Never test a build made
  // with the user's real .env.local; build a separate fixture without env files.
  const root = process.cwd();
  const testRoot = mkdtempSync(path.join(tmpdir(), 'radas-auth-test-'));
  try {
    for (const name of ['src', 'public', 'package.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs', 'next-env.d.ts']) {
      cpSync(path.join(root, name), path.join(testRoot, name), { recursive: true });
    }
    cpSync(path.join(root, 'node_modules'), path.join(testRoot, 'node_modules'), { recursive: true, verbatimSymlinks: true });
    const buildEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
    delete buildEnv.NEXT_PUBLIC_SUPABASE_URL;
    delete buildEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete buildEnv.APP_URL;
    delete buildEnv.SUPABASE_SECRET_KEY;
    delete buildEnv.NEXABOT_API_KEY;
    const fixtureNextBin = path.join(testRoot, path.relative(root, originalNextBin));
    const build = spawn(process.execPath, [fixtureNextBin, 'build'], { cwd: testRoot, env: buildEnv, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { build.on('error', reject); build.on('exit', resolve); });
    assert.equal(code, 0, 'Isolated auth fixture build failed');
    await runAuthTests(testRoot);
  } finally {
    rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
