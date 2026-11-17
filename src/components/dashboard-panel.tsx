'use client';
import { useEffect, useState } from 'react';
import { parseExamples, type ExamplesSnapshot, type VideoExample } from '@/lib/video-examples/types';
import { requestJson, RequestError } from '@/lib/errors/client';
import styles from './video-examples.module.css';
export function ExamplePlayer({ example, playing, onPlay, onStop }: { example: VideoExample; playing: boolean; onPlay:()=>void; onStop:()=>void }) {
  const [thumbnailFailed,setThumbnailFailed] = useState(false);
  return <div>
    <div className={styles.frame}>
      {playing ? <iframe title={`${example.title} — YouTube video`} src={`https://www.youtube-nocookie.com/embed/${example.videoId}?autoplay=1&playsinline=1&rel=0`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/> :
        <button type="button" className={styles.poster} onClick={onPlay} aria-label={`Play ${example.title}`}>
          {!thumbnailFailed && <img src={`https://i.ytimg.com/vi/${example.videoId}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setThumbnailFailed(true)}/>}
          <span className={styles.play} aria-hidden="true">▶</span><span className={styles.posterTitle}>{example.title}</span>
        </button>}
    </div>
    {playing && <div className={styles.playerActions}><button type="button" onClick={onStop}>Close video</button><a href={`https://www.youtube.com/watch?v=${example.videoId}`} target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a></div>}
  </div>;
}
export function DashboardPanel() {
  const [snapshot,setSnapshot] = useState<ExamplesSnapshot|null>(null), [loading,setLoading] = useState(true), [message,setMessage] = useState('');
  const [playing,setPlaying] = useState<string|null>(null), [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setMessage('');setSnapshot(null);setPlaying(null);
    requestJson('/api/video-examples',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setSnapshot(parseExamples(data));}).catch(e=>{
      if(controller.signal.aborted)return;
      if(e instanceof RequestError && e.status===401)window.location.assign('/login');
      else setMessage('Video ideas could not be loaded. Please try again.');
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[attempt]);
  return <section className={styles.page} aria-labelledby="dashboard-title">
    <header className={styles.heading}><div><p className={styles.hello}>Hi <span aria-hidden="true">👋</span></p><h1 id="dashboard-title">What will you create today?</h1><p>Explore video ideas you can create with RADAS.</p></div><button className="secondary" disabled={loading} onClick={()=>setAttempt(n=>n+1)}>Refresh ideas</button></header>
    {snapshot?.admin && <a className={styles.adminLink} href="/admin/video-examples">Manage Video Examples →</a>}
    {loading ? <p role="status">Loading video ideas…</p> : message ? <p className="notice" role="alert">{message}</p> : snapshot?.examples.length === 0 ? <div className={styles.empty}><h2>Video ideas are on the way</h2><p>You can start creating your own video now.</p></div> : <div className={styles.grid}>{snapshot?.examples.map(example=><article key={example.id} className={styles.card}>
      <ExamplePlayer example={example} playing={playing===example.id} onPlay={()=>setPlaying(example.id)} onStop={()=>setPlaying(null)}/>
      <div className={styles.caption}><h2>{example.title}</h2>{example.description && <p>{example.description}</p>}</div>
    </article>)}</div>}
    <div className={styles.cta}><p>Ready to bring your idea to life?</p><a className="primary" href="/studio"><span aria-hidden="true">▣ </span>Create Video</a><small>Examples are for inspiration. Results depend on your prompt and reference images.</small></div>
  </section>;
}
