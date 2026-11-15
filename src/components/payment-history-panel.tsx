'use client';
import { useEffect, useRef, useState } from 'react';
import { requestJson, RequestError, paymentIssue } from '@/lib/errors/client';
import { PACKAGES } from '@/lib/payments/packages';
import { parsePaymentHistory, type PaymentHistory } from '@/lib/payments/history';
import './payment-history.css';
const date=(value:string)=>new Date(value).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'});
export function PaymentHistoryPanel() {
 const [data,setData]=useState<PaymentHistory|null>(null),[query,setQuery]=useState(''),[applied,setApplied]=useState('');
 const [loading,setLoading]=useState(false),[error,setError]=useState('');const sequence=useRef(0);
 async function load(page:number,search:string) {
  const current=++sequence.current;setLoading(true);setError('');
  try {
   const params=new URLSearchParams({admin:'1',history:'1',page:String(page),q:search});
   const next=parsePaymentHistory(await requestJson(`/api/payments?${params}`));
   if(current===sequence.current){setData(next);setApplied(search);}
  }catch(e){if(current===sequence.current){setError(paymentIssue(e,false));if(e instanceof RequestError&&e.status===401)window.location.assign('/login');}}
  finally{if(current===sequence.current)setLoading(false);}
 }
 useEffect(()=>{void load(1,'');return()=>{sequence.current+=1;};},[]);
 const pages=data?Math.max(1,Math.ceil(data.total/9)):1;
 const pageNumbers=data?Array.from({length:Math.min(5,pages)},(_,i)=>Math.max(1,Math.min(data.page-2,pages-4))+i):[];
 return <section className="payment-history-panel" aria-label="Payment Records" aria-busy={loading}>
  <h2>Payment Records</h2><p>Approved and rejected payments are kept here for review and follow-up.</p>
  <form className="payment-history-search" onSubmit={e=>{e.preventDefault();void load(1,query.trim());}}>
   <label htmlFor="payment-customer-search">Search by email or WhatsApp<input id="payment-customer-search" type="search" maxLength={254} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Email address or WhatsApp number"/></label>
   <button type="submit" className="secondary" disabled={loading}>Search</button>
   <button type="button" className="secondary" disabled={loading} onClick={()=>void load(data?.page??1,applied)}>Refresh records</button>
  </form>
  {error&&<p className="notice" role="alert">{error}</p>}
  {loading?<p role="status">Loading records…</p>:data?<>
   <p className="payment-history-count">{data.total} records{applied?` for “${applied}”`:''} · Page {data.page}/{pages}</p>
   {data.payments.length===0?<p>No payment records found.</p>:<div className="payment-history-grid">{data.payments.map(p=><article className="payment-history-card" key={p.id}>
    <div className="payment-history-card-heading"><strong>{p.customer_email??"Email not available"}</strong><span className={`payment-status payment-status-${p.status}`}>{p.status==='approved'?"Approved":"Rejected"}</span></div>
    <p className="payment-history-price">RM{(p.amount_sen/100).toFixed(2)} <span>· {PACKAGES.find(pack=>pack.id===p.package_id)?.name} · {p.credits} credits</span></p>
    <p>Email: {p.customer_email?<a href={`mailto:${p.customer_email}`}>{p.customer_email}</a>:"Not available"}</p>
    <p>WhatsApp: <strong>{p.whatsapp??"Not provided"}</strong></p>
    {p.whatsapp&&<a className="secondary payment-history-whatsapp" href={`https://wa.me/${p.whatsapp}`} target="_blank" rel="noopener noreferrer">Open WhatsApp ↗</a>}
    <p>Order: {date(p.created_at)}</p>{p.reviewed_at&&<p>Checked: {date(p.reviewed_at)}</p>}
    {p.reason&&<p>Reason: {p.reason}</p>}<p className="payment-reference">Customer reference: {p.customer_reference??"Not submitted"}<br/>Order: {p.id}</p>
   </article>)}</div>}
   {pages>1&&<nav className="payment-history-pagination" aria-label="Payment record pages">
    <button type="button" disabled={data.page===1} onClick={()=>void load(data.page-1,applied)}>Previous</button>
    {pageNumbers[0]>1&&<><button type="button" onClick={()=>void load(1,applied)}>1</button>{pageNumbers[0]>2&&<span>…</span>}</>}
    {pageNumbers.map(page=><button type="button" key={page} aria-current={page===data.page?'page':undefined} onClick={()=>void load(page,applied)}>{page}</button>)}
    {pageNumbers.at(-1)!<pages&&<>{pageNumbers.at(-1)!<pages-1&&<span>…</span>}<button type="button" onClick={()=>void load(pages,applied)}>{pages}</button></>}
    <button type="button" disabled={data.page===pages} onClick={()=>void load(data.page+1,applied)}>Next</button>
   </nav>}
  </>:!error?<p>Payment records are currently unavailable.</p>:null}
 </section>;
}
