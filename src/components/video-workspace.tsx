'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { WorkspaceGreeting } from '@/components/workspace-greeting';
import { Brand } from '@/components/brand';
import { logout } from '@/app/auth/actions';
import type { AuthState } from '@/lib/auth/input';
import { parseSnapshot, type CreditSnapshot } from '@/lib/credits/types';
import { VideoStudio } from '@/components/video-studio';
import { PaymentPanel } from '@/components/payment-panel';
import { AffiliatePanel } from '@/components/affiliate-panel';
import { requestJson, RequestError } from '@/lib/errors/client';
import { readStudioTab, writeStudioTab, type StudioTab } from '@/lib/affiliate/location';
export function VideoWorkspace({ accountEmail, accountName = '', initialCredits, generationEnabled }: { accountEmail: string; accountName?: string; initialCredits: CreditSnapshot; generationEnabled: boolean }) {
  const [credits, setCredits] = useState(initialCredits);
  const [isPaymentAdmin, setIsPaymentAdmin] = useState(false);
  const [tab, setTabState] = useState<StudioTab>('video');
  useEffect(()=>{
    const restore=()=>setTabState(readStudioTab(new URL(window.location.href)));
    restore();window.addEventListener('popstate',restore);
    return ()=>window.removeEventListener('popstate',restore);
  },[]);
  function setTab(next: StudioTab) {
    const location=writeStudioTab(new URL(window.location.href),next);
    // Update the URL before mounting the catalogue so its restored page is available.
    if(location!==window.location.pathname+window.location.search+window.location.hash)window.history.pushState(window.history.state,'',location);
    setTabState(next);
  }
  const [refreshing, setRefreshing] = useState(false);
  const creditDialog = useRef<HTMLDialogElement>(null);
  async function refreshCredits() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const data = await requestJson('/api/credits');
      setCredits(parseSnapshot(data));
    } catch (error) {
      setCredits({ status: 'unavailable' });
      if (error instanceof RequestError && error.status === 401) window.location.assign('/login');
    }
    finally { setRefreshing(false); }
  }
  const [logoutState, logoutAction, logoutPending] = useActionState<AuthState, FormData>(logout, {});
  const profile = useRef<HTMLDialogElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  function topUp() { dialog.current?.showModal(); }
  return <div className="app-shell" lang="en">
    <aside className="sidebar" aria-label="Main navigation">
      <Brand href="/studio" english/>
      <div className="nav-group"><span className="eyebrow">WORKSPACE</span><button className={`nav-item ${tab==='video'?'active':''}`} aria-pressed={tab==='video'} onClick={()=>setTab('video')}><span aria-hidden="true">▣</span>Create Video</button><button className={`nav-item ${tab==='affiliate'?'active':''}`} aria-pressed={tab==='affiliate'} onClick={()=>setTab('affiliate')}><span aria-hidden="true">◇</span>Affiliate Products</button></div>
      <div className="nav-group"><a className="nav-item" href="/updates"><span aria-hidden="true">◉</span>Updates &amp; Support</a></div><div className="nav-group"><span className="eyebrow">ACCOUNT</span><button className="nav-item" onClick={() => creditDialog.current?.showModal()}><span aria-hidden="true">◈</span>Credits</button><button className="nav-item" onClick={topUp}><span aria-hidden="true">＋</span>Top Up</button></div>
      <div className="sidebar-bottom"><div className="package-card"><span className="eyebrow">START WITH RM5</span><strong>60 video credits</strong><p>Top up whenever you need.</p><button onClick={topUp}>Top Up Credits</button></div><button className="nav-item" onClick={() => profile.current?.showModal()}>Profile</button><form action={logoutAction}><button className="nav-item" type="submit" disabled={logoutPending}>{logoutPending ? "Logging out…" : "Logout"}</button></form></div>
    </aside>
    <main>
      <header className="topbar"><span>{tab==='video'?'Create Video':"Affiliate Products"}</span><div className="header-actions"><span className="balance">Credits: <strong>{credits.status === 'ready' ? credits.balance : '—'}</strong></span><button className="primary small" onClick={topUp}>Top Up</button></div></header>
      <nav className="mobile-workspace-nav" aria-label="Workspace"><button className="secondary" aria-pressed={tab==='video'} onClick={()=>setTab('video')}>Create Video</button><button className="secondary" aria-pressed={tab==='affiliate'} onClick={()=>setTab('affiliate')}>Affiliate Products</button><a className="secondary" href="/updates">Updates &amp; Support</a></nav>
      <div className="mobile-account"><button onClick={() => profile.current?.showModal()}>Profile</button><form action={logoutAction}><button type="submit" disabled={logoutPending}>{logoutPending ? "Logging out…" : "Logout"}</button></form></div>
      <div className="workspace">
        <div hidden={tab!=='video'}>
        <div className="page-heading"><WorkspaceGreeting email={accountEmail} onFindProducts={()=>setTab('affiliate')}/><span className="duration-badge">Omni Flash 1.2</span></div>
        <VideoStudio credits={credits} generationEnabled={generationEnabled} onCreditsChanged={refreshCredits} />
        </div>
        {tab==='affiliate' && <AffiliatePanel accountName={accountName}/>}
        {logoutState.error && <p className="notice" role="alert">{logoutState.error}</p>}
        <footer className="workspace-footer"><span>RADAS AI VIDEO</span><span>RM5 / 60 credits · 1 credit / generation</span></footer>
      </div>
    </main>
    <dialog ref={creditDialog} className="credit-dialog" aria-labelledby="credit-title">
      <div className="modal-heading"><span className="eyebrow">ACCOUNT</span><button aria-label="Close credits" onClick={() => creditDialog.current?.close()}>×</button></div>
      <h2 id="credit-title">Credits</h2>
      <p className="credit-total" aria-live="polite">{credits.status === 'ready' ? `${credits.balance} credits` : "Balance unavailable"}</p>
      <p>1 credit = 1 video generation.</p>
      {credits.status === 'unavailable' ? <p role="alert">Your balance could not be loaded. Please try again.</p> : credits.transactions.length === 0 ? <p>No credit transactions yet.</p> : <div className="ledger-scroll"><table className="credit-ledger"><caption>20 most recent transactions</caption><thead><tr><th>Date</th><th>Transaction</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{credits.transactions.map(t => <tr key={t.id}><td>{new Date(t.createdAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td>{t.type === 'topup' ? 'Top up' : t.type === 'debit' ? 'Video generation' : t.type === 'compensation' ? "Compensation" : 'Refund'}</td><td>{t.amount > 0 ? '+' : ''}{t.amount}</td><td>{t.balanceAfter}</td></tr>)}</tbody></table></div>}
      <div className="credit-actions"><button className="primary" onClick={refreshCredits} disabled={refreshing}>{refreshing ? "Checking…" : "Refresh balance"}</button><button onClick={() => { creditDialog.current?.close(); topUp(); }}>Top Up</button></div>
    </dialog>
    <dialog ref={profile} aria-labelledby="profile-title"><div className="modal-heading"><span className="eyebrow">ACCOUNT</span><button aria-label="Close profile" onClick={() => profile.current?.close()}>×</button></div><h2 id="profile-title">Profile</h2><p className="profile-email">{accountEmail}</p>{isPaymentAdmin&&<a className="payment-admin-link" href="/admin/payments"><span>Review Payments</span><span aria-hidden="true">↗</span></a>}<button className="primary" onClick={() => profile.current?.close()}>Close</button></dialog>
    <dialog ref={dialog} className="topup-dialog" aria-labelledby="topup-title" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}><div className="modal-heading"><span className="eyebrow">VIDEO CREDITS</span><button aria-label="Close top up" onClick={() => dialog.current?.close()}>×</button></div><h2 id="topup-title">Top Up Credits</h2><PaymentPanel onCreditsChanged={refreshCredits} onAdminResolved={setIsPaymentAdmin} /><button className="primary" onClick={() => dialog.current?.close()}>Close</button></dialog>
  </div>;
}
