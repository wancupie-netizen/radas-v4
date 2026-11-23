'use client';
import {useEffect,useRef,useState} from 'react';
import {requestJson,RequestError} from '@/lib/errors/client';
import {parseEntries,type EntriesSnapshot,type HookPrompt} from '@/lib/hooks-prompts/types';
import {readLibraryLocation,writeLibraryLocation,LIBRARY_PAGE_SIZE,type LibraryLocation} from '@/lib/hooks-prompts/location';
import styles from './hooks-prompts.module.css';
export function LibraryCard({entry}:{entry:HookPrompt}) {
 const [expanded,setExpanded]=useState(false),[copied,setCopied]=useState(false),[manual,setManual]=useState(false),[copying,setCopying]=useState(false);
 const field=useRef<HTMLTextAreaElement>(null),alive=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
 useEffect(()=>{if(manual){field.current?.focus();field.current?.select();}},[manual]);
 async function copy(){if(copying)return;setCopying(true);setManual(false);try{await navigator.clipboard.writeText(entry.text);if(alive.current){setCopied(true);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),2000);}}catch{if(alive.current){setCopied(false);setManual(true);}}finally{if(alive.current)setCopying(false);}}
 return <article className={styles.card}>
  {entry.category&&<span className={styles.badge}>{entry.category}</span>}<h2>{entry.title}</h2>
  <p className={expanded?styles.full:styles.preview}>{entry.text}</p>
  {entry.text.length>180&&<button className={styles.more} type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'Read more'}</button>}
  <button className={`primary ${styles.copy}`} type="button" disabled={copying} onClick={()=>void copy()}>{copied?'Copied!':copying?'Copying…':entry.kind==='hook'?'Copy Hook':'Copy Prompt'}</button>
  {manual&&<div><label htmlFor={'copy-'+entry.id}>Copy could not be completed. Select and copy the text below.</label><textarea ref={field} id={'copy-'+entry.id} readOnly value={entry.text} rows={5}/></div>}
  <span className={styles.sr} role="status">{copied?'Text copied to clipboard.':''}</span>
 </article>;
}
export function HooksPromptsPanel(){
 const [snapshot,setSnapshot]=useState<EntriesSnapshot|null>(null),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[attempt,setAttempt]=useState(0);
 const [location,setLocation]=useState<LibraryLocation>({kind:'hook',query:'',category:'',page:1});
 useEffect(()=>{const restore=()=>setLocation(readLibraryLocation(new URL(window.location.href)));restore();window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[]);
 useEffect(()=>{const ac=new AbortController();setLoading(true);setMessage('');setSnapshot(null);
  requestJson('/api/hooks-prompts',{signal:ac.signal}).then(d=>{if(!ac.signal.aborted)setSnapshot(parseEntries(d));}).catch(e=>{if(!ac.signal.aborted){if(e instanceof RequestError&&e.status===401)window.location.assign('/login');else setMessage('Hook & Prompt could not be loaded. Please try again.');}}).finally(()=>{if(!ac.signal.aborted)setLoading(false);});return()=>ac.abort();
 },[attempt]);
 function update(next:LibraryLocation,replace=false){const url=writeLibraryLocation(new URL(window.location.href),next);if(url!==window.location.pathname+window.location.search+window.location.hash)window.history[replace?'replaceState':'pushState'](window.history.state,'',url);setLocation(next);}
 const entries=(snapshot?.entries??[]).filter(e=>e.kind===location.kind),categories=[...new Set(entries.map(e=>e.category).filter(Boolean))].sort();
 const query=location.query.trim().toLowerCase(),filtered=entries.filter(e=>(!location.category||e.category===location.category)&&(!query||[e.title,e.category,e.text].some(t=>t.toLowerCase().includes(query))));
 const pages=Math.max(1,Math.ceil(filtered.length/LIBRARY_PAGE_SIZE)),page=Math.min(location.page,pages),shown=filtered.slice((page-1)*LIBRARY_PAGE_SIZE,page*LIBRARY_PAGE_SIZE);
 useEffect(()=>{if(snapshot&&location.page!==page)update({...location,page},true);},[snapshot,page,location.page]);
 return <section className={styles.page} aria-labelledby="library-title">
  <header className={styles.heading}><div><h1 id="library-title">Hook &amp; Prompt</h1><p>Find your next opening line or ready-to-use video prompt.</p></div>{snapshot?.admin&&<a className="secondary" href="/admin/hooks-prompts">Manage Hook &amp; Prompt</a>}</header>
  <div className={styles.tabs} aria-label="Collection type"><button type="button" className={location.kind==='hook'?'primary':'secondary'} aria-pressed={location.kind==='hook'} onClick={()=>update({...location,kind:'hook',category:'',page:1})}>Hooks</button><button type="button" className={location.kind==='prompt'?'primary':'secondary'} aria-pressed={location.kind==='prompt'} onClick={()=>update({...location,kind:'prompt',category:'',page:1})}>Prompts</button></div>
  <div className={styles.filters}><label>Search<input type="search" maxLength={400} placeholder={location.kind==='hook'?'Search hooks...':'Search prompts...'} value={location.query} onChange={e=>update({...location,query:[...e.target.value].slice(0,200).join(''),page:1},true)}/></label><label>Category<select value={location.category} onChange={e=>update({...location,category:e.target.value,page:1})}><option value="">All categories</option>{location.category&&!categories.includes(location.category)&&<option value={location.category}>{location.category}</option>}{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label></div>
  {loading?<p role="status">Loading collection…</p>:message?<div className="notice" role="alert"><p>{message}</p><button type="button" className="secondary" onClick={()=>setAttempt(attempt+1)}>Try again</button></div>:<>
   <p className={styles.note}>{filtered.length} {location.kind==='hook'?'hooks':'prompts'}</p>
   {!shown.length?<div className={styles.empty}>{entries.length?'No matches. Try another search or category.':location.kind==='hook'?'No hooks published yet. Check back soon.':'No prompts published yet. Check back soon.'}</div>:<div className={styles.grid}>{shown.map(e=><LibraryCard key={e.id+':'+e.revision} entry={e}/>)}</div>}
   {pages>1&&<nav className={styles.pagination} aria-label="Collection pages"><button type="button" className="secondary" disabled={page===1} onClick={()=>update({...location,page:page-1})}>Previous</button><span>Page {page} of {pages}</span><button type="button" className="secondary" disabled={page===pages} onClick={()=>update({...location,page:page+1})}>Next</button></nav>}
  </>}
 </section>;
}
