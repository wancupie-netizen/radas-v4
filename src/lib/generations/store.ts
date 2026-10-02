import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { parseGeneration, UUID, type Generation } from './types';
import { GenerationError } from './input';
export type StoredGeneration = Generation & { providerJobId: string | null; pollAllowed: boolean; created: boolean; claimAllowed: boolean };
export type GenerationStore = { operation(action: 'reserve' | 'read' | 'poll' | 'transition' | 'claim' | 'cancel' | 'reconcile', userId: string, id: string, data?: Record<string, unknown>): Promise<StoredGeneration> };
export function createGenerationStore(): GenerationStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new GenerationError('unavailable');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) } });
  return { async operation(action, userId, id, details = {}) {
    const { data, error } = await client.rpc('radas_v4_generation_operation', { p_action: action, p_user_id: userId, p_id: id, p_data: details });
    if (error) throw new GenerationError('unavailable');
    if (data?.error) {
      const status = { insufficient_credits: 402, active_generation: 409, request_conflict: 409, not_found: 404, expired: 410 }[data.error as string];
      throw new GenerationError(status ? data.error : 'unavailable', status ?? 503, data.error === 'active_generation' && typeof data.activeId === 'string' && UUID.test(data.activeId) ? data.activeId : undefined);
    }
    const generation = parseGeneration(data);
    if (generation.id.toLowerCase() !== id.toLowerCase()) throw new GenerationError('unavailable');
    if (data.providerJobId !== null && (typeof data.providerJobId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.providerJobId))) throw new GenerationError('unavailable');
    if (typeof data.pollAllowed !== 'boolean' || typeof data.created !== 'boolean' || typeof data.claimAllowed !== 'boolean') throw new GenerationError('unavailable');
    if (data.claimAllowed && (generation.status !== 'submitting' || data.providerJobId !== null || generation.refunded)) throw new GenerationError('unavailable');
    return { ...generation, providerJobId: data.providerJobId, pollAllowed: data.pollAllowed, created: data.created, claimAllowed: data.claimAllowed };
  } };
}
