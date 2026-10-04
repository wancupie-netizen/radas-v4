'use client';
import { useEffect, useRef, useState } from 'react';
import { parseUpdates, SUPPORT_URL, type UpdateEntry, type UpdateInput, type UpdatesSnapshot } from '@/lib/updates/types';
import { requestJson, RequestError } from '@/lib/errors/client';
import styles from './updates-panel.module.css';
const date = (value: string) => new Date(value).toLocaleString('ms-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
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
  setMessage(e instanceof RequestError && e.status===403 ? 'Akses tidak dibenarkan untuk akaun ini.' : e instanceof RequestError && e.status===409 ? 'Update telah berubah. Semak senarai terkini sebelum edit semula.' : writing ? 'Respons belum dapat dipastikan. Semak senarai atau ulang request yang sama; rujukan asal dikekalkan.' : 'Updates gagal dimuatkan. Sila semak semula.');
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
   if(!next.admin)throw new RequestError();setSnapshot(next);setDraft(null);setPending(null);setMessage(command.action==='delete'?'Update dipadam.':'Update disimpan.');
  } catch(e) {failure(e,true);}
  finally {writeLock.current=false;setBusy(false);}
 }
 function fresh() {setDraft({id:crypto.randomUUID(),title:'',body:'',published:false,revision:0});setMessage('');}
 return <div className={styles.page}>
  <header className={styles.heading}><div><span className="eyebrow">RADAS COMMUNITY</span><h1>{admin?'Urus Updates':'Updates & Support'}<span>.</span></h1><p>Perkembangan platform dan bantuan dalam satu tempat.</p></div><button className="secondary" disabled={loading||busy} onClick={()=>void refresh()}>{loading?'Memuatkan…':'Semak updates'}</button></header>
  <section className={styles.support} aria-labelledby="support-heading"><div><span className="eyebrow">SUPPORT</span><h2 id="support-heading">Perlukan bantuan?</h2><p>Sertai Telegram RADAS Malaysia. Untuk semakan bayaran atau video, sertakan rujukan pesanan atau generation.</p><p className={styles.note}>Jangan kongsi kata laluan atau API key.</p></div><a className="primary" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">Buka Telegram ↗</a></section>
  {snapshot?.admin&&!admin&&<a className={styles.adminLink} href="/admin/updates">Urus updates sebagai admin →</a>}
  <section aria-labelledby="updates-heading"><div className={styles.sectionTitle}><h2 id="updates-heading">{admin?'Senarai updates':'Updates terkini'}</h2>{admin&&snapshot?.admin&&<button className="primary" disabled={busy||!!pending} onClick={fresh}>＋ Tambah update</button>}</div>
   {message&&<p className="notice" role="status">{message}</p>}
   {pending&&<div className={styles.recovery}><p>Rujukan: <code>{pending.update.id}</code></p><button className="secondary" disabled={busy} onClick={()=>void mutate(pending)}>Ulang request yang sama</button><button className="secondary" disabled={busy||loading} onClick={()=>{setPending(null);setDraft(null);setMessage('Semak senarai terkini sebelum membuat perubahan baharu.');void refresh();}}>Semak dan mula semula</button></div>}
   {admin&&draft&&<form className={styles.editor} onSubmit={e=>{e.preventDefault();void mutate({action:'save',update:{...draft,title:draft.title.trim(),body:draft.body.trim()}});}}>
    <h3>{draft.revision===0?'Update baharu':'Edit update'}</h3><fieldset disabled={busy||!!pending}><label htmlFor="update-title">Tajuk</label><input id="update-title" required maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/><label htmlFor="update-body">Penerangan</label><textarea id="update-body" required rows={8} maxLength={5000} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/><label className={styles.check}><input type="checkbox" checked={draft.published} onChange={e=>setDraft({...draft,published:e.target.checked})}/>Publish untuk pengguna</label><p className={styles.note}>Teks biasa. Draft hanya boleh dibaca admin.</p><div className={styles.actions}><button className="primary" type="submit">{busy?'Menyimpan…':'Simpan update'}</button><button className="secondary" type="button" onClick={()=>setDraft(null)}>Batal</button></div></fieldset>
   </form>}
   {loading?<p role="status">Memuatkan updates…</p>:snapshot? snapshot.updates.length===0?<div className={styles.empty}>Belum ada update {admin?'disimpan':'diterbitkan'}.</div>:<div className={styles.list}>{snapshot.updates.map(u=><article key={u.id} className={styles.card}><div className={styles.meta}><time dateTime={u.publishedAt??u.updatedAt}>{date(u.publishedAt??u.updatedAt)} MYT</time>{admin&&<span className={u.published?styles.published:styles.draft}>{u.published?'Published':'Draft'}</span>}</div><h3>{u.title}</h3><p className={styles.body}>{u.body}</p>{admin&&<div className={styles.actions}><button className="secondary" disabled={busy||!!pending} onClick={()=>{setDraft(input(u));setMessage('');}}>Edit</button><button className="secondary" disabled={busy||!!pending} onClick={()=>{if(window.confirm('Padam update ini?'))void mutate({action:'delete',update:input(u)});}}>Padam</button></div>}</article>)}</div>:null}
  </section>
 </div>;
}
