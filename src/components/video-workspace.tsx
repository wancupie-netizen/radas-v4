'use client';
import { useActionState, useRef, useState } from 'react';
import { logout } from '@/app/auth/actions';
import type { AuthState } from '@/lib/auth/input';
import { parseSnapshot, type CreditSnapshot } from '@/lib/credits/types';
import { VideoStudio } from '@/components/video-studio';
import { PaymentPanel } from '@/components/payment-panel';
import { requestJson, RequestError } from '@/lib/errors/client';
export function VideoWorkspace({ accountEmail, initialCredits, generationEnabled }: { accountEmail: string; initialCredits: CreditSnapshot; generationEnabled: boolean }) {
  const [credits, setCredits] = useState(initialCredits);
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
  return <div className="app-shell">
    <aside className="sidebar" aria-label="Main navigation">
      <a href="/studio" className="brand"><span className="brand-mark">R</span>RADAS<span className="brand-dot">.</span></a>
      <div className="nav-group"><span className="eyebrow">WORKSPACE</span><a href="/studio" className="nav-item active" aria-current="page"><span aria-hidden="true">▣</span>Create Video</a></div>
      <div className="nav-group"><span className="eyebrow">ACCOUNT</span><button className="nav-item" onClick={() => creditDialog.current?.showModal()}><span aria-hidden="true">◈</span>Credits</button><button className="nav-item" onClick={topUp}><span aria-hidden="true">＋</span>Top Up</button></div>
      <div className="sidebar-bottom"><div className="package-card"><span className="eyebrow">MULA DENGAN RM5</span><strong>60 video credits</strong><p>Top up bila perlu.</p><button onClick={topUp}>Top Up Credits</button></div><button className="nav-item" onClick={() => profile.current?.showModal()}>Profile</button><form action={logoutAction}><button className="nav-item" type="submit" disabled={logoutPending}>{logoutPending ? "Logging out…" : "Logout"}</button></form></div>
    </aside>
    <main>
      <header className="topbar"><span>Create Video</span><div className="header-actions"><span className="balance">Credits: <strong>{credits.status === 'ready' ? credits.balance : '—'}</strong></span><button className="primary small" onClick={topUp}>Top Up</button></div></header>
      <div className="mobile-account"><button onClick={() => profile.current?.showModal()}>Profile</button><form action={logoutAction}><button type="submit" disabled={logoutPending}>{logoutPending ? "Logging out…" : "Logout"}</button></form></div>
      <div className="workspace">
        <div className="page-heading"><div><span className="eyebrow">AI VIDEO GENERATOR</span><h1>Create Video<span>.</span></h1><p>Dari idea ke video. Generate, preview, download.</p></div><span className="duration-badge">10 saat / video</span></div>
        <VideoStudio credits={credits} generationEnabled={generationEnabled} onCreditsChanged={refreshCredits} />
        {logoutState.error && <p className="notice" role="alert">{logoutState.error}</p>}
        <footer className="workspace-footer"><span>RADAS AI VIDEO</span><span>RM5 / 60 credits · 1 credit / generation</span></footer>
      </div>
    </main>
    <dialog ref={creditDialog} className="credit-dialog" aria-labelledby="credit-title">
      <div className="modal-heading"><span className="eyebrow">ACCOUNT</span><button aria-label="Close credits" onClick={() => creditDialog.current?.close()}>×</button></div>
      <h2 id="credit-title">Credits</h2>
      <p className="credit-total" aria-live="polite">{credits.status === 'ready' ? `${credits.balance} credits` : 'Baki belum tersedia'}</p>
      <p>1 credit = 1 video generation.</p>
      {credits.status === 'unavailable' ? <p role="alert">Baki gagal dibaca. Sila cuba semula.</p> : credits.transactions.length === 0 ? <p>Belum ada transaksi credit.</p> : <div className="ledger-scroll"><table className="credit-ledger"><caption>20 transaksi terkini</caption><thead><tr><th>Tarikh</th><th>Transaksi</th><th>Credit</th><th>Baki</th></tr></thead><tbody>{credits.transactions.map(t => <tr key={t.id}><td>{new Date(t.createdAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td>{t.type === 'topup' ? 'Top up' : t.type === 'debit' ? 'Video generation' : 'Refund'}</td><td>{t.amount > 0 ? '+' : ''}{t.amount}</td><td>{t.balanceAfter}</td></tr>)}</tbody></table></div>}
      <div className="credit-actions"><button className="primary" onClick={refreshCredits} disabled={refreshing}>{refreshing ? 'Menyemak…' : 'Semak baki'}</button><button onClick={() => { creditDialog.current?.close(); topUp(); }}>Top Up</button></div>
    </dialog>
    <dialog ref={profile} aria-labelledby="profile-title"><div className="modal-heading"><span className="eyebrow">ACCOUNT</span><button aria-label="Close profile" onClick={() => profile.current?.close()}>×</button></div><h2 id="profile-title">Profile</h2><p className="profile-email">{accountEmail}</p><button className="primary" onClick={() => profile.current?.close()}>Tutup</button></dialog>
    <dialog ref={dialog} aria-labelledby="topup-title" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}><div className="modal-heading"><span className="eyebrow">VIDEO CREDITS</span><button aria-label="Close top up" onClick={() => dialog.current?.close()}>×</button></div><h2 id="topup-title">Top Up Credits</h2><PaymentPanel onCreditsChanged={refreshCredits} /><button className="primary" onClick={() => dialog.current?.close()}>Tutup</button></dialog>
  </div>;
}
