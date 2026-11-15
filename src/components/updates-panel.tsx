'use client';
import { useEffect, useRef, useState } from 'react';
import { parseUpdates, SUPPORT_URL, type UpdateEntry, type UpdateInput, type UpdatesSnapshot } from '@/lib/updates/types';
import { requestJson, RequestError } from '@/lib/errors/client';
import styles from './updates-panel.module.css';
const date = (value: string) => new Date(value).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const input = (u: UpdateEntry): UpdateInput => ({id:u.id,title:u.title,body:u.body,published:u.published,revision:u.revision});
export function UpdatesPanel({admin=false}: {admin?: boolean}) {
 const [snapshot,setSnapshot] = useState<UpdatesSnapshot|null>(null);
 const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false);
 const [message,setMessage] = useState('');
 const [draft,setDraft] = useState<UpdateInput|null>(null);
 const [pending,setPending] = useState<{action:'save'|'delete';update:UpdateInput}|null>(null);
 const sequence = useRef(0), controller = useRef<AbortController|null>(null), writeLock = useRef(false);
 const endpoint = '/api/updates'+(admin?'?admin=1':'');
 function failure(e: unknown, writing=false) {
  if (e instanceof RequestError && e.status===401) { setSnapshot(null); window.location.assign('/login'); return; }
  setMessage(e instanceof RequestError && e.status===403 ? "Access is not allowed for this account." : e instanceof RequestError && e.status===409 ? "This update has changed. Refresh the list before editing it again." : writing ? "The response has not yet been confirmed. Check the list or retry the same request; the original reference has been retained." : "Updates could not be loaded. Please refresh.");
 }
 async function refresh() {
  const seq=++sequence.current; controller.current?.abort(); const ac=new AbortController();controller.current=ac;
  setLoading(true);setSnapshot(null);setMessage('');
  try { const next=parseUpdates(await requestJson(endpoint,{signal:ac.signal}));if(seq===sequence.current)setSnapshot(next); }
  catch(e) { if(seq===sequence.current&&!ac.signal.aborted)failure(e); }
  finally {if(seq===sequence.current)setLoading(false);}
 }
 useEffect(()=>{void refresh();return()=>{++sequence.current;controller.current?.abort();};},[admin]); // Page mode is the only request dependency.
 async function mutate(command: {action:'save'|'delete';update:UpdateInput}) {
  if(writeLock.current)return;writeLock.current=true;setBusy(true);setMessage('');setPending(command);
  ++sequence.current;controller.current?.abort();setLoading(false);
  try {
   const next=parseUpdates(await requestJson('/api/updates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}));
   if(!next.admin)throw new RequestError();setSnapshot(next);setDraft(null);setPending(null);setMessage(command.action==='delete'?"Update deleted.":"Update saved.");
  } catch(e) {failure(e,true);}
  finally {writeLock.current=false;setBusy(false);}
 }
 function fresh() {setDraft({id:crypto.randomUUID(),title:'',body:'',published:false,revision:0});setMessage('');}
 return <div className={styles.page}>
  <header className={styles.heading}><div><span className="eyebrow">RADAS COMMUNITY</span><h1>{admin?"Manage Updates":'Updates & Support'}<span>.</span></h1><p>Platform news and support in one place.</p></div><button className="secondary" disabled={loading||busy} onClick={()=>void refresh()}>{loading?"Loading…":"Refresh updates"}</button></header>
  <section className={styles.support} aria-labelledby="support-heading"><div><span className="eyebrow">SUPPORT</span><h2 id="support-heading">Need help?</h2><p>Join RADAS Malaysia on Telegram. For payment or video queries, include your order or generation reference.</p><p className={styles.note}>Do not share your password or API key.</p></div><a className="primary" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">Open Telegram ↗</a></section>
  {snapshot?.admin&&!admin&&<a className={styles.adminLink} href="/admin/updates">Manage updates as admin →</a>}
  <section aria-labelledby="updates-heading"><div className={styles.sectionTitle}><h2 id="updates-heading">{admin?"Update list":"Latest updates"}</h2>{admin&&snapshot?.admin&&<button className="primary" disabled={busy||!!pending} onClick={fresh}>＋ Add update</button>}</div>
   {message&&<p className="notice" role="status">{message}</p>}
   {pending&&<div className={styles.recovery}><p>Reference: <code>{pending.update.id}</code></p><button className="secondary" disabled={busy} onClick={()=>void mutate(pending)}>Retry the same request</button><button className="secondary" disabled={busy||loading} onClick={()=>{setPending(null);setDraft(null);setMessage("Refresh the list before making further changes.");void refresh();}}>Refresh and start again</button></div>}
   {admin&&draft&&<form className={styles.editor} onSubmit={e=>{e.preventDefault();void mutate({action:'save',update:{...draft,title:draft.title.trim(),body:draft.body.trim()}});}}>
    <h3>{draft.revision===0?"New update":"Edit update"}</h3><fieldset disabled={busy||!!pending}><label htmlFor="update-title">Title</label><input id="update-title" required maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/><label htmlFor="update-body">Description</label><textarea id="update-body" required rows={8} maxLength={5000} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/><label className={styles.check}><input type="checkbox" checked={draft.published} onChange={e=>setDraft({...draft,published:e.target.checked})}/>Publish to users</label><p className={styles.note}>Plain text. Only admins can read drafts.</p><div className={styles.actions}><button className="primary" type="submit">{busy?"Saving…":"Save update"}</button><button className="secondary" type="button" onClick={()=>setDraft(null)}>Cancel</button></div></fieldset>
   </form>}
   {loading?<p role="status">Loading updates…</p>:snapshot? snapshot.updates.length===0?<div className={styles.empty}>No updates yet {admin?"saved":"published"}.</div>:<div className={styles.list}>{snapshot.updates.map(u=><article key={u.id} className={styles.card}><div className={styles.meta}><time dateTime={u.publishedAt??u.updatedAt}>{date(u.publishedAt??u.updatedAt)} MYT</time>{admin&&<span className={u.published?styles.published:styles.draft}>{u.published?'Published':'Draft'}</span>}</div><h3>{u.title}</h3><p className={styles.body}>{u.body}</p>{admin&&<div className={styles.actions}><button className="secondary" disabled={busy||!!pending} onClick={()=>{setDraft(input(u));setMessage('');}}>Edit</button><button className="secondary" disabled={busy||!!pending} onClick={()=>{if(window.confirm("Delete this update?"))void mutate({action:'delete',update:input(u)});}}>Delete</button></div>}</article>)}</div>:null}
  </section>
 </div>;
}
