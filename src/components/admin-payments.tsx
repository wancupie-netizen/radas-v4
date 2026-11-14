'use client';
import { useCallback, useState } from 'react';
import { PaymentPanel } from './payment-panel';
import { PaymentHistoryPanel } from './payment-history-panel';
import './payment-history.css';
import { ApiStockPanel } from './api-stock-panel';
export function AdminPayments() {
 const [mainTab,setMainTab]=useState<'stock'|'customers'|'payments'>('stock');
 const [tab,setTab]=useState<'review'|'history'>('review');
 const [revision, setRevision] = useState(0);
 const refreshStock = useCallback(() => setRevision(value => value + 1), []);
 const tabs = [{id:'stock',label:'Stok API'},{id:'customers',label:'Senarai Pelanggan Berbayar'},{id:'payments',label:'Semak Rekod Bayaran'}] as const;
 return <><div className="payment-admin-tabs payment-main-tabs" role="tablist" aria-label="Pengurusan bayaran" onKeyDown={event=>{
  const index=tabs.findIndex(item=>item.id===mainTab);
  const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(next===null)return;
  event.preventDefault();setMainTab(tabs[next].id);
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
 }}>
  {tabs.map(item=><button key={item.id} type="button" role="tab" id={`admin-tab-${item.id}`} aria-controls={item.id==='payments'?'admin-panel-payments':'admin-panel-summary'} aria-selected={mainTab===item.id} tabIndex={mainTab===item.id?0:-1} className={mainTab===item.id?'selected':''} onClick={()=>setMainTab(item.id)}>{item.label}</button>)}
 </div><div role="tabpanel" id="admin-panel-summary" aria-labelledby={mainTab==='customers'?'admin-tab-customers':'admin-tab-stock'} hidden={mainTab==='payments'}>
  <ApiStockPanel revision={revision} view={mainTab==='customers'?'customers':'stock'}/>
 </div><div role="tabpanel" id="admin-panel-payments" aria-labelledby="admin-tab-payments" hidden={mainTab!=='payments'}>
 <div className="payment-admin-tabs" role="group" aria-label="Senarai bayaran">
  <button type="button" className={tab==='review'?'selected':''} aria-pressed={tab==='review'} onClick={()=>setTab('review')}>Perlu Disemak</button>
  <button type="button" className={tab==='history'?'selected':''} aria-pressed={tab==='history'} onClick={()=>setTab('history')}>Rekod Bayaran</button>
 </div>{tab==='review'?<PaymentPanel admin onCreditsChanged={refreshStock} onReviewed={()=>setTab('history')}/>:<PaymentHistoryPanel/>}</div></>;
}
