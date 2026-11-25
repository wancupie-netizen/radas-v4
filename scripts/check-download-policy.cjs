// Offline fixtures: exercise the policy and the native transport separately; never dial live hosts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),Module=require('node:module');
const {PassThrough}=require('node:stream'),{EventEmitter}=require('node:events');
function load(file){const m=new Module(file);m.filename=file;const native=Module.createRequire(file);m.require=n=>n==='server-only'?{}:n.startsWith('.')?load(path.resolve(path.dirname(file),n+'.ts')):native(n);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
const {publicAddress,isStorageUrl,pinnedStorageGet}=load(path.resolve('src/lib/nexabot/storage-download.ts'));
const {createNexabotClient}=load(path.resolve('src/lib/nexabot/client.ts'));
const origin='https://aaaaaaaaaaaaaaaaaaaa.supabase.co',other='https://bbbbbbbbbbbbbbbbbbbb.supabase.co',suffix='/storage/v1/object/sign/videos/fixture.mp4?token=PRIVATE_FIXTURE',url=new URL(origin+suffix);
const oldPolicy=process.env.NEXABOT_DOWNLOAD_POLICY,oldOrigins=process.env.NEXABOT_DOWNLOAD_ORIGINS;
const signal=()=>new AbortController().signal;
function fixture({bytes=Buffer.from('fixture'),status=200,headers={},hang=false,disconnect=false,timeout=1000,answers=[{address:'104.18.2.10',family:4}]}={}){
 let invoked=0,destroyed=false,lookupCalls=0;let response;
 const request=(target,options,callback)=>{
  invoked++;assert.equal(target.origin,origin);assert.equal(options.agent,false);assert.equal(options.rejectUnauthorized,true);assert.equal(options.servername,url.hostname);assert.equal(options.method,'GET');
  assert.deepEqual(options.headers,{Accept:'video/mp4','Accept-Encoding':'identity'});assert.equal(options.maxHeaderSize,16384);
  options.lookup(url.hostname,{all:true},(e,a)=>{assert.equal(e,null);assert.deepEqual(a,[answers.find(a=>a.family===4)||answers[0]]);lookupCalls++;});
  options.lookup(url.hostname,{},(e,address,family)=>{assert.equal(e,null);assert.equal(address,(answers.find(a=>a.family===4)||answers[0]).address);assert.ok([4,6].includes(family));lookupCalls++;});
  options.lookup('internal.invalid',{},e=>assert.ok(e));
  const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{
   response=new PassThrough();response.statusCode=status;response.headers={'content-type':'video/mp4',...headers};response.once('close',()=>{destroyed=true;});
   const abort=()=>response.destroy(new Error('PRIVATE_FIXTURE'));options.signal.addEventListener('abort',abort,{once:true});response.once('close',()=>options.signal.removeEventListener('abort',abort));
   callback(response);if(disconnect)setImmediate(()=>response.destroy(new Error('PRIVATE_FIXTURE')));else if(!hang)response.end(bytes);
  });return req;
 };
 return {deps:{resolve:async()=>answers,request,bodyTimeoutMs:timeout},get invoked(){return invoked;},get destroyed(){return destroyed;},get lookupCalls(){return lookupCalls;}};
}
(async()=>{
 for(const address of ['104.18.2.10','8.8.8.8','2606:4700::1111','2a06:98c1:3120::1'])assert.equal(publicAddress(address),true,address);
 for(const address of ['0.0.0.0','10.1.1.1','127.0.0.1','100.64.0.1','169.254.169.254','172.16.0.1','192.168.1.1','192.0.0.1','192.0.2.1','192.88.99.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','::ffff:8.8.8.8','64:ff9b::808:808','fc00::1','fe80::1','fe80::1%eth0','ff02::1','2001::1','2001:db8::1','2002:808:808::1','3fff::1','invalid'])assert.equal(publicAddress(address),false,address);
 const invalid=[origin+'/auth/v1/token',origin+'/functions/v1/fixture',origin+'/storage/v1/object/sign/bucket/',origin+'/storage/v1/object/sign/bucket/a%2fb',origin+'/storage/v1/object/sign/bucket/a%252fb',origin+'/storage/v1/object/sign/bucket/a%0a',origin+'/storage/v1/object/sign/bucket/%zz',origin+suffix+'#fragment',origin.replace('https:','http:')+suffix,'https://u:p@'+url.host+suffix,origin+':444'+suffix,'https://supabase.co'+suffix,origin.replace('.co','.co.evil.example')+suffix,'https://x.'+url.host+suffix];
 for(const candidate of invalid)assert.equal(isStorageUrl(new URL(candidate)),false,candidate);
 assert.equal(isStorageUrl(url),true);assert.equal(isStorageUrl(new URL(origin+suffix.replace('/sign/','/public/'))),true);
 for(const answers of [[],[{address:'127.0.0.1',family:4}],[{address:'104.18.2.10',family:4},{address:'::1',family:6}],[{address:'104.18.2.10',family:6}]]){
  const f=fixture({answers});await assert.rejects(()=>pinnedStorageGet(url,signal(),f.deps),e=>e.reason==='unsafe_address');assert.equal(f.invoked,0);
 }
 let f=fixture();let response=await pinnedStorageGet(url,signal(),f.deps);assert.equal(await response.text(),'fixture');assert.equal(f.lookupCalls,2);
 f=fixture({answers:[{address:'2606:4700::1111',family:6}]});await(await pinnedStorageGet(url,signal(),f.deps)).arrayBuffer();assert.equal(f.lookupCalls,2);
 console.log('PASS public IPv4/IPv6 only; mixed/private DNS blocked; socket lookup pins checked address; fresh connection, TLS hostname verification and credential-free GET');
 let controller=new AbortController();let requested=false;const dns=pinnedStorageGet(url,controller.signal,{resolve:()=>new Promise(()=>{}),request:()=>{requested=true;}});controller.abort();await assert.rejects(dns);assert.equal(requested,false);
 f=fixture({headers:{'content-length':String(50*1024*1024+1)}});await assert.rejects(()=>pinnedStorageGet(url,signal(),f.deps));
 f=fixture({headers:{'content-encoding':'gzip'}});await assert.rejects(()=>pinnedStorageGet(url,signal(),f.deps));
 for(const options of [{bytes:Buffer.alloc(50*1024*1024+1)},{disconnect:true},{hang:true,timeout:10}]){f=fixture(options);response=await pinnedStorageGet(url,signal(),f.deps);await assert.rejects(()=>response.arrayBuffer(),e=>!e.message.includes('PRIVATE_FIXTURE'));}
 f=fixture({hang:true});response=await pinnedStorageGet(url,signal(),f.deps);await response.body.cancel();await new Promise(r=>setImmediate(r));assert.equal(f.destroyed,true);
 controller=new AbortController();f=fixture({hang:true});response=await pinnedStorageGet(url,controller.signal,f.deps);controller.abort();await assert.rejects(()=>response.arrayBuffer());
 console.log('PASS bounded headers/body, encoding rejection, disconnect, DNS/body abort, timeout and cancellation cleanup; sanitized body errors');
 process.env.NEXABOT_DOWNLOAD_POLICY='provider-redirect';delete process.env.NEXABOT_DOWNLOAD_ORIGINS;
 function client(locations){let calls=0;const c=createNexabotClient({apiKey:'nxb_PRIVATE_FIXTURE',fetcher:async(u,init)=>{assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');if(new URL(u).origin==='https://nexabot.id')assert.equal(init.headers['x-api-key'],'nxb_PRIVATE_FIXTURE');else assert.equal(init.headers,undefined);const location=locations[calls++];return location?new Response(null,{status:307,headers:{location}}):new Response('mp4',{headers:{'content-type':'video/mp4'}});}});return {c,get calls(){return calls;}};}
 for(const location of [origin+suffix,other+suffix,'https://bwcqhtntrfntnkjokihp.supabase.co'+suffix]){const c=client([location]);assert.equal(await(await c.c.downloadVideo('original-job')).text(),'mp4');assert.equal(c.calls,2);}
 let c=client([origin+suffix,origin+suffix.replace('fixture.mp4','second.mp4')]);assert.equal(await(await c.c.downloadVideo('original-job')).text(),'mp4');
 for(const chain of [...invalid.map(u=>[u]),['https://nexabot.id/api/v1/api'],[origin+suffix,other+suffix],[origin+suffix,'https://nexabot.id/api/v1/jobs/original-job/download'],[origin+suffix,origin+suffix,origin+suffix,origin+suffix]]){
  c=client(chain);await assert.rejects(()=>c.c.downloadVideo('original-job'),e=>e.code==='UNSAFE_DOWNLOAD_REDIRECT'&&!JSON.stringify(e).includes('PRIVATE_FIXTURE'));assert.ok(c.calls<=4);
 }
 c=client([origin+suffix]);await assert.rejects(()=>c.c.downloadVideo('../invalid'),e=>e.code==='INVALID_INPUT');assert.equal(c.calls,0);
 process.env.NEXABOT_DOWNLOAD_POLICY='exact';c=client([origin+suffix]);await assert.rejects(()=>c.c.downloadVideo('original-job'),e=>e.code==='UNSAFE_DOWNLOAD_REDIRECT');assert.equal(c.calls,1);
 process.env.NEXABOT_DOWNLOAD_POLICY='bad';assert.throws(()=>createNexabotClient({apiKey:'nxb_PRIVATE_FIXTURE'}),e=>e.diagnostic.redirect.reason==='invalid_download_policy');
 console.log('PASS per-download provider delegation, exact Storage path, one project per chain, no return to provider, three-hop limit, no API key leak, invalid config fails closed and exact-mode rollback');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const [name,value]of [['NEXABOT_DOWNLOAD_POLICY',oldPolicy],['NEXABOT_DOWNLOAD_ORIGINS',oldOrigins]])if(value===undefined)delete process.env[name];else process.env[name]=value;});
