import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache',
  'Vary': 'Cookie',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

export async function GET() {
  try {
    const supabase = await createClient();
    // Verify with Auth, never trust a browser-supplied email or user metadata.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return new Response(null, { status: 303, headers: { ...headers, Location: '/login' } });
    }
    if (data.user.email?.toLowerCase() !== 'wancupie@gmail.com' || !data.user.email_confirmed_at) {
      return new Response('Akses tidak dibenarkan.', { status: 403, headers });
    }
    const html = await readFile(join(process.cwd(), 'src/lib/command-center/center.html'), 'utf8');
    return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch {
    return new Response('Command Center belum tersedia. Sila cuba semula.', { status: 503, headers });
  }
}
