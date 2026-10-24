'use client';
import './generation-result.css';
import { GenerationWait } from './generation-wait';
import { useEffect, useState } from 'react';
import { canGenerateAgain, type Generation } from '@/lib/generations/types';
export function GenerationResult({ generation, onAgain, againLabel = 'Generate Again', consecutiveUnknown = 1, usesImages = true }: { generation: Generation; onAgain: () => void; againLabel?: string; consecutiveUnknown?: number; usesImages?: boolean }) {
  const [url, setUrl] = useState(''); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0); const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (generation.status !== 'done') return;
    const controller = new AbortController(); let objectUrl = ''; let mounted = true; let expiredNow = false;
    setError(''); setUrl(''); setExpired(false);
    function expire() {
      expiredNow = true; controller.abort();
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
      if (mounted) { setUrl(''); setExpired(true); setError('Video telah luput. Download tidak lagi tersedia.'); }
    }
    const remaining = Date.parse(generation.expiresAt) - Date.now();
    if (remaining <= 0) { expire(); return () => { mounted = false; }; }
    const timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
    const checkExpiry = () => { if (Date.now() >= Date.parse(generation.expiresAt)) expire(); };
    document.addEventListener('visibilitychange', checkExpiry);
    void (async () => {
      try {
        const response = await fetch(`/api/generations/${generation.id}/video`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(150_000)]) });
        if (response.status === 401) { window.location.assign('/login'); return; }
        if (response.status === 410) { expire(); return; }
        if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'video/mp4') throw new Error('video_unavailable');
        const blob = await response.blob(); if (!mounted || expiredNow) return;
        if (Date.now() >= Date.parse(generation.expiresAt)) { expire(); return; }
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      } catch { if (mounted && !expiredNow) setError('Video belum dapat dimuatkan. Cuba semula.'); }
    })();
    return () => { mounted = false; clearTimeout(timer); document.removeEventListener('visibilitychange', checkExpiry); controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [generation.id, generation.status, generation.expiresAt, attempt]);
  const labels = { reserved: 'Preparing…', submitting: 'Preparing…', queued: 'Preparing…', processing: 'Generating…', done: 'Video siap', failed: 'Generation gagal', rejected: 'Request tidak diterima', unknown: consecutiveUnknown >= 2 ? 'Permintaan video masih belum dapat disahkan.' : 'Permintaan video belum dapat disahkan.' };
  const working = ['reserved', 'submitting', 'queued', 'processing'].includes(generation.status);
  const final = canGenerateAgain(generation);
  return <div className="generation-result" aria-busy={working}>
    {working && <div className="generation-working" aria-hidden="true"><div className="generation-working-ring"><span>▷</span></div></div>}
    <h3 aria-live="polite">{expired ? 'Video telah luput' : labels[generation.status]}</h3>
    {working && <div className="generation-working-track" aria-hidden="true"><span /></div>}
    {generation.status === 'done' && (url ? <>
      <video controls playsInline src={url} aria-label="Generated video preview" />
      <a className="primary download-video" href={url} download={`radas-${generation.id}.mp4`}>Download Video</a>
    </> : <p role={error ? 'status' : undefined}>{error || 'Finalizing…'}</p>)}
    {error && !expired ? <button type="button" className="secondary" onClick={() => setAttempt(previous => previous + 1)}>Muatkan video semula</button> : null}
    {generation.refunded && generation.status !== 'unknown' && <p>1 credit telah dipulangkan.</p>}
    {['failed', 'rejected'].includes(generation.status) && !generation.refunded && <p>Pemulangan credit belum disahkan. Semak baki atau hubungi sokongan dengan rujukan <code>{generation.id}</code>.</p>}
    {generation.status === 'unknown' && <GenerationWait generation={generation} consecutiveUnknown={consecutiveUnknown} usesImages={usesImages} />}
    {final && <button type="button" className="secondary" onClick={onAgain}>{generation.status === 'unknown' ? (consecutiveUnknown >= 3 ? 'Kembali ke tetapan' : 'Cuba generation baharu') : againLabel}</button>}
  </div>;
}
