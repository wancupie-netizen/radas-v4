import 'server-only';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const BUCKET = 'radas-v4-videos';
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/;
type CleanupClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  storage: { from(bucket: string): { remove(paths: string[]): PromiseLike<{ error: unknown }> } };
};
export type CleanupResult = { status: 'ok' | 'busy' | 'partial'; removed: number; metadataPruned: number };
export function createCleanupClient() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://fyqvvkpzcwrmyozxlqkw.supabase.co' || !process.env.SUPABASE_SECRET_KEY) throw new Error('cleanup_config');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) }),
  } });
}
export function createCleanupRunner(client: CleanupClient) {
  async function rpc(action: string, token: string | null = null, paths: string[] = [], removed = 0, status = 'ok') {
    const { data, error } = await client.rpc('radas_v4_cleanup_operation', { p_action: action, p_token: token, p_paths: paths, p_removed: removed, p_status: status });
    if (error || !data || typeof data !== 'object') throw new Error('cleanup_database');
    return data as Record<string, unknown>;
  }
  const count = (value: unknown) => { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('cleanup_response'); return value as number; };
  return {
    async inspect() {
      const data = await rpc('inspect');
      if (typeof data.busy !== 'boolean' || (data.lastRunAt !== null && (typeof data.lastRunAt !== 'string' || !Number.isFinite(Date.parse(data.lastRunAt)))) || (data.lastStatus !== null && !['ok', 'failed', 'partial'].includes(String(data.lastStatus)))) throw new Error('cleanup_response');
      return { eligible: count(data.eligible), busy: data.busy, lastRunAt: data.lastRunAt ?? null, lastStatus: data.lastStatus ?? null, lastRemoved: count(data.lastRemoved) };
    },
    async run(): Promise<CleanupResult> {
      const token = randomUUID(); const started = Date.now(); let removed = 0; let pruned = 0; let result: 'ok' | 'failed' | 'partial' = 'failed'; let claimed = false;
      try {
        let claim;
        try { claim = await rpc('claim', token); } catch { claim = await rpc('claim', token); }
        if (typeof claim.claimed !== 'boolean') throw new Error('cleanup_response');
        if (!claim.claimed) return { status: 'busy', removed: 0, metadataPruned: 0 };
        claimed = true; pruned = count(claim.metadataPruned);
        for (let batch = 0; batch < 10; batch++) {
          if (Date.now() - started > 45_000) { result = 'partial'; break; }
          const data = await rpc('batch', token);
          if (!Array.isArray(data.paths) || data.paths.length > 50 || data.paths.some((path: unknown) => typeof path !== 'string' || !KEY.test(path)) || new Set(data.paths).size !== data.paths.length) throw new Error('cleanup_response');
          const paths: string[] = data.paths;
          if (paths.length === 0) { result = 'ok'; break; }
          // Physical deletion is exclusively the Storage API, never SQL against storage.objects.
          const { error } = await client.storage.from(BUCKET).remove(paths);
          if (error) throw new Error('cleanup_storage');
          const ack = await rpc('ack', token, paths);
          const remaining = count(ack.remaining); if (remaining !== 0) throw new Error('cleanup_unconfirmed');
          removed += paths.length; pruned += count(ack.metadataPruned); result = 'partial';
        }
        return { status: result === 'ok' ? 'ok' : 'partial', removed, metadataPruned: pruned };
      } catch (error) { result = 'failed'; throw error; } finally {
        if (claimed) { const finish = await rpc('finish', token, [], removed, result); if (finish.finished !== true) throw new Error('cleanup_response'); }
      }
    },
  };
}
export function requireCleanupEnabled() { if (process.env.RADAS_CLEANUP_ENABLED !== 'true') throw new Error('cleanup_disabled'); }
