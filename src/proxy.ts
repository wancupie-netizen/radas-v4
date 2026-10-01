import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasSupabaseConfig } from '@/lib/supabase/settings';

function noCache(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
export async function proxy(request: NextRequest) {
  // Public auth pages remain available for setup. The workspace fails closed.
  if (!hasSupabaseConfig()) {
    return noCache(request.nextUrl.pathname === '/'
      ? NextResponse.redirect(new URL('/login', request.url))
      : NextResponse.next());
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: values => {
        for (const { name, value } of values) request.cookies.set(name, value);
        const previous = response.cookies.getAll();
        response = NextResponse.next({ request });
        for (const cookie of previous) response.cookies.set(cookie);
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
      },
    } },
  );
  let authenticated = false;
  try {
    // Verify with the Auth server; never authorize using cookie-only getSession().
    const { data, error } = await supabase.auth.getUser();
    authenticated = !error && Boolean(data.user);
  } catch { /* Provider unavailable: deny workspace access. */ }
  if (request.nextUrl.pathname === '/' && !authenticated) {
    const redirect = NextResponse.redirect(new URL('/login', request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return noCache(redirect);
  }
  return noCache(response);
}
export const config = { matcher: ['/', '/login', '/register', '/auth/:path*'] };
