// Pure session-history behavior; no live services, credit mutations or browser persistence.
const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const Module=require('node:module');const {randomUUID}=require('node:crypto');
const file=require('node:path').resolve('src/lib/history/recent.ts');const moduleFixture=new Module(file);moduleFixture._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {rememberRecent,pruneRecent,RECENT_LIMIT}=moduleFixture.exports;const now=Date.now();
function fixture(status='done',expires=now+12*60*60*1000){const id=randomUUID();return {generation:{id,status,expiresAt:new Date(expires).toISOString(),refunded:false},details:{id,prompt:'A distinct scene',mode:'text',orientation:'portrait',resolution:'720'}};}
let history=[];const first=fixture();history=rememberRecent(history,first.generation,first.details,now);assert.equal(history.length,1);
const preserved=history;assert.equal(rememberRecent(history,first.generation,{...first.details,prompt:'Changed'},now+1000),preserved);assert.equal(history[0].prompt,'A distinct scene');assert.equal(history[0].completedAt,new Date(now).toISOString());
first.generation.expiresAt=new Date(now+1000).toISOString();first.details.prompt='Mutated input';assert.equal(history[0].prompt,'A distinct scene');assert.equal(history[0].generation.expiresAt,new Date(now+12*60*60*1000).toISOString());
for(const status of ['reserved','submitting','queued','processing','failed','rejected','unknown']){const item=fixture(status);assert.equal(rememberRecent(history,item.generation,item.details,now),history);}
const refund=fixture();refund.generation.refunded=true;assert.equal(rememberRecent(history,refund.generation,refund.details,now),history);
const mismatch=fixture();mismatch.details.id=randomUUID();assert.equal(rememberRecent(history,mismatch.generation,mismatch.details,now),history);
const expired=fixture('done',now);assert.equal(rememberRecent(history,expired.generation,expired.details,now),history);
const invalidDate=fixture();invalidDate.generation.expiresAt='invalid';assert.equal(rememberRecent(history,invalidDate.generation,invalidDate.details,now),history);
console.log('PASS completed-only history; duplicates do not reorder/change snapshots; refunded/active/failed/expired/mismatched entries excluded');
let latest;for(let i=0;i<RECENT_LIMIT+5;i++){const item=fixture();latest=item.details.id;history=rememberRecent(history,item.generation,{...item.details,prompt:'Scene '+i,mode:i%2?'image':'text',resolution:i%2?'1080':'720'},now+i);}
assert.equal(history.length,RECENT_LIMIT);assert.equal(history[0].id,latest);assert.equal(new Set(history.map(x=>x.id)).size,RECENT_LIMIT);assert.equal(history.some(x=>x.id===first.details.id),false);assert.equal(history[0].resolution,'720');
const short=fixture('done',now+100);history=rememberRecent(history,short.generation,short.details,now);assert.equal(pruneRecent(history,now),history);assert.equal(pruneRecent(history,now+100).some(x=>x.id===short.details.id),false);assert.equal(pruneRecent(history,now+13*60*60*1000).length,0);
console.log('PASS newest-first bounded metadata list; immutable original settings; expiry boundary removes entries; HISTORY_LOCAL=PASS');
