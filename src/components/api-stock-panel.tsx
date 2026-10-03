'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson, RequestError } from '@/lib/errors/client';
import { parseStockSummary, type StockSummary } from '@/lib/api-stock/summary';
import styles from './api-stock-panel.module.css';
const labels = { sufficient: 'Cukup', buffer_low: 'Buffer rendah', insufficient: 'Tidak cukup' };
const number = (value: number) => value.toLocaleString('en-MY', { maximumFractionDigits: 2 });
export function ApiStockPanel({ revision }: { revision: number }) {
 const [summary, setSummary] = useState<StockSummary | null>(null);
 const [loading, setLoading] = useState(false), [failed, setFailed] = useState(false);
 const sequence = useRef(0), controller = useRef<AbortController | null>(null);
 const load = useCallback(async () => {
  const current = ++sequence.current;
  controller.current?.abort();
  const abort = new AbortController(); controller.current = abort;
  // Hide the old green status while checking and on failure; never invent a zero balance.
  setSummary(null); setLoading(true); setFailed(false);
  try {
   const data = await requestJson('/api/admin/api-stock', { signal: abort.signal }, 25_000);
   const next = parseStockSummary(data);
   if (current === sequence.current) setSummary(next);
  } catch (error) {
   if (current === sequence.current) {
    setSummary(null); setFailed(true);
    if (error instanceof RequestError && error.status === 401) window.location.assign('/login');
   }
  } finally { if (current === sequence.current) setLoading(false); }
 }, []);
 useEffect(() => {
  void load();
  return () => { sequence.current += 1; controller.current?.abort(); };
 }, [load, revision]);
 return <section className={styles.panel} aria-labelledby="api-stock-heading" aria-busy={loading}>
  <div className={styles.header}><div><p className={styles.eyebrow}>RINGKASAN ADMIN</p><h2 id="api-stock-heading">Stok API</h2></div><button className={styles.refresh} disabled={loading} onClick={() => void load()}>{loading ? 'Menyemak…' : 'Semak stok API'}</button></div>
  <div aria-live="polite">{loading ? <p className={styles.note}>Menyemak baki NexaBot dan kredit RADAS…</p> : failed ? <p className={styles.error} role="alert">Tidak dapat disemak. Cuba semak stok API semula.</p> : summary ? <>
   <div className={styles.statusLine}><span className={`${styles.badge} ${styles[summary.status]}`}>{labels[summary.status]}</span><span>Untuk baki pelanggan berbayar</span></div>
   <dl className={styles.grid}>
    <div className={styles.card}><dt>Baki NexaBot</dt><dd>{number(summary.providerCredit)} <small>kredit API</small></dd><p>Anggaran <strong>{number(summary.availableVideos)} video</strong></p></div>
    <div className={`${styles.card} ${styles.customerCard}`}><dt>Pelanggan berbayar</dt><dd>{number(summary.customerAccounts)} <small>pelanggan</small></dd><p>Baki <strong>{number(summary.customerCredits)} kredit RADAS</strong></p></div>
    <div className={styles.card}><dt>Keperluan pelanggan</dt><dd>{number(summary.requiredCredit)} <small>kredit API</small></dd><p>Berdasarkan baki kredit pelanggan</p></div>
    <div className={styles.card}><dt>Sasaran dengan buffer 20%</dt><dd>{number(summary.targetCredit)} <small>kredit API</small></dd><p>Untuk menampung baki pelanggan</p></div>
   </dl>
   <div className={styles.topUp}><span>Cadangan tambah stok</span><strong>{number(summary.suggestedTopUp)} <small>kredit API</small></strong>{summary.suggestedTopUp === 0 ? <p>Stok mencukupi untuk sasaran pelanggan semasa.</p> : <p>Jumlah tambahan untuk mencapai sasaran pelanggan + buffer.</p>}</div>
   <div className={styles.internal}><div><span>Akaun sendiri / ujian</span><strong>{number(summary.internalAccounts)} akaun</strong></div><p>Baki <strong>{number(summary.internalCredits)} kredit RADAS</strong> · dipaparkan berasingan daripada pelanggan.</p></div>
   {summary.otherCredits > 0 && <div className={styles.internal}><div><span>Baki lain belum dikelaskan</span><strong>{number(summary.otherAccounts)} akaun</strong></div><p>{number(summary.otherCredits)} kredit RADAS · termasuk dalam jumlah semua akaun di bawah.</p></div>}
   <details className={styles.details}><summary>Keperluan semua akaun</summary><dl><div><dt>Jumlah baki RADAS</dt><dd>{number(summary.outstandingCredits)} kredit</dd></div><div><dt>Keperluan API</dt><dd>{number(summary.totalRequiredCredit)} kredit API</dd></div><div><dt>Sasaran + buffer 20%</dt><dd>{number(summary.totalTargetCredit)} kredit API</dd></div><div><dt>Tambahan untuk semua akaun</dt><dd>{number(summary.totalSuggestedTopUp)} kredit API</dd></div></dl><p>Penggunaan akaun sendiri juga mengurangkan stok API yang sama.</p></details>
   <p className={styles.note}>Kos semasa: {number(summary.creditCost)} kredit API/video. Pelanggan ialah akaun dengan bayaran diluluskan, selain akaun sendiri yang ditandakan. Pesanan belum diluluskan tidak menambah baki.</p>
   <p className={styles.timestamp}>Disemak: {new Date(summary.checkedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} (MYT). Semak semula selepas top-up atau perubahan kredit.</p>
  </> : null}</div>
 </section>;
}
