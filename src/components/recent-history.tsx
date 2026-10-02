'use client';
import { RECENT_LIMIT, type RecentVideo } from '@/lib/history/recent';
export function RecentHistory({ items, selectedId, onSelect }: { items: RecentVideo[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <section className="recent-history panel" aria-labelledby="recent-history-title">
    <div className="panel-heading"><span className="step">03</span><h2 id="recent-history-title">Recent History</h2><span className="recent-count" aria-live="polite">{items.length} video</span></div>
    <p className="recent-note">{RECENT_LIMIT} video siap terakhir dalam sesi ini. Download sebelum luput; senarai kosong selepas refresh atau logout.</p>
    {items.length === 0 ? <div className="recent-empty"><span aria-hidden="true">▷</span><p>Belum ada video siap dalam sesi ini.</p></div> :
      <ul className="recent-list">{items.map(item => <li className={`recent-item${selectedId === item.id ? ' selected' : ''}`} key={item.id}>
        <div className={`recent-icon ${item.orientation}`} aria-hidden="true">▷</div>
        <div className="recent-info"><p className="recent-prompt">{item.prompt}</p>
          <p className="recent-specs">{item.mode === 'image' ? 'Image to Video' : 'Text to Video'} · {item.orientation === 'portrait' ? '9:16' : '16:9'} · {item.resolution}p</p>
          <p className="recent-time">Siap {new Date(item.completedAt).toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' })} · Luput {new Date(item.generation.expiresAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <button type="button" className="secondary" aria-pressed={selectedId === item.id} aria-label={`Preview dan download: ${item.prompt.slice(0, 80)}`} onClick={() => onSelect(item.id)}>Preview &amp; download</button>
      </li>)}</ul>}
  </section>;
}
