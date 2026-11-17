import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { GenerationError } from '../generations/input';
import { parseGeneration, type Generation } from '../generations/types';

export function finalizationEnabled() { return process.env.RADAS_FINALIZATION_ENABLED === 'true'; }
export function createFinalizationClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (url !== 'https://fyqvvkpzcwrmyozxlqkw.supabase.co' || !key) throw new GenerationError('unavailable');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) }),
  } });
}
export type FinalizationClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export async function finalizationOperation(client: FinalizationClient, action: string, userId: string | null = null, id: string | null = null, token: string | null = null) {
  const { data, error } = await client.rpc('radas_v4_finalization_operation', { p_action: action, p_user_id: userId, p_id: id, p_token: token });
  if (error || !data || typeof data !== 'object' || 'error' in data) throw new GenerationError('unavailable');
  return data as Record<string, unknown>;
}
export async function withVideoState(userId: string, generation: Generation): Promise<Generation> {
  if (!finalizationEnabled()) return generation;
  const result = await finalizationOperation(createFinalizationClient(), 'state', userId, generation.id);
  return { ...parseGeneration({ ...generation, videoState: result.videoState }), ...((generation as Generation & { pollUnavailable?: boolean }).pollUnavailable ? { pollUnavailable: true } : {}) };
}
