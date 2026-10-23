// Execute the shipped seed + browser sync code; no live services or account writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const html = fs.readFileSync('src/lib/command-center/center.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new Function(script);
const seed = script.slice(script.indexOf('    /* ---------- Wan Sufi:'), script.indexOf('    /* ---------- End Wan Sufi seed ---------- */'));
const sync = script.slice(script.indexOf('    function saveState(){'), script.indexOf('    function projectName('));
const fixture = () => ({radasContentNotes:[{id:'old',title:'Nota asal',content:'Kekalkan'}],
  projects:{radas:{tasks:[{id:'task'}]},biscotto:{tasks:[]},dexsato:{tasks:[]}},isteriVideos:[{id:'video'}]});
const copy = value => JSON.parse(JSON.stringify(value));
let record, offline = false, loseResponse = false;
const requests = [];
function browser(initial = fixture(), cached) {
  const storage = new Map([['test',JSON.stringify(initial)]]);
  if(cached) storage.set('test:cloud',JSON.stringify(cached));
  const elements = new Map();
  const element = id => {
    if(!elements.has(id)) elements.set(id,{textContent:'',hidden:false,inert:false,addEventListener(){}});
    return elements.get(id);
  };
  const ctx = vm.createContext({state:copy(initial),STORAGE_KEY:'test',console,JSON,Set,Number,
    loadState:raw=>JSON.parse(raw),crypto:{randomUUID},AbortSignal,Blob,URL,Date,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>({click(){}})},
    window:{addEventListener(){},confirm:()=>true,location:{reload(){}}},
    render(){},setTimeout:()=>1,clearTimeout(){},
    escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
    renderSimpleMarkdown:value=>value,
    fetch:async(path,init)=>{
      assert.equal(path,'/api/command-center');
      if(offline) throw Error('offline');
      if(init.method==='GET') return {ok:true,json:async()=>({record:copy(record)})};
      const body=JSON.parse(init.body); requests.push(copy(body));
      if(record && record.mutation_id===body.mutationId && record.version===body.version+1)
        return {ok:true,json:async()=>({version:record.version,mutation_id:record.mutation_id})};
      if(body.version!==(record?.version||0)) return {ok:false,status:409};
      record={state:body.state,version:body.version+1,mutation_id:body.mutationId};
      if(loseResponse){loseResponse=false;throw Error('response lost');}
      return {ok:true,json:async()=>({version:record.version,mutation_id:record.mutation_id})};
    }});
  vm.runInContext(seed,ctx); vm.runInContext(sync,ctx);
  vm.runInContext(script.slice(script.indexOf('    function setRadasContentDone('),script.indexOf('    function renderRadasProducts(')),ctx);
  return {run:code=>vm.runInContext(code,ctx),storage,element};
}
(async()=>{
  record=null;
  const first=browser(); await first.run('initializeCloud()');
  assert.equal(record.state.radasContentNotes.length,32);
  assert.equal(record.state.radasWanSufiSeedVersion,1);
  assert.equal(record.state.radasContentNotes.at(-1).id,'old');
  assert.deepEqual(record.state.projects,fixture().projects);
  assert.deepEqual(record.state.isteriVideos,fixture().isteriVideos);
  const notes=record.state.radasContentNotes;
  assert.equal(new Set(notes.map(n=>n.id)).size,32);
  assert.equal(notes[0].title,'Wan Sufi — Pelan Content 30 Hari');
  for(let day=1;day<=30;day++){
    const n=notes[day];assert.equal(n.id,`wan-sufi-day-${String(day).padStart(2,'0')}-v1`);
    assert.match(n.content,/Facebook & Threads/);assert.match(n.content,/Idea \/ Draf/);
    assert.match(n.content,/Format utama Facebook/);assert.match(n.content,/Sudut cerita/);
  }
  // An existing cloud record is migrated and saved without requiring a manual edit.
  record={state:fixture(),version:8,mutation_id:randomUUID()};
  const cloud=browser();await cloud.run('initializeCloud()');
  assert.equal(record.version,9);assert.equal(record.state.radasContentNotes.length,32);
  cloud.run('state.radasContentNotes[1].title="Edited";state.radasContentNotes.splice(2,1);saveState()');
  await cloud.run('flushCloud()');
  const saved=copy(record);const other=browser();await other.run('initializeCloud()');
  assert.deepEqual(record,saved);assert.equal(record.state.radasContentNotes.length,31);
  assert.equal(record.state.radasContentNotes[1].title,'Edited');
  // Actual checkbox handler saves completion through the existing account sync.
  other.run('setRadasContentDone("wan-sufi-day-01-v1",true)');
  await other.run('flushCloud()');
  assert.equal(record.state.radasContentNotes.find(n=>n.id==='wan-sufi-day-01-v1').done,true);
  assert.match(other.element('radasContentList').innerHTML,/data-content-done="wan-sufi-day-01-v1" checked/);
  assert.doesNotMatch(other.element('radasContentList').innerHTML,/data-content-done="wan-sufi-plan-v1"/);
  const reloaded=browser();await reloaded.run('initializeCloud()');reloaded.run('renderRadasContentList()');
  assert.match(reloaded.element('radasContentList').innerHTML,/data-content-done="wan-sufi-day-01-v1" checked/);
  reloaded.run('setRadasContentDone("wan-sufi-day-01-v1",false)');await reloaded.run('flushCloud()');
  assert.equal(record.state.radasContentNotes.find(n=>n.id==='wan-sufi-day-01-v1').done,false);
  assert.doesNotMatch(reloaded.element('radasContentList').innerHTML,/data-content-done="wan-sufi-day-01-v1" checked/);
  assert.equal(record.state.radasContentNotes.find(n=>n.id==='wan-sufi-day-01-v1').title,'Edited');
  reloaded.run('setRadasContentDone("missing",true)');
  // Partial seed: preserve edits to stable IDs; add only missing items once.
  const partial=fixture();partial.radasContentNotes.push({id:'wan-sufi-day-01-v1',title:'Custom',content:'Keep'});
  const p=browser(partial);p.run('seedWanSufiContent(state)');
  let result=JSON.parse(p.run('JSON.stringify(state)'));
  assert.equal(result.radasContentNotes.length,32);
  assert.equal(result.radasContentNotes.find(n=>n.id==='wan-sufi-day-01-v1').title,'Custom');
  assert.equal(p.run('seedWanSufiContent(state)'),false);
  // Upgrade with an old unsent mutation: send that exact payload first, seed second.
  const old=fixture(), pending={state:copy(old),version:20,mutationId:randomUUID()};
  const unsaved=copy(old);unsaved.projects.radas.tasks.push({id:'unsaved'});
  record={state:copy(old),version:20,mutation_id:randomUUID()};
  const start=requests.length;
  const resumed=browser(old,{state:unsaved,version:20,pending,dirty:true});
  await resumed.run('initializeCloud()');
  assert.deepEqual(requests[start],pending);
  assert.equal(record.version,22);assert.equal(record.state.radasContentNotes.length,32);
  assert.equal(record.state.projects.radas.tasks.at(-1).id,'unsaved');
  // Lost response on seeded write is retried with the same mutation ID.
  record={state:fixture(),version:30,mutation_id:randomUUID()};loseResponse=true;
  const lost=browser();await lost.run('initializeCloud()');
  const firstAttempt=requests.at(-1);assert.match(lost.element('cloudStatus').textContent,/Belum berjaya/);
  await lost.run('flushCloud()');assert.deepEqual(requests.at(-1),firstAttempt);
  assert.equal(record.version,31);assert.equal(record.state.radasContentNotes.length,32);
  // A stale pending cache locks editing and never overwrites newer cloud content.
  const before=copy(record), count=requests.length;
  const stale=browser(old,{state:old,version:20,pending,dirty:true});await stale.run('initializeCloud()');
  assert.equal(stale.element('centerMain').inert,true);assert.equal(requests.length,count);assert.deepEqual(record,before);
  offline=true;const failed=browser();await failed.run('initializeCloud()');
  assert.equal(failed.element('centerMain').inert,true);assert.deepEqual(JSON.parse(failed.storage.get('test')),fixture());
  console.log('PASS Wan Sufi: 30 ordered drafts + plan; existing notes preserved; cloud migration saved; no duplicates; edit/delete survive reload; pending payload preserved; lost-response retry; stale/offline protection; script syntax.');
})().catch(error=>{console.error(error);process.exitCode=1;});
