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
    {stop ? <p>Masalah masih berulang. Hentikan percubaan dan hubungi sokongan dengan rujukan <code>{generation.id}</code> untuk semakan lanjut.</p>
      : repeated ? <>
        <p>Sila cuba langkah berikut sebelum mencuba lagi:</p>
        <ol>
          <li>Pastikan sambungan internet stabil.</li>
          {usesImages && <li>Kecilkan gambar kepada sekitar <strong>500 KB atau kurang</strong>, atau gunakan gambar lain.</li>}
          <li>{generation.releasedAt ? 'Semak prompt dan tetapan, kemudian tekan Generate Video sekali sahaja.' : 'Tunggu sehingga butang Generate dibuka semula, kemudian cuba sekali lagi.'}</li>
        </ol>
      </> : null}
    <p role="status">{generation.releasedAt
      ? (stop ? 'Semakan selesai. Sila hubungi sokongan sebelum mencuba lagi.' : 'Anda boleh cuba generate semula.')
      : 'Tunggu kira-kira 2 minit. Butang Generate akan dibuka semula secara automatik selepas semakan sistem.'}</p>
    {!generation.releasedAt && <>
      <p className="generation-wait-time">{seconds !== null && seconds > 0
        ? <>Masa menunggu: <span role="timer" aria-live="off">{formatWait(seconds)}</span></>
        : <span>Sedang menyemak…</span>}</p>
      <p>Pastikan internet stabil dan biarkan halaman ini terbuka. Tidak perlu refresh atau tekan Generate berulang kali.</p>
    </>}
    {!repeated && usesImages && <p>Jika masalah berulang, cuba kecilkan gambar kepada sekitar <strong>500 KB atau kurang</strong>, kemudian cuba lagi.</p>}
    {repeated && !stop && <p>Jika masih gagal selepas langkah ini, hentikan percubaan dan hubungi sokongan dengan rujukan request.</p>}
  </div>;
}
