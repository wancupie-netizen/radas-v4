import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createNexabotClient } from '@/lib/nexabot/client';
import { GenerationError } from '@/lib/generations/input';
import { calculateStock, parseWalletTotals } from './summary';

export async function getApiStock(actor: string) {
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
 if (url !== 'https://fyqvvkpzcwrmyozxlqkw.supabase.co' || !key) throw new GenerationError('unavailable', 503);
 const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) }) } });
 const { data, error } = await client.rpc('radas_v4_api_stock_snapshot', { p_actor: actor });
 if (error) throw new GenerationError(error.code === '42501' ? 'forbidden' : 'unavailable', error.code === '42501' ? 403 : 503);
 // SQL verifies current admin membership before any provider request or aggregate disclosure.
 const wallet = parseWalletTotals(data);
 const provider = await createNexabotClient({ timeoutMs: 10_000 }).getCredit();
 return calculateStock(wallet, provider);
}
