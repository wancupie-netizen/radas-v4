'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson, RequestError } from '@/lib/errors/client';
import { parseStockSummary, type StockSummary } from '@/lib/api-stock/summary';
import styles from './api-stock-panel.module.css';
const labels = { sufficient: "Sufficient", buffer_low: "Low buffer", insufficient: "Insufficient" };
const number = (value: number) => value.toLocaleString('en-MY', { maximumFractionDigits: 2 });
export function ApiStockPanel({ revision, view = 'stock' }: { revision: number; view?: 'stock' | 'customers' }) {
 const customers = view === 'customers';
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
 return <section className={styles.panel} aria-labelledby="admin-summary-heading" aria-busy={loading}>
  <div className={styles.header}><div><p className={styles.eyebrow}>ADMIN SUMMARY</p><h2 id="admin-summary-heading">{customers ? "Paid Customers" : "API Credit Stock"}</h2></div><button className={styles.refresh} disabled={loading} onClick={() => void load()}>{loading ? "Checking…" : customers ? "Refresh balances" : "Check API stock"}</button></div>
  <div aria-live="polite">{loading ? <p className={styles.note}>Checking NexaBot and RADAS credit balances…</p> : failed ? <p className={styles.error} role="alert">{customers ? "The customer list could not be checked. Please refresh the balances again." : "The stock could not be checked. Please check the API stock again."}</p> : summary ? <>
   {!customers && <>
   <div className={styles.statusLine}><span className={`${styles.badge} ${styles[summary.status]}`}>{labels[summary.status]}</span><span>For paid customer balances</span></div>
   <dl className={styles.grid}>
    <div className={styles.card}><dt>NexaBot balance</dt><dd>{number(summary.providerCredit)} <small>API credits</small></dd><p>Estimated <strong>{number(summary.availableVideos)} video</strong></p></div>
    <div className={`${styles.card} ${styles.customerCard}`}><dt>Paid customers</dt><dd>{number(summary.customerAccounts)} <small>customers</small></dd><p>Balance <strong>{number(summary.customerCredits)} RADAS credits</strong></p></div>
    <div className={styles.card}><dt>Customer requirements</dt><dd>{number(summary.requiredCredit)} <small>API credits</small></dd><p>Based on customer credit balances</p></div>
    <div className={styles.card}><dt>Target with a 20% buffer</dt><dd>{number(summary.targetCredit)} <small>API credits</small></dd><p>To cover customer balances</p></div>
   </dl>
   <div className={styles.topUp}><span>Suggested stock top-up</span><strong>{number(summary.suggestedTopUp)} <small>API credits</small></strong>{summary.suggestedTopUp === 0 ? <p>Stock is sufficient for the current customer target.</p> : <p>The additional amount needed to reach the customer target plus buffer.</p>}</div>
   <div className={styles.internal}><div><span>Internal / test accounts</span><strong>{number(summary.internalAccounts)} accounts</strong></div><p>Balance <strong>{number(summary.internalCredits)} RADAS credits</strong> · shown separately from customers.</p></div>
   {summary.otherCredits > 0 && <div className={styles.internal}><div><span>Other unclassified balances</span><strong>{number(summary.otherAccounts)} accounts</strong></div><p>{number(summary.otherCredits)} RADAS credits · included in the totals for all accounts below.</p></div>}
   <details className={styles.details}><summary>Requirements for all accounts</summary><dl><div><dt>Total RADAS balance</dt><dd>{number(summary.outstandingCredits)} credits</dd></div><div><dt>API requirements</dt><dd>{number(summary.totalRequiredCredit)} API credits</dd></div><div><dt>Target plus 20% buffer</dt><dd>{number(summary.totalTargetCredit)} API credits</dd></div><div><dt>Top-up required for all accounts</dt><dd>{number(summary.totalSuggestedTopUp)} API credits</dd></div></dl><p>Internal account usage also draws from the same API stock.</p></details>
   </>}
   {customers && <section className={styles.customers} aria-labelledby="customer-balances-heading">
    <h3 id="customer-balances-heading">{number(summary.customerAccounts)} customers · {number(summary.customerCredits)} RADAS credits</h3>
    <p className={styles.note}>Names, email addresses and current credit balances, including customers with zero balances.</p>
    {summary.customerBalances === undefined ? <p className={styles.note}>The customer list could not be loaded. Please refresh the balances again.</p> : summary.customerBalances.length === 0 ? <p className={styles.note}>No paid customers yet.</p> : <table className={styles.customerTable}>
     <caption className="sr-only">Paid customer credit balances</caption>
     <thead><tr><th scope="col">Customer</th><th scope="col">Credit balance</th></tr></thead>
     <tbody>{summary.customerBalances.map(customer => <tr key={customer.id}><td><strong>{customer.name || "Name not provided"}</strong><span>{customer.email || "Email not provided"}</span></td><td>{number(customer.balance)}</td></tr>)}</tbody>
     <tfoot><tr><th scope="row">Total ({number(summary.customerAccounts)} customers)</th><td>{number(summary.customerCredits)}</td></tr></tfoot>
    </table>}
   </section>}
   {!customers && <p className={styles.note}>Current cost: {number(summary.creditCost)} API credits per video. Customers are accounts with approved payments, excluding accounts marked as internal. Unapproved orders do not add to the balance.</p>}
   <p className={styles.timestamp}>Checked: {new Date(summary.checkedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} (MYT). Refresh after a top-up or credit balance change.</p>
  </> : null}</div>
 </section>;
}
