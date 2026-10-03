import 'server-only';
import { createClient } from '../supabase/server';
import { GenerationError } from './input';
import { RateLimitError } from '../protection/rate-limit';
export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
export async function verifiedUser() {
  try {
    const client = await createClient(); const { data, error } = await client.auth.getUser();
    if (!error && data.user) return data.user.id;
  } catch { /* Fail closed. */ }
  throw new GenerationError('unauthorized', 401);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_URL;
  if (!expected || origin !== new URL(expected).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new GenerationError('forbidden', 403);
}
export function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof GenerationError ? error.code : 'unavailable' }, { status: error instanceof GenerationError ? error.status : 503, headers: error instanceof RateLimitError ? { ...PRIVATE_HEADERS, 'Retry-After': String(error.retryAfter) } : PRIVATE_HEADERS });
}
export function requireGenerationEnabled() {
  if (process.env.RADAS_GENERATION_ENABLED !== 'true') throw new GenerationError('generation_disabled');
}
