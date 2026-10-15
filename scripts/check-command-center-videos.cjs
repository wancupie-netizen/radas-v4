// Offline behaviour tests of the shipped HTML handlers. No accounts, network or live writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('src/lib/command-center/center.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new Function(script);
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.textContent='';this.hidden=false;this.attrs={};this.events={};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(key,value){this.attrs[key]=value;}
 addEventListener(type,fn){this.events[type]=fn;}
 click(){this.events.click?.({preventDefault(){}});}
 reset(){for(const key of ['isteriVideoId','isteriVideoUrl','isteriVideoTitle'])ids[key].value='';}
 showModal(){this.open=true;}
 close(){this.open=false;}
}
const ids=Object.fromEntries(['isteriVideoDialog','isteriVideoForm','isteriVideoId','isteriVideoUrl','isteriVideoTitle','isteriVideoDialogTitle','isteriVideoError','isteriVideoList','isteriVideoMessage','isteriVideoAdd','isteriVideoClose','isteriVideoCancel'].map(id=>[id,new Element()]));
let stored=null,quota=false,count=0;
const old={activeProject:'radas',radasContentNotes:[{id:'r1',title:'Keep RADAS'}],isteriContentNotes:[{id:'i1',category:'Keep',title:'Keep Isteri'}],productStatuses:{7:'done'},projects:{radas:{tasks:[{id:'task'}]},biscotto:{},dexsato:{}}};
const state=structuredClone({...old,isteriVideos:[]});
const ctx=vm.createContext({URL,document:{getElementById:id=>ids[id],createElement:tag=>new Element(tag)},window:{confirm:()=>true},state,
 saveState(){if(quota)throw Error('quota');stored=structuredClone(state);},makeId:()=>`v${++count}`});
