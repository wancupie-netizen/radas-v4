'use client';
import { useEffect, useRef, useState } from 'react';
import { PACKAGES, type Payment } from '@/lib/payments/packages';
import { requestJson, RequestError, paymentIssue } from '@/lib/errors/client';
const labels={pending:'Belum hantar rujukan',submitted:'Menunggu pengesahan',approved:'Selesai',rejected:'Ditolak'};
export function PaymentPanel({admin=false,onCreditsChanged}:{admin?:boolean;onCreditsChanged?:()=>void}) {
 const [payments,setPayments]=useState<Payment[]>([]),[isAdmin,setIsAdmin]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [reference,setReference]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[selected,setSelected]=useState('');
 const lock=useRef(false),requests=useRef(new Map<string,string>());
 const [loading,setLoading]=useState(false),[loaded,setLoaded]=useState(false);const loadSequence=useRef(0);
 async function load(){
  const sequence=++loadSequence.current;setLoading(true);
  try{
   const data=await requestJson('/api/payments'+(admin?'?admin=1':''));
   if(!Array.isArray(data.payments))throw new RequestError();
   if(sequence!==loadSequence.current)return false;
   const next=data.payments as Payment[];setPayments(next);setLoaded(true);
   for(const p of next){if(p.status==='approved'||p.status==='rejected'){for(const [key,id] of requests.current){if(id===p.id)requests.current.delete(key);}}}
   setIsAdmin(data.admin===true);onCreditsChanged?.();setError('');return true;
  }catch(error){if(sequence===loadSequence.current){setError(paymentIssue(error,false));if(error instanceof RequestError&&error.status===401)window.location.assign('/login');}return false;}
  finally{if(sequence===loadSequence.current)setLoading(false);}
 }
 useEffect(()=>{void load();return()=>{loadSequence.current+=1;};},[]); // Only read requests may be refreshed.
 async function send(body:Record<string,unknown>){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   await requestJson('/api/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(await load()){setReference('');setSelected('');}
  }catch(error){setError(paymentIssue(error,true));if(error instanceof RequestError&&error.status===401)window.location.assign('/login');}
  finally{lock.current=false;setBusy(false);}
 }
 const active=payments.find(p=>p.status==='pending'||p.status==='submitted');
 return <section className="payment-panel"><p>1 credit = 1 video generation. Bayaran disahkan secara manual sebelum kredit masuk.</p>
 {!admin&&<><div className="payment-packages">{PACKAGES.map(p=><button key={p.id} disabled={busy||loading||!loaded||!!active} onClick={()=>{let id=requests.current.get(p.id);if(!id){id=crypto.randomUUID();requests.current.set(p.id,id);}void send({action:'create',id,packageId:p.id});}}><strong>{p.name} · RM{p.amountSen/100}</strong><span>{p.credits} credits</span></button>)}</div>{active&&<div className="payment-order"><h3>{labels[active.status]}</h3><p>Pesanan: {active.id}</p><strong>Bayar RM{active.amount_sen/100} · {active.credits} credits</strong><p>Maybank · Tenaga Rezeki Enterprise</p>{/* Original bank QR is intentionally preserved. */}<img src="/maybank-payment-qr.jpeg" width="240" height="324" alt="QR penerimaan Maybank Tenaga Rezeki Enterprise"/><p>Masukkan jumlah tepat dalam aplikasi bank. Pastikan nama penerima betul sebelum bayar.</p>{active.status==='pending'?<form onSubmit={e=>{e.preventDefault();void send({action:'submit',id:active.id,reference:reference.trim()});}}><label>Rujukan transaksi bank<input required minLength={3} maxLength={100} value={reference} onChange={e=>setReference(e.target.value)}/></label><button disabled={busy} className="primary">Hantar untuk pengesahan</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Batalkan hanya jika anda belum membayar.'))void send({action:'cancel',id:active.id});}}>Batal — saya belum bayar</button></form>:<p>Rujukan: {active.customer_reference}. Kredit akan masuk selepas admin menyemak wang diterima.</p>}</div>}{isAdmin&&<a href="/admin/payments">Semak bayaran sebagai admin</a>}</>}
 {error&&<p role="alert">{error}</p>}<button disabled={busy||loading} onClick={()=>void load()}>{loading?'Menyemak…':'Semak status'}{admin?'':' dan baki'}</button>
 <h3>{admin?'Bayaran untuk disemak':'Pesanan terkini'}</h3>{!loaded?<p>{loading?'Memuatkan pesanan…':'Senarai pesanan belum tersedia.'}</p>:payments.length===0?<p>Tiada pesanan.</p>:payments.map(p=><article className="payment-row" key={p.id}><strong>{p.package_id} · RM{p.amount_sen/100} · {p.credits} credits</strong><p>{p.id}</p><p>{new Date(p.created_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})}</p><p>{labels[p.status]}{p.reason?' — '+p.reason:''}</p>{admin&&<><p>Akaun: {p.user_id} · Rujukan pelanggan: {p.customer_reference||'Belum dihantar'}</p><button onClick={()=>{setSelected(p.id);setReference('');setAmount('');setReason('');}}>Semak pesanan ini</button>{selected===p.id&&<div><p>Semak transaksi sebenar dalam Maybank. Jumlah mesti RM{p.amount_sen/100}. Jangan sahkan berdasarkan resit sahaja.</p><label>Rujukan transaksi sebenar<input value={reference} maxLength={100} onChange={e=>setReference(e.target.value)}/></label><label>Jumlah diterima (RM)<input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><button className="primary" disabled={busy||p.status!=='submitted'||reference.trim().length<3||Math.round(Number(amount)*100)!==p.amount_sen} onClick={()=>{if(window.confirm('Saya telah menyemak wang diterima dalam Maybank untuk pesanan ini.'))void send({action:'approve',id:p.id,reference:reference.trim(),amountSen:Math.round(Number(amount)*100)});}}>Sahkan wang diterima</button><label>Sebab penolakan<input value={reason} maxLength={200} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||reason.trim().length<3} onClick={()=>void send({action:'reject',id:p.id,reason:reason.trim()})}>Tolak pesanan</button></div>}</>}</article>)}</section>;
}
