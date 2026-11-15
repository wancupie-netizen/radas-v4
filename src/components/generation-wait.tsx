'use client';
import { useEffect, useState } from 'react';
import type { Generation } from '@/lib/generations/types';
import { formatWait, waitSeconds } from '@/lib/generations/guidance';

export function GenerationWait({ generation, consecutiveUnknown, usesImages }: {
  generation: Generation; consecutiveUnknown: number; usesImages: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (generation.releasedAt || !generation.releaseAfter) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [generation.releasedAt, generation.releaseAfter]);

  const seconds = waitSeconds(generation.releaseAfter, now);
  const repeated = consecutiveUnknown >= 2;
  const stop = consecutiveUnknown >= 3;
  return <div className="generation-wait">
    {stop ? <p>The problem is recurring. Stop trying and contact support with reference <code>{generation.id}</code> for further review.</p>
      : repeated ? <>
        <p>Please follow these steps before trying again:</p>
        <ol>
          <li>Make sure your internet connection is stable.</li>
          {usesImages && <li>Reduce the image size to around <strong>500 KB or less</strong>, or use another image.</li>}
          <li>{generation.releasedAt ? "Check your prompt and settings, then press Generate Video only once." : "Wait until the Generate button becomes available, then try again."}</li>
        </ol>
      </> : null}
    <p role="status">{generation.releasedAt
      ? (stop ? "The check is complete. Please contact support before trying again." : "You can try generating a video again.")
      : "Wait about 2 minutes. The Generate button will become available automatically after the system check."}</p>
    {!generation.releasedAt && <>
      <p className="generation-wait-time">{seconds !== null && seconds > 0
        ? <>Time remaining: <span role="timer" aria-live="off">{formatWait(seconds)}</span></>
        : <span>Checking…</span>}</p>
      <p>Keep your internet connection stable and leave this page open. You do not need to refresh or press Generate repeatedly.</p>
    </>}
    {!repeated && usesImages && <p>If the problem recurs, try reducing the image size to around <strong>500 KB or less</strong>, then try again.</p>}
    {repeated && !stop && <p>If it still fails after these steps, stop trying and contact support with the request reference.</p>}
  </div>;
}
