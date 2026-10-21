import { createClient as createAuthClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxBytes = 2 * 1024 * 1024;

async function owner() {
  const auth = await createAuthClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) return null;
  return data.user.email?.toLowerCase() === 'wancupie@gmail.com' && data.user.email_confirmed_at ? data.user : null;
}

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (url !== 'https://fyqvvkpzcwrmyozxlqkw.supabase.co' || !key) throw new Error('not_configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) }) } });
}

export async function GET() {
  try {
    const user = await owner();
    if (!user) return reply({ error: 'forbidden' }, 403);
    const { data, error } = await database().from('radas_v4_command_center').select('state,version,mutation_id').eq('owner_id', user.id).maybeSingle();
    if (error) throw error;
    return reply({ record: data });
  } catch { return reply({ error: 'unavailable' }, 503); }
}

export async function PUT(request: Request) {
  try {
    // JSON + same-origin only; never accept a caller-supplied owner ID.
    const origin = request.headers.get('origin');
    const expected = new URL(process.env.APP_URL || request.url).origin;
    if (origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'origin' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'content_type' }, 415);
    const user = await owner();
    if (!user) return reply({ error: 'forbidden' }, 403);
    // Bound the stream, including chunked requests with no Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'invalid' }, 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); return reply({ error: 'too_large' }, 413); }
      chunks.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply({ error: 'invalid' }, 400); }
    const { state, version, mutationId } = body || {};
    if (!Number.isSafeInteger(version) || version < 0 || version > 2147483646 || typeof mutationId !== 'string' || !uuid.test(mutationId) ||
      !state || Array.isArray(state) || !state.projects || !state.projects.radas || !state.projects.biscotto || !state.projects.dexsato) return reply({ error: 'invalid' }, 400);
    const db = database();
    const values = { state, version: version + 1, mutation_id: mutationId, updated_at: new Date().toISOString() };
    const result = version === 0
      ? await db.from('radas_v4_command_center').insert({ ...values, owner_id: user.id }).select('version,mutation_id').maybeSingle()
      : await db.from('radas_v4_command_center').update(values).eq('owner_id', user.id).eq('version', version).select('version,mutation_id').maybeSingle();
    if (!result.error && result.data) return reply(result.data);
    if (result.error && result.error.code !== '23505') throw result.error;
    // Retrying a request whose response was lost must not apply it twice.
    const current = await db.from('radas_v4_command_center').select('version,mutation_id').eq('owner_id', user.id).maybeSingle();
    if (current.error) throw current.error;
    if (current.data?.mutation_id === mutationId && current.data.version === version + 1) return reply(current.data);
    return reply({ error: 'conflict' }, 409);
  } catch { return reply({ error: 'unavailable' }, 503); }
}
