'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/settings';
import { readCredentials, type AuthState } from '@/lib/auth/input';

export async function login(_previous: AuthState, form: FormData): Promise<AuthState> {
  const input = readCredentials(form);
  if ('error' in input) return { error: input.error };
  if (!hasSupabaseConfig()) return { error: "Account access is currently unavailable." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) return { error: error.code === 'email_not_confirmed'
      ? "Confirm your email before logging in."
      : error.status === 429 ? "Too many attempts. Please try again shortly."
      : "Login failed. Check your email and password." };
  } catch { return { error: "The account service could not be reached. Please try again." }; }
  revalidatePath('/', 'layout');
  redirect('/studio?tab=dashboard');
}
export async function register(_previous: AuthState, form: FormData): Promise<AuthState> {
  const input = readCredentials(form, true);
  if ('error' in input) return { error: input.error };
  if (!hasSupabaseConfig()) return { error: "Account access is currently unavailable." };
  let signedIn = false;
  try {
    const origin = new URL(process.env.APP_URL || 'http://localhost:3000');
    if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) return { error: "Sign-up configuration is incomplete." };
    if (!['http:', 'https:'].includes(origin.protocol)) return { error: "Sign-up configuration is incomplete." };
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email, password: input.password,
      options: { data: { name: input.name }, emailRedirectTo: `${origin.origin}/auth/callback` },
    });
    if (error) return { error: error.status === 429 ? "Too many attempts. Please try again shortly." : "Sign-up failed. Check your details and try again." };
    signedIn = Boolean(data.session);
  } catch { return { error: "The account service could not be reached. Please try again." }; }
  if (signedIn) { revalidatePath('/', 'layout'); redirect('/studio?tab=dashboard'); }
  return { message: "Check your inbox or spam folder to confirm your email. If you already have an account, try logging in." };
}
export async function logout(_previous: AuthState, _form: FormData): Promise<AuthState> {
  if (!hasSupabaseConfig()) redirect('/login');
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return { error: "Logout was unsuccessful. Please try again." };
  } catch { return { error: "Logout was unsuccessful. Please try again." }; }
  revalidatePath('/', 'layout');
  redirect('/login');
}
