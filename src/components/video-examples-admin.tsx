'use client';
import { useEffect, useRef, useState } from 'react';
import { parseExamples, validExample, youtubeVideoId, type VideoExample, type ExamplesSnapshot } from '@/lib/video-examples/types';
import { requestJson, RequestError } from '@/lib/errors/client';
import styles from './video-examples.module.css';
type Command = { action:'save'|'delete'; example:VideoExample };
export function VideoExamplesAdmin() {
  const [snapshot,setSnapshot] = useState<ExamplesSnapshot|null>(null), [loading,setLoading] = useState(true), [busy,setBusy] = useState(false);
  const [draft,setDraft] = useState<VideoExample|null>(null), [url,setUrl] = useState(''), [message,setMessage] = useState(''), [pending,setPending] = useState<Command|null>(null);
  const sequence=useRef(0), controller=useRef<AbortController|null>(null), writeLock=useRef(false);
  const editor=useRef<HTMLHeadingElement>(null);
  function failure(error: unknown, writing=false) {
    if(error instanceof RequestError && error.status===401){setSnapshot(null);window.location.assign('/login');return;}
    setMessage(error instanceof RequestError && error.status===403 ? 'Access is not allowed for this account.' : error instanceof RequestError && error.status===409 ? 'This example has changed. Refresh and start again before making another change.' : writing ? 'The save response was not confirmed. Retry the same request or refresh the list. Your entry and original ID have been retained.' : 'Video examples could not be loaded. Please refresh.');
  }
  async function refresh() {
    const seq=++sequence.current;controller.current?.abort();const ac=new AbortController();controller.current=ac;setLoading(true);setMessage('');setSnapshot(null);
    try {const data=parseExamples(await requestJson('/api/video-examples?admin=1',{signal:ac.signal}));if(!data.admin)throw new RequestError('forbidden',403);if(seq===sequence.current)setSnapshot(data);}
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
  function edit(example:VideoExample){setDraft({...example});setUrl(example.videoId?`https://www.youtube.com/watch?v=${example.videoId}`:'');setMessage('');}
  function fresh(){edit({id:crypto.randomUUID(),title:'',description:'',videoId:'',sortOrder:snapshot?.examples.length?Math.min(9999,Math.max(...snapshot.examples.map(e=>e.sortOrder))+10):10,published:false,revision:0});}
  async function mutate(command:Command) {
    if(writeLock.current)return;writeLock.current=true;setBusy(true);setPending(command);setMessage('');++sequence.current;controller.current?.abort();setLoading(false);
    try {
      const next=parseExamples(await requestJson('/api/video-examples',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}));
      if(!next.admin)throw new RequestError('forbidden',403);
      setSnapshot(next);setDraft(null);setUrl('');setPending(null);setMessage(command.action==='delete'?'Video example deleted.':'Video example saved.');
    }catch(e){failure(e,true);}finally{writeLock.current=false;setBusy(false);}
  }
  function save(){
    if(!draft)return;
    const link=url.trim(),id=link?youtubeVideoId(link):'';
    if(id===null){setMessage('Enter a valid HTTPS YouTube watch, Shorts or youtu.be link.');return;}
    const example={...draft,title:draft.title.trim(),description:draft.description.trim(),videoId:id};
    if(!validExample(example)){setMessage('Check the title, YouTube link and display order. Published examples need a video link.');return;}
    void mutate({action:'save',example});
  }
  const locked=busy||!!pending||!!draft;
  return <section className={styles.page} aria-labelledby="examples-admin-title">
    <header className={styles.heading}><div><h1 id="examples-admin-title">Manage Video Examples</h1><p>Add YouTube examples to inspire RADAS users.</p></div><button className="secondary" disabled={loading||locked} onClick={()=>void refresh()}>Refresh examples</button></header>
    <p className={styles.note}>Use your own portrait 9:16 videos. Enable embedding on YouTube; Public or Unlisted videos can be used. Only Published examples appear on the Dashboard.</p>
    {snapshot?.admin && <div className={styles.actions}><button className="primary" disabled={locked||snapshot.examples.length>=100} onClick={fresh}>＋ Add video example</button><a className="secondary" href="/studio?tab=dashboard" onClick={e=>{if((draft||pending)&&!window.confirm('Leave this page and discard the unsaved entry?'))e.preventDefault();}}>View Dashboard →</a><span className={styles.note}>{snapshot.examples.length} / 100 examples</span></div>}
    {message&&<p className="notice" role="status">{message}</p>}
    {pending&&<div className={styles.recovery}><p>Reference: <code>{pending.example.id}</code></p><div className={styles.actions}><button className="secondary" disabled={busy} onClick={()=>void mutate(pending)}>Retry the same request</button><button className="secondary" disabled={busy} onClick={()=>{if(window.confirm('Discard the retained entry and reload the saved list?')){setPending(null);setDraft(null);setUrl('');void refresh();}}}>Refresh and start again</button></div></div>}
    {draft&&<form className={styles.editor} onSubmit={e=>{e.preventDefault();save();}}>
      <h2 tabIndex={-1} ref={editor}>{draft.revision===0?'New video example':'Edit video example'}</h2>
      <fieldset disabled={busy||!!pending}>
        <label htmlFor="example-title">Title</label><input id="example-title" required maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/>
        <label htmlFor="example-url">YouTube link</label><input id="example-url" type="url" maxLength={2048} placeholder="https://www.youtube.com/shorts/..." value={url} onChange={e=>setUrl(e.target.value)}/><p className={styles.note}>Paste a watch, Shorts or youtu.be link. Do not paste iframe code. A link is required to publish.</p>
        <label htmlFor="example-description">Short description</label><textarea id="example-description" rows={3} maxLength={240} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/>
        <label htmlFor="example-order">Display order</label><input id="example-order" type="number" required min={0} max={9999} step={1} value={Number.isFinite(draft.sortOrder)?draft.sortOrder:''} onChange={e=>setDraft({...draft,sortOrder:e.target.value===''?NaN:Number(e.target.value)})}/><p className={styles.note}>Lower numbers appear first. Matching numbers use newest creation first.</p>
        <label className={styles.check}><input type="checkbox" checked={draft.published} onChange={e=>setDraft({...draft,published:e.target.checked})}/>Published</label>
        <div className={styles.actions}><button className="primary" type="submit">{busy?'Saving…':'Save example'}</button><button className="secondary" type="button" onClick={()=>{setDraft(null);setUrl('');}}>Cancel</button></div>
      </fieldset>
    </form>}
    {loading?<p role="status">Loading video examples…</p>:snapshot?.admin&&<div className={styles.adminList}>{snapshot.examples.length===0?<div className={styles.empty}>No video examples saved yet. Add your first example above.</div>:snapshot.examples.map(example=><article key={example.id} className={styles.adminCard}>
      <div><span className={styles.status}>{example.published?'Published':'Draft'} · Order {example.sortOrder}</span><h2>{example.title}</h2>{example.description&&<p>{example.description}</p>}{example.videoId&&<a href={`https://www.youtube.com/watch?v=${example.videoId}`} target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>}</div>
      <div className={styles.actions}><button className="secondary" disabled={locked} onClick={()=>edit(example)} aria-label={`Edit ${example.title}`}>Edit</button><button className="secondary" disabled={locked} onClick={()=>{if(window.confirm(`Delete “${example.title}”?`))void mutate({action:'delete',example});}} aria-label={`Delete ${example.title}`}>Delete</button></div>
    </article>)}</div>}
  </section>;
}
