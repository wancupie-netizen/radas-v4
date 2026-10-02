import { createClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/settings';
import { getCreditSnapshot } from '@/lib/credits/snapshot';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Vary: 'Cookie' };
export async function GET() {
  if (!hasSupabaseConfig()) return Response.json({ error: 'unavailable' }, { status: 503, headers });
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
    const snapshot = await getCreditSnapshot(client);
    return Response.json(snapshot, { status: snapshot.status === 'ready' ? 200 : 503, headers });
  } catch { return Response.json({ error: 'unavailable' }, { status: 503, headers }); }
}
