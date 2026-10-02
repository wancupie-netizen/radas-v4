'use client';
import { useEffect, useState } from 'react';
import type { Generation } from '@/lib/generations/types';
export function GenerationResult({ generation, onAgain }: { generation: Generation; onAgain: () => void }) {
  const [url, setUrl] = useState(''); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (generation.status !== 'done') return;
    const controller = new AbortController(); let objectUrl = ''; let mounted = true;
    setError(''); setUrl('');
    void (async () => {
      try {
        const response = await fetch(`/api/generations/${generation.id}/video`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(150_000)]) });
        if (!response.ok) throw new Error('video_unavailable');
        const blob = await response.blob(); if (!mounted) return;
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      } catch { if (mounted) setError('Video belum dapat dimuatkan. Cuba semula.'); }
    })();
    return () => { mounted = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [generation.id, generation.status, attempt]);
  const labels = { submitting: 'Preparing…', queued: 'Preparing…', processing: 'Generating…', done: 'Video siap', failed: 'Generation gagal', rejected: 'Request tidak diterima', unknown: 'Status request belum dapat dipastikan' };
  const final = ['done', 'failed', 'rejected'].includes(generation.status);
  return <div className="generation-result">
    <h3 aria-live="polite">{labels[generation.status]}</h3>
    {generation.status === 'done' && (url ? <>
      <video controls playsInline src={url} aria-label="Generated video preview" />
      <a className="primary download-video" href={url} download={`radas-${generation.id}.mp4`}>Download Video</a>
    </> : <p>{error || 'Finalizing…'}</p>)}
    {error && <button type="button" className="secondary" onClick={() => setAttempt(previous => previous + 1)}>Muatkan video semula</button>}
    {generation.refunded && <p>1 credit telah dipulangkan.</p>}
    {generation.status === 'unknown' && <p>Jangan submit semula. Hubungi sokongan dengan rujukan <code>{generation.id}</code> untuk semakan.</p>}
    {final && <button type="button" className="secondary" onClick={onAgain}>Generate Again</button>}
  </div>;
}
