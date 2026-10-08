'use client';
import { useCallback, useState } from 'react';
import { PaymentPanel } from './payment-panel';
import { PaymentHistoryPanel } from './payment-history-panel';
import './payment-history.css';
import { ApiStockPanel } from './api-stock-panel';
export function AdminPayments() {
 const [tab,setTab]=useState<'review'|'history'>('review');
 const [revision, setRevision] = useState(0);
 const refreshStock = useCallback(() => setRevision(value => value + 1), []);
 return <><ApiStockPanel revision={revision}/><div className="payment-admin-tabs" role="group" aria-label="Senarai bayaran">
  <button type="button" className={tab==='review'?'selected':''} aria-pressed={tab==='review'} onClick={()=>setTab('review')}>Perlu Disemak</button>
  <button type="button" className={tab==='history'?'selected':''} aria-pressed={tab==='history'} onClick={()=>setTab('history')}>Rekod Bayaran</button>
 </div>{tab==='review'?<PaymentPanel admin onCreditsChanged={refreshStock} onReviewed={()=>setTab('history')}/>:<PaymentHistoryPanel/>}</>;
}
