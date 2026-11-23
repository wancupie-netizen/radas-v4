'use client';
import { useEffect, useRef, useState } from 'react';
import { parseEntries, validEntry, type HookPrompt, type EntriesSnapshot } from '@/lib/hooks-prompts/types';
import { requestJson, RequestError } from '@/lib/errors/client';
import styles from './hooks-prompts.module.css';
type Command = { action:'save'|'delete'; entry:HookPrompt };
export function HooksPromptsAdmin() {
  const [snapshot,setSnapshot] = useState<EntriesSnapshot|null>(null), [loading,setLoading] = useState(true), [busy,setBusy] = useState(false);
  const [draft,setDraft] = useState<HookPrompt|null>(null), [message,setMessage] = useState(''), [pending,setPending] = useState<Command|null>(null);
  const sequence=useRef(0), controller=useRef<AbortController|null>(null), writeLock=useRef(false);
  const editor=useRef<HTMLHeadingElement>(null);
  function failure(error: unknown, writing=false) {
    if(error instanceof RequestError && error.status===401){setSnapshot(null);window.location.assign('/login');return;}
    setMessage(error instanceof RequestError && error.status===403 ? 'Access is not allowed for this account.' : error instanceof RequestError && error.status===409 ? 'This entry has changed. Refresh and start again before making another change.' : writing ? 'The save response was not confirmed. Retry the same request or refresh the list. Your entry and original ID have been retained.' : 'Entries could not be loaded. Please refresh.');
  }
  async function refresh() {
    const seq=++sequence.current;controller.current?.abort();const ac=new AbortController();controller.current=ac;setLoading(true);setMessage('');setSnapshot(null);
    try {const data=parseEntries(await requestJson('/api/hooks-prompts?admin=1',{signal:ac.signal}));if(!data.admin)throw new RequestError('forbidden',403);if(seq===sequence.current)setSnapshot(data);}
    catch(e){if(seq===sequence.current&&!ac.signal.aborted)failure(e);}
    finally{if(seq===sequence.current)setLoading(false);}
  }
  useEffect(()=>{void refresh();return()=>{++sequence.current;controller.current?.abort();};},[]);
  useEffect(()=>{
    if(!draft&&!pending)return;
    const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);
  },[draft,pending]);
  useEffect(()=>{if(draft)editor.current?.focus();},[draft?.id]);
  function edit(entry:HookPrompt){setDraft({...entry});setMessage('');}
  function fresh(){edit({id:crypto.randomUUID(),title:'',kind:'hook',category:'',text:'',sortOrder:snapshot?.entries.length?Math.min(9999,Math.max(...snapshot.entries.map(e=>e.sortOrder))+10):10,published:false,revision:0});}
  async function mutate(command:Command) {
    if(writeLock.current)return;writeLock.current=true;setBusy(true);setPending(command);setMessage('');++sequence.current;controller.current?.abort();setLoading(false);
    try {
      const next=parseEntries(await requestJson('/api/hooks-prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}));
      if(!next.admin)throw new RequestError('forbidden',403);
      setSnapshot(next);setDraft(null);setPending(null);setMessage(command.action==='delete'?'Entry deleted.':'Entry saved.');
    }catch(e){failure(e,true);}finally{writeLock.current=false;setBusy(false);}
  }
  function save(){
    if(!draft)return;
    const entry={...draft,title:draft.title.trim(),category:draft.category.trim(),text:draft.text.trim()};
    if(!validEntry(entry)){setMessage('Check the title, category, text and display order.');return;}
    void mutate({action:'save',entry});
  }
  const locked=busy||!!pending||!!draft;
  return <section className={styles.page} aria-labelledby="entries-admin-title">
    <header className={styles.heading}><div><h1 id="entries-admin-title">Manage Hook &amp; Prompt</h1><p>Add opening lines and ready-to-use video prompts for RADAS users.</p></div><button className="secondary" disabled={loading||locked} onClick={()=>void refresh()}>Refresh entries</button></header>
    <p className={styles.note}>Only Published entries appear in Hook &amp; Prompt. Copying is free for signed-in users.</p>
    {snapshot?.admin && <div className={styles.actions}><button className="primary" disabled={locked||snapshot.entries.length>=500} onClick={fresh}>＋ Add entry</button><a className="secondary" href="/studio?tab=hooks-prompts" onClick={e=>{if((draft||pending)&&!window.confirm('Leave this page and discard the unsaved entry?'))e.preventDefault();}}>View collection</a><span className={styles.note}>{snapshot.entries.length} / 500 entries</span></div>}
    {message&&<p className="notice" role="status">{message}</p>}
    {pending&&<div className={styles.recovery}><p>Reference: <code>{pending.entry.id}</code></p><div className={styles.actions}><button className="secondary" disabled={busy} onClick={()=>void mutate(pending)}>Retry the same request</button><button className="secondary" disabled={busy} onClick={()=>{if(window.confirm('Discard the retained entry and reload the saved list?')){setPending(null);setDraft(null);void refresh();}}}>Refresh and start again</button></div></div>}
    {draft&&<form className={styles.editor} onSubmit={e=>{e.preventDefault();save();}}>
      <h2 tabIndex={-1} ref={editor}>{draft.revision===0?'New entry':'Edit entry'}</h2>
      <fieldset disabled={busy||!!pending}>
        <label htmlFor="entry-title">Title</label><input id="entry-title" required maxLength={240} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/>
        <label htmlFor="entry-kind">Type</label><select id="entry-kind" value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as HookPrompt['kind']})}><option value="hook">Hook</option><option value="prompt">Prompt</option></select>
        <label htmlFor="entry-category">Category (optional)</label><input id="entry-category" maxLength={120} placeholder="UGC, Storytelling, Product Demo..." value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}/>
        <label htmlFor="entry-text">Text to copy</label><textarea id="entry-text" required rows={10} maxLength={24000} value={draft.text} onChange={e=>setDraft({...draft,text:e.target.value})}/><p className={styles.note}>{[...draft.text].length.toLocaleString()} / 12,000 characters. Line breaks are preserved.</p>
        <label htmlFor="entry-order">Display order</label><input id="entry-order" type="number" required min={0} max={9999} step={1} value={Number.isFinite(draft.sortOrder)?draft.sortOrder:''} onChange={e=>setDraft({...draft,sortOrder:e.target.value===''?NaN:Number(e.target.value)})}/><p className={styles.note}>Lower numbers appear first. Matching numbers use newest creation first.</p>
        <label className={styles.check}><input type="checkbox" checked={draft.published} onChange={e=>setDraft({...draft,published:e.target.checked})}/>Published</label>
        <div className={styles.actions}><button className="primary" type="submit">{busy?'Saving…':'Save entry'}</button><button className="secondary" type="button" onClick={()=>{setDraft(null);}}>Cancel</button></div>
      </fieldset>
    </form>}
    {loading?<p role="status">Loading entries…</p>:snapshot?.admin&&<div className={styles.adminList}>{snapshot.entries.length===0?<div className={styles.empty}>No entries saved yet. Add your first entry above.</div>:snapshot.entries.map(entry=><article key={entry.id} className={styles.adminCard}>
      <div><span className={styles.status}>{entry.published?'Published':'Draft'} · Order {entry.sortOrder}</span><h2>{entry.title}</h2><p className={styles.note}>{entry.kind==='hook'?'Hook':'Prompt'}{entry.category?' · '+entry.category:''}</p><p className={styles.preview}>{entry.text}</p></div>
      <div className={styles.actions}><button className="secondary" disabled={locked} onClick={()=>edit(entry)} aria-label={`Edit ${entry.title}`}>Edit</button><button className="secondary" disabled={locked} onClick={()=>{if(window.confirm(`Delete “${entry.title}”?`))void mutate({action:'delete',entry});}} aria-label={`Delete ${entry.title}`}>Delete</button></div>
    </article>)}</div>}
  </section>;
}
