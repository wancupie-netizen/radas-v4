'use client';
import Link from 'next/link';
import { Brand } from '@/components/brand';
import { useActionState } from 'react';
import { login, register } from '@/app/auth/actions';
import type { AuthState } from '@/lib/auth/input';
export function AuthForm({ mode, configured, confirmationFailed = false }: { mode: 'login' | 'register'; configured: boolean; confirmationFailed?: boolean }) {
  const isRegister = mode === 'register';
  const [state, action, pending] = useActionState<AuthState, FormData>(isRegister ? register : login, {});
  return <main lang="en" className="auth-page"><div className="auth-wrap">
    <Brand full english/>
    <section className="auth-card panel"><span className="eyebrow">AI VIDEO GENERATOR</span><h1>{isRegister ? 'Create account' : 'Welcome back'}<span>.</span></h1>
      <p className="auth-intro">{isRegister ? "Sign up to start creating videos." : "Log in to access your workspace."}</p>
      {!configured && <p className="auth-message" role="status">Account access is unavailable. Please complete the Supabase configuration to sign up or log in.</p>}
      {confirmationFailed && <p className="auth-message" role="alert">This confirmation link cannot be used. If your email is already confirmed, try logging in. Open the link in the browser you used to sign up.</p>}
      <form action={action}>
        {isRegister && <div className="auth-field"><label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" required maxLength={80} disabled={pending || !configured}/></div>}
        <div className="auth-field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending || !configured}/></div>
        <div className="auth-field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} maxLength={isRegister ? 72 : 128} required disabled={pending || !configured}/>{isRegister && <span className="muted">At least 8 characters.</span>}</div>
        {state.error && <p className="auth-message error" role="alert">{state.error}</p>}{state.message && <p className="auth-message success" role="status">{state.message}</p>}
        <button className="primary" type="submit" disabled={pending || !configured}>{pending ? "Please wait…" : isRegister ? 'Create account' : 'Login'}</button>
      </form>
      <p className="auth-switch">{isRegister ? "Already have an account?" : "Don't have an account?"} <Link href={isRegister ? '/login' : '/register'}>{isRegister ? 'Login' : "Sign up"}</Link></p>
    </section><p className="auth-footnote">RM5 / 60 credits · Top up whenever you need.</p>
  </div></main>;
}
