import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseSnapshot, type CreditSnapshot } from './types';

export async function getCreditSnapshot(client: SupabaseClient): Promise<CreditSnapshot> {
  try {
    // User identity comes from the verified session inside SQL; no user ID argument.
    const { data, error } = await client.rpc('radas_v4_credit_snapshot');
    return error ? { status: 'unavailable' } : parseSnapshot(data);
  } catch { return { status: 'unavailable' }; }
}
export async function checkCreditBalance(client: SupabaseClient) {
  const snapshot = await getCreditSnapshot(client);
  return { snapshot, canGenerate: snapshot.status === 'ready' && snapshot.balance >= 1 };
}
