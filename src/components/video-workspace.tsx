'use client';
import { useActionState, useRef, useState } from 'react';
import { logout } from '@/app/auth/actions';
import type { AuthState } from '@/lib/auth/input';
import { PRODUCT } from '@/lib/config';
export function VideoWorkspace({ accountEmail }: { accountEmail: string }) {
  const [logoutState, logoutAction, logoutPending] = useActionState<AuthState, FormData>(logout, {});
  const profile = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState('text');
  const [orientation, setOrientation] = useState('portrait');
  const [resolution, setResolution] = useState('720');
  const [prompt, setPrompt] = useState('');
  const [imageName, setImageName] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  function topUp() { dialog.current?.showModal(); }
  return <div className="app-shell">
    <aside className="sidebar" aria-label="Main navigation">
      <a href="/" className="brand"><span className="brand-mark">R</span>RADAS<span className="brand-dot">.</span></a>
      <div className="nav-group"><span className="eyebrow">WORKSPACE</span><a href="/" className="nav-item active" aria-current="page"><span aria-hidden="true">▣</span>Create Video</a></div>
      <div className="nav-group"><span className="eyebrow">ACCOUNT</span><button className="nav-item" onClick={() => setNotice('Akaun baharu bermula dengan 0 credit. Top up akan tersedia dalam fasa bayaran.')}><span aria-hidden="true">◈</span>Credits</button><button className="nav-item" onClick={topUp}><span aria-hidden="true">＋</span>Top Up</button></div>
      <div className="sidebar-bottom"><div className="package-card"><span className="eyebrow">MULA DENGAN RM5</span><strong>60 video credits</strong><p>Top up bila perlu.</p><button onClick={topUp}>Top Up Credits</button></div><button className="nav-item" onClick={() => profile.current?.showModal()}>Profile</button><form action={logoutAction}><button className="nav-item" type="submit" disabled={logoutPending}>{logoutPending ? "Logging out…" : "Logout"}</button></form></div>
    </aside>
    <main>
      <header className="topbar"><span>Create Video</span><div className="header-actions"><span className="balance">Credits: <strong>0</strong></span><button className="primary small" onClick={topUp}>Top Up</button></div></header>
      <div className="mobile-account"><button onClick={() => profile.current?.showModal()}>Profile</button><form action={logoutAction}><button type="submit" disabled={logoutPending}>{logoutPending ? "Logging out…" : "Logout"}</button></form></div>
      <div className="workspace">
        <div className="page-heading"><div><span className="eyebrow">AI VIDEO GENERATOR</span><h1>Create Video<span>.</span></h1><p>Dari idea ke video. Generate, preview, download.</p></div><span className="duration-badge">10 saat / video</span></div>
        <div className="studio-grid">
          <section className="generator panel" aria-label="Video settings">
            <div className="panel-heading"><span className="step">01</span><h2>Video settings</h2></div>
            <label htmlFor="mode">Generation mode</label><select id="mode" value={mode} onChange={e => { setMode(e.target.value); setNotice(''); }}><option value="text">Text to Video</option><option value="image">Image to Video</option></select>
            {mode === 'image' && <div className="upload-area"><label htmlFor="image">Upload image</label><input ref={file} id="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f && (!['image/jpeg','image/png','image/webp'].includes(f.type) || f.size > 10 * 1024 * 1024)) { e.target.value='';setImageName('');setNotice('Pilih JPG, PNG atau WEBP maksimum 10 MB.');return; } setImageName(f?.name ?? '');setNotice(''); }}/><span>{imageName || 'JPG, PNG, WEBP · Maksimum 10 MB'}</span></div>}
            <fieldset><legend>Orientation</legend><div className="choices"><button type="button" aria-pressed={orientation === 'portrait'} className={orientation === 'portrait' ? 'selected' : ''} onClick={() => setOrientation('portrait')}><span className="ratio portrait"/>Portrait <span className="muted">9:16</span></button><button type="button" aria-pressed={orientation === 'landscape'} className={orientation === 'landscape' ? 'selected' : ''} onClick={() => setOrientation('landscape')}><span className="ratio landscape"/>Landscape <span className="muted">16:9</span></button></div></fieldset>
            <fieldset><legend>Resolution</legend><div className="choices"><button type="button" aria-pressed={resolution === '720'} className={resolution === '720' ? 'selected' : ''} onClick={() => setResolution('720')}>720p <span className="muted">HD</span></button><button type="button" aria-pressed={resolution === '1080'} className={resolution === '1080' ? 'selected' : ''} onClick={() => setResolution('1080')}>1080p <span className="muted">Full HD</span></button></div></fieldset>
            <div className="prompt-label"><label htmlFor="prompt">{mode === 'image' ? 'Motion prompt' : 'Describe your video'}</label><span className="muted">{prompt.length}/2000</span></div><textarea id="prompt" maxLength={2000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={mode === 'image' ? 'Terangkan pergerakan subjek dan kamera…' : 'Contoh: Seorang creator memperkenalkan produk di studio dengan cahaya lembut…'} />
            <button className="primary generate" disabled>Generate Video <span>· {PRODUCT.creditsPerGeneration} Credit</span></button><p className="phase-note">Generation akan tersedia selepas credit diaktifkan.</p>
          </section>
          <section className="preview panel" aria-label="Video preview"><div className="panel-heading"><span className="step">02</span><h2>Preview</h2><span className="preview-meta">{orientation === 'portrait' ? '9:16' : '16:9'} · {resolution}p</span></div><div className="preview-stage"><div className={`empty-frame ${orientation}`}><span className="play-icon" aria-hidden="true">▷</span></div><h3>Your generated video<br/>will appear here</h3><p>Preview hasil video sebelum download.</p></div><div className="preview-footer"><span aria-hidden="true">↓</span><p>Download terus selepas generate.<br/><span>Video hilang daripada paparan apabila refresh atau logout.</span></p></div></section>
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}{logoutState.error && <p className="notice" role="alert">{logoutState.error}</p>}
        <footer className="workspace-footer"><span>RADAS AI VIDEO</span><span>RM5 / 60 credits · 1 credit / generation</span></footer>
      </div>
    </main>
    <dialog ref={profile} aria-labelledby="profile-title"><div className="modal-heading"><span className="eyebrow">ACCOUNT</span><button aria-label="Close profile" onClick={() => profile.current?.close()}>×</button></div><h2 id="profile-title">Profile</h2><p className="profile-email">{accountEmail}</p><button className="primary" onClick={() => profile.current?.close()}>Tutup</button></dialog>
    <dialog ref={dialog} aria-labelledby="topup-title" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}><div className="modal-heading"><span className="eyebrow">VIDEO CREDITS</span><button aria-label="Close top up" onClick={() => dialog.current?.close()}>×</button></div><h2 id="topup-title">Top Up Credits</h2><div className="pricing"><strong>RM{PRODUCT.packagePriceMYR}</strong><span>{PRODUCT.packageCredits} video credits</span></div><p>1 credit = 1 video generation.</p><p className="payment-note">Pembayaran QRPay belum tersedia. Tiada bayaran diambil pada peringkat ini.</p><button className="primary" onClick={() => dialog.current?.close()}>Tutup</button></dialog>
  </div>;
}
