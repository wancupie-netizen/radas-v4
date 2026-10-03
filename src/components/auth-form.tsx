'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { login, register } from '@/app/auth/actions';
import type { AuthState } from '@/lib/auth/input';
export function AuthForm({ mode, configured, confirmationFailed = false }: { mode: 'login' | 'register'; configured: boolean; confirmationFailed?: boolean }) {
  const isRegister = mode === 'register';
  const [state, action, pending] = useActionState<AuthState, FormData>(isRegister ? register : login, {});
  return <main className="auth-page"><div className="auth-wrap">
    <Link href="/" className="brand"><span className="brand-mark">R</span>RADAS<span className="brand-dot">.</span></Link>
    <section className="auth-card panel"><span className="eyebrow">AI VIDEO GENERATOR</span><h1>{isRegister ? 'Create account' : 'Welcome back'}<span>.</span></h1>
      <p className="auth-intro">{isRegister ? 'Daftar untuk mula generate video.' : 'Login untuk masuk ke workspace anda.'}</p>
      {!configured && <p className="auth-message" role="status">Sambungan akaun belum tersedia. Sila lengkapkan konfigurasi Supabase untuk daftar atau login.</p>}
      {confirmationFailed && <p className="auth-message" role="alert">Pautan pengesahan tidak dapat digunakan. Jika email sudah disahkan, cuba login. Buka pautan di browser yang digunakan semasa daftar.</p>}
      <form action={action}>
        {isRegister && <div className="auth-field"><label htmlFor="name">Nama</label><input id="name" name="name" autoComplete="name" required maxLength={80} disabled={pending || !configured}/></div>}
        <div className="auth-field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending || !configured}/></div>
        <div className="auth-field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} maxLength={isRegister ? 72 : 128} required disabled={pending || !configured}/>{isRegister && <span className="muted">Minimum 8 aksara.</span>}</div>
        {state.error && <p className="auth-message error" role="alert">{state.error}</p>}{state.message && <p className="auth-message success" role="status">{state.message}</p>}
        <button className="primary" type="submit" disabled={pending || !configured}>{pending ? 'Sila tunggu…' : isRegister ? 'Create account' : 'Login'}</button>
      </form>
      <p className="auth-switch">{isRegister ? 'Sudah ada akaun?' : 'Belum ada akaun?'} <Link href={isRegister ? '/login' : '/register'}>{isRegister ? 'Login' : 'Daftar'}</Link></p>
    </section><p className="auth-footnote">RM5 / 60 credits · Top up bila perlu.</p>
  </div></main>;
}
