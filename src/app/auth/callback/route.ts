import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/settings';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code && hasSupabaseConfig()) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const response = NextResponse.redirect(new URL('/', request.url));
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
    } catch { /* Safe generic failure; never expose token or provider details. */ }
  }
  const response = NextResponse.redirect(new URL('/login?confirmation=failed', request.url));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
