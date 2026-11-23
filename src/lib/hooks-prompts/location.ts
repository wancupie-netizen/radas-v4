export type LibraryLocation={kind:'hook'|'prompt';query:string;category:string;page:number};
export const LIBRARY_PAGE_SIZE=9;
export function readLibraryLocation(url:URL):LibraryLocation {
 const p=url.searchParams,v=p.get('hp_page')??'';
 return {kind:p.get('hp_kind')==='prompt'?'prompt':'hook',query:[...(p.get('hp_q')??'')].slice(0,200).join(''),category:[...(p.get('hp_category')??'')].slice(0,60).join(''),page:/^[1-9]\d{0,2}$/.test(v)?Math.min(Number(v),56):1};
}
export function writeLibraryLocation(url:URL,state:LibraryLocation):string {
 const next=new URL(url);next.searchParams.set('tab','hooks-prompts');
 for(const [key,value] of [['hp_kind',state.kind==='prompt'?'prompt':''],['hp_q',state.query],['hp_category',state.category],['hp_page',state.page>1?String(state.page):'']]){if(value)next.searchParams.set(key,value);else next.searchParams.delete(key);}
 return next.pathname+next.search+next.hash;
}