vm.runInContext(script.slice(script.indexOf('    function parseIsteriVideoUrl'),script.indexOf('    function renderProducts')),ctx);
const parse=value=>ctx.parseIsteriVideoUrl(value);
const short=parse('https://www.youtube.com/shorts/K6E5Q8fVCp4?si=tracking');
assert.equal(short.embed,'https://www.youtube-nocookie.com/embed/K6E5Q8fVCp4');assert.equal(short.vertical,true);
for(const url of ['https://youtu.be/K6E5Q8fVCp4','https://www.youtube.com/watch?v=K6E5Q8fVCp4','https://m.youtube.com/shorts/K6E5Q8fVCp4'])assert.equal(parse(url).key,short.key);
const fb=parse('https://web.facebook.com/reel/4762230610729861?foo=bar');
assert.equal(fb.url,'https://www.facebook.com/reel/4762230610729861');assert.equal(new URL(fb.embed).hostname,'www.facebook.com');
assert.equal(new URL(fb.embed).searchParams.get('href'),fb.url);
for(const url of ['javascript:alert(1)','data:text/html,<script>','http://example.com/x','https://name:pass@example.com/x','https://example.com:8443/x','https://youtube.com/shorts/bad'])assert.throws(()=>parse(url));
assert.equal(parse('https://youtube.com.evil.test/shorts/K6E5Q8fVCp4').type,'link');
assert.equal(parse('https://example.com/video.mp4?signature=keep').type,'video');
assert.equal(parse('https://example.com/page').type,'link');
console.log('PASS video URLs: real Shorts/Reel examples, canonical IDs, allowlisted embeds, direct MP4, unsupported fallback and unsafe URL rejection');
const submit=(url,title='',id='')=>{ids.isteriVideoUrl.value=url;ids.isteriVideoTitle.value=title;ids.isteriVideoId.value=id;ids.isteriVideoForm.events.submit({preventDefault(){}});};
submit(short.url);assert.equal(state.isteriVideos.length,1);assert.equal(state.isteriVideos[0].title,'');assert.equal(stored.isteriVideos.length,1);
submit('https://youtu.be/K6E5Q8fVCp4');assert.equal(state.isteriVideos.length,1);assert.match(ids.isteriVideoError.textContent,/sudah ada/);
submit(fb.url,'<img src=x onerror=alert(1)>');assert.equal(state.isteriVideos.length,2);
const row=ids.isteriVideoList.children[0],head=row.children[0],main=head.children[0],actions=head.children[1];
assert.equal(main.children[1].textContent,'<img src=x onerror=alert(1)>');assert.equal(main.children[1].children.length,0);
assert.equal(actions.children[1].rel,'noopener noreferrer');
assert.equal(row.children[1].children.length,0);actions.children[0].click();
const iframe=row.children[1].children[0];assert.equal(iframe.tagName,'IFRAME');assert.equal(iframe.attrs.referrerpolicy,'strict-origin-when-cross-origin');assert.equal(iframe.src,fb.embed);
const second=ids.isteriVideoList.children[1];second.children[0].children[1].children[0].click();assert.equal(row.children[1].children.length,0);
ctx.closeIsteriVideoPreview();assert.equal(second.children[1].children.length,0);
actions.children[2].click();assert.equal(ids.isteriVideoDialog.open,true);assert.equal(ids.isteriVideoId.value,state.isteriVideos[0].id);
submit(fb.url,'Updated',state.isteriVideos[0].id);assert.equal(state.isteriVideos[0].title,'Updated');assert.equal(state.isteriVideos.length,2);
quota=true;submit('https://example.com/another.mp4','Not saved');assert.equal(state.isteriVideos.length,2);assert.match(ids.isteriVideoError.textContent,/belum disimpan/);quota=false;
ids.isteriVideoList.children[0].children[0].children[1].children[3].click();assert.equal(state.isteriVideos.length,1);assert.equal(stored.isteriVideos.length,1);
for(const key of Object.keys(old))assert.deepEqual(state[key],old[key]);
console.log('PASS actual video handlers: link-only add, duplicate guard, safe title rendering, lazy one-at-a-time preview, edit/delete, storage rollback and unrelated data preserved');
// Run the real loadState migration against pre-feature browser data.
const migration={...structuredClone(old),weekStart:'2026-10-12',isteriContentSeedVersion:1,dexsatoContentSeedVersion:1};
const migrationCtx=vm.createContext({URL,Date,JSON,Set,Number,Array,STORAGE_KEY:'radasCommandCenterV2',localStorage:{getItem:()=>JSON.stringify(migration)},
 createInitialState:()=>{throw Error('must not reset valid old data')},DEFAULTS:{radas:{},biscotto:{},dexsato:{},isteri:{}},makeProject:()=>({tasks:[]}),
 DEFAULT_RADAS_NOTE:'default',buildDefaultProducts:()=>[],makeDefaultIsteriContentNotes:()=>[],makeDefaultDexsatoContentNotes:()=>[]});
vm.runInContext(script.slice(script.indexOf('    function loadState(){'),script.indexOf('    let state = loadState();')),migrationCtx);
const migrated=migrationCtx.loadState();assert.deepEqual(Array.from(migrated.isteriVideos),[]);
assert.deepEqual(JSON.parse(JSON.stringify(migrated.isteriContentNotes)),old.isteriContentNotes);
assert.deepEqual(JSON.parse(JSON.stringify(migrated.projects.radas)),old.projects.radas);
assert.equal(migrated.productStatuses[7],'done');
migration.isteriVideos=structuredClone(state.isteriVideos);migration.isteriView='videos';
const reloaded=migrationCtx.loadState();assert.equal(reloaded.isteriVideos.length,1);assert.equal(reloaded.isteriView,'videos');
console.log('PASS existing browser-state migration and reload: saved videos retained without resetting notes/tasks/products');
console.log('COMMAND_CENTER_VIDEOS=PASS (offline; live YouTube/Facebook playback still requires browser verification)');
