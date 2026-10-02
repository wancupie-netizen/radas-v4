import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { parseGeneration, type Generation } from './types';
import { GenerationError } from './input';
export type StoredGeneration = Generation & { providerJobId: string | null; pollAllowed: boolean; created: boolean };
export type GenerationStore = { operation(action: 'reserve' | 'read' | 'poll' | 'transition', userId: string, id: string, data?: Record<string, unknown>): Promise<StoredGeneration> };
export function createGenerationStore(): GenerationStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new GenerationError('unavailable');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) } });
  return { async operation(action, userId, id, details = {}) {
    const { data, error } = await client.rpc('radas_v4_generation_operation', { p_action: action, p_user_id: userId, p_id: id, p_data: details });
    if (error) throw new GenerationError('unavailable');
    if (data?.error) {
      const status = { insufficient_credits: 402, active_generation: 409, request_conflict: 409, not_found: 404, expired: 410 }[data.error as string];
      throw new GenerationError(status ? data.error : 'unavailable', status ?? 503);
    }
    const generation = parseGeneration(data);
    if (data.providerJobId !== null && (typeof data.providerJobId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.providerJobId))) throw new GenerationError('unavailable');
    if (typeof data.pollAllowed !== 'boolean' || typeof data.created !== 'boolean') throw new GenerationError('unavailable');
    return { ...generation, providerJobId: data.providerJobId, pollAllowed: data.pollAllowed, created: data.created };
  } };
}
