'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/settings';
import { readCredentials, type AuthState } from '@/lib/auth/input';

export async function login(_previous: AuthState, form: FormData): Promise<AuthState> {
  const input = readCredentials(form);
  if ('error' in input) return { error: input.error };
  if (!hasSupabaseConfig()) return { error: 'Sambungan akaun belum tersedia.' };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) return { error: error.code === 'email_not_confirmed'
      ? 'Sahkan email anda sebelum login.'
      : error.status === 429 ? 'Terlalu banyak cubaan. Cuba semula sebentar lagi.'
      : 'Login gagal. Semak email dan password anda.' };
  } catch { return { error: 'Tidak dapat menghubungi sistem akaun. Cuba semula.' }; }
  revalidatePath('/', 'layout');
  redirect('/');
}
export async function register(_previous: AuthState, form: FormData): Promise<AuthState> {
  const input = readCredentials(form, true);
  if ('error' in input) return { error: input.error };
  if (!hasSupabaseConfig()) return { error: 'Sambungan akaun belum tersedia.' };
  let signedIn = false;
  try {
    const origin = new URL(process.env.APP_URL || 'http://localhost:3000');
    if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) return { error: 'Sambungan pendaftaran belum lengkap.' };
    if (!['http:', 'https:'].includes(origin.protocol)) return { error: 'Sambungan pendaftaran belum lengkap.' };
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email, password: input.password,
      options: { data: { name: input.name }, emailRedirectTo: `${origin.origin}/auth/callback` },
    });
    if (error) return { error: error.status === 429 ? 'Terlalu banyak cubaan. Cuba semula sebentar lagi.' : 'Pendaftaran gagal. Semak maklumat anda dan cuba semula.' };
    signedIn = Boolean(data.session);
  } catch { return { error: 'Tidak dapat menghubungi sistem akaun. Cuba semula.' }; }
  if (signedIn) { revalidatePath('/', 'layout'); redirect('/'); }
  return { message: 'Semak inbox atau spam untuk sahkan email. Jika akaun sudah wujud, cuba login.' };
}
export async function logout(_previous: AuthState, _form: FormData): Promise<AuthState> {
  if (!hasSupabaseConfig()) redirect('/login');
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return { error: 'Logout belum berjaya. Cuba semula.' };
  } catch { return { error: 'Logout belum berjaya. Cuba semula.' }; }
  revalidatePath('/', 'layout');
  redirect('/login');
}
