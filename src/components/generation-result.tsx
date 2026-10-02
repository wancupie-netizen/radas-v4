'use client';
import { useEffect, useState } from 'react';
import type { Generation } from '@/lib/generations/types';
export function GenerationResult({ generation, onAgain, againLabel = 'Generate Again' }: { generation: Generation; onAgain: () => void; againLabel?: string }) {
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
  const labels = { reserved: 'Preparing…', submitting: 'Preparing…', queued: 'Preparing…', processing: 'Generating…', done: 'Video siap', failed: 'Generation gagal', rejected: 'Request tidak diterima', unknown: 'Status request belum dapat dipastikan' };
  const final = ['done', 'failed', 'rejected'].includes(generation.status);
  return <div className="generation-result">
    <h3 aria-live="polite">{expired ? 'Video telah luput' : labels[generation.status]}</h3>
    {generation.status === 'done' && (url ? <>
      <video controls playsInline src={url} aria-label="Generated video preview" />
      <a className="primary download-video" href={url} download={`radas-${generation.id}.mp4`}>Download Video</a>
    </> : <p role={error ? 'status' : undefined}>{error || 'Finalizing…'}</p>)}
    {error && !expired ? <button type="button" className="secondary" onClick={() => setAttempt(previous => previous + 1)}>Muatkan video semula</button> : null}
    {generation.refunded && <p>1 credit telah dipulangkan.</p>}
    {generation.status === 'unknown' && <p>Jangan submit semula. Hubungi sokongan dengan rujukan <code>{generation.id}</code> untuk semakan.</p>}
    {final && <button type="button" className="secondary" onClick={onAgain}>{againLabel}</button>}
  </div>;
}
