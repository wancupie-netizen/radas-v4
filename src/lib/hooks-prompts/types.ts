export type HookPrompt = { id:string; kind:'hook'|'prompt'; title:string; category:string; text:string; sortOrder:number; published:boolean; revision:number };
export type EntriesSnapshot = { admin:boolean; entries:HookPrompt[] };
const length=(s:string)=>[...s].length;
export function validEntry(value:unknown): value is HookPrompt {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as HookPrompt;
 return Object.keys(v).length===8&&Object.keys(v).every(k=>['id','kind','title','category','text','sortOrder','published','revision'].includes(k))&&
  typeof v.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.id)&&
  ['hook','prompt'].includes(v.kind)&&typeof v.title==='string'&&v.title===v.title.trim()&&length(v.title)>=1&&length(v.title)<=120&&
  typeof v.category==='string'&&v.category===v.category.trim()&&length(v.category)<=60&&
  typeof v.text==='string'&&v.text===v.text.trim()&&length(v.text)>=1&&length(v.text)<=12000&&
  typeof v.published==='boolean'&&Number.isSafeInteger(v.sortOrder)&&v.sortOrder>=0&&v.sortOrder<=9999&&
  Number.isSafeInteger(v.revision)&&v.revision>=0&&v.revision<=2147483646;
}
export function parseEntries(value:unknown):EntriesSnapshot {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_entries');
 const v=value as EntriesSnapshot;
 if(typeof v.admin!=='boolean'||!Array.isArray(v.entries)||v.entries.length>500||!v.entries.every(e=>validEntry(e)&&e.revision>0&&(v.admin||e.published))||new Set(v.entries.map(e=>e.id)).size!==v.entries.length)throw new Error('invalid_entries');
 return {admin:v.admin,entries:v.entries.map(e=>({...e}))};
}
