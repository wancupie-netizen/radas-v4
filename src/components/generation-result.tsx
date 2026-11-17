'use client';
import './generation-result.css';
import { GenerationWait } from './generation-wait';
import { useEffect, useState } from 'react';
import { canGenerateAgain, type Generation } from '@/lib/generations/types';
export function GenerationResult({ generation, onAgain, againLabel = 'Generate Again', consecutiveUnknown = 1, usesImages = true }: { generation: Generation; onAgain: () => void; againLabel?: string; consecutiveUnknown?: number; usesImages?: boolean }) {
  const [url, setUrl] = useState(''); const [playable, setPlayable] = useState(false); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0); const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (generation.status !== 'done') return;
    const remaining = Date.parse(generation.expiresAt) - Date.now();
    if (remaining <= 0) { setExpired(true); return; }
    const timer = setTimeout(() => setExpired(true), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [generation.id, generation.status, generation.expiresAt]);
  useEffect(() => {
    if (generation.status !== 'done' || (generation.videoState !== undefined && generation.videoState !== 'ready')) return;
    const controller = new AbortController(); let objectUrl = ''; let mounted = true; let expiredNow = false;
    setError(''); setUrl(''); setPlayable(false); setExpired(false);
    function expire() {
      expiredNow = true; controller.abort();
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
      if (mounted) { setUrl(''); setExpired(true); setError("This video has expired and is no longer available to download."); }
    }
    const remaining = Date.parse(generation.expiresAt) - Date.now();
    if (remaining <= 0) { expire(); return () => { mounted = false; }; }
    const timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
    const checkExpiry = () => { if (Date.now() >= Date.parse(generation.expiresAt)) expire(); };
    document.addEventListener('visibilitychange', checkExpiry);
    void (async () => {
      const downloadTimer = setTimeout(() => controller.abort(), 150_000);
      try {
        const response = await fetch(`/api/generations/${generation.id}/video`, { cache: 'no-store', signal: controller.signal });
        if (response.status === 401) { window.location.assign('/login'); return; }
        if (response.status === 410) { expire(); return; }
        if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'video/mp4') throw new Error('video_unavailable');
        const blob = await response.blob(); if (!mounted || expiredNow) return;
        if (Date.now() >= Date.parse(generation.expiresAt)) { expire(); return; }
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      } catch { if (mounted && !expiredNow) setError("The video could not be loaded. Please try again."); }
      finally { clearTimeout(downloadTimer); }
    })();
    return () => { mounted = false; clearTimeout(timer); document.removeEventListener('visibilitychange', checkExpiry); controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [generation.id, generation.status, generation.expiresAt, generation.videoState, attempt]);
  const labels = { reserved: 'Preparing…', submitting: 'Preparing…', queued: 'Preparing…', processing: 'Generating…', done: url && playable ? 'Video ready' : generation.videoState === 'needs_review' ? 'Video needs support' : 'Finalizing video…', failed: "Generation failed", rejected: "Request rejected", unknown: consecutiveUnknown >= 2 ? "Your video request still has not been confirmed." : "Your video request has not yet been confirmed." };
  const unavailable = expired || generation.videoState === 'expired';
  const working = !unavailable && !generation.slotReleasedAt && (['reserved', 'submitting', 'queued', 'processing'].includes(generation.status) || (generation.status === 'done' && !playable && generation.videoState !== 'needs_review' && !error));
  const final = canGenerateAgain(generation);
  return <div className="generation-result" aria-busy={working}>
    {working && <div className="generation-working" aria-hidden="true"><div className="generation-working-ring"><span>▷</span></div></div>}
    <h3 aria-live="polite">{generation.slotReleasedAt ? "Request expired" : unavailable ? "Video expired" : labels[generation.status]}</h3>
    {working && <div className="generation-working-track" aria-hidden="true"><span /></div>}
    {generation.status === 'done' && (unavailable ? <p>This video has expired and is no longer available to download.</p> : url ? <>
      <video controls playsInline src={url} onLoadedData={() => setPlayable(true)} onError={() => { setPlayable(false); setError("The video could not be played. Please reload it."); }} aria-label="Generated video preview" />
      <a className="primary download-video" href={url} download={`radas-${generation.id}.mp4`}>Download Video</a>
    </> : <p role={error ? 'status' : undefined}>{error || (generation.videoState === 'needs_review' ? 'Your video could not be saved. Contact support with reference ' + generation.id + '. Do not generate it again to recover this request.' : 'Finalizing…')}</p>)}
    {error && url && !unavailable && <p role="status">{error}</p>}
    {error && !unavailable ? <button type="button" className="secondary" onClick={() => setAttempt(previous => previous + 1)}>Reload video</button> : null}
    {generation.slotReleasedAt && <p>This request has expired. You can start a new generation. Any credit adjustment requires support review. Reference: <code>{generation.id}</code>.</p>}
    {generation.refunded && generation.status !== 'unknown' && <p>1 credit has been refunded.</p>}
    {['failed', 'rejected'].includes(generation.status) && !generation.refunded && <p>The credit refund has not been confirmed. Check your balance or contact support with reference <code>{generation.id}</code>.</p>}
    {generation.status === 'unknown' && <GenerationWait generation={generation} consecutiveUnknown={consecutiveUnknown} usesImages={usesImages} />}
    {final && <button type="button" className="secondary" onClick={onAgain}>{generation.status === 'unknown' ? (consecutiveUnknown >= 3 ? "Back to settings" : "Try a new generation") : againLabel}</button>}
  </div>;
}
