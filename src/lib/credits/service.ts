import 'server-only';
import { createClient } from '@supabase/supabase-js';

export type CreditMutationResult =
  | { status: 'applied' | 'already_applied'; balance: number; transactionId: string; refunded: boolean }
  | { status: 'insufficient_credits' | 'debit_not_found'; balance: number };

async function applyCredit(userId: string, type: 'debit' | 'refund' | 'topup', reference: string): Promise<CreditMutationResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) || !reference || reference.length > 200 || reference !== reference.trim()) throw new Error('invalid_credit_request');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('credit_service_not_configured');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.rpc('radas_v4_credit_apply', { p_user_id: userId, p_type: type, p_reference: reference });
  // An ambiguous transport error must be retried using the SAME reference.
  if (error) throw new Error('credit_mutation_failed');
  if (!data || !Number.isSafeInteger(data.balance) || data.balance < 0) throw new Error('invalid_credit_response');
  if (data.status === 'insufficient_credits' || data.status === 'debit_not_found') return { status: data.status, balance: data.balance };
  if ((data.status !== 'applied' && data.status !== 'already_applied') || typeof data.transactionId !== 'string' || typeof data.refunded !== 'boolean') throw new Error('invalid_credit_response');
  return { status: data.status, balance: data.balance, transactionId: data.transactionId, refunded: data.refunded };
}
// Future generation backend must get userId from verified auth, and create a stable job ID.
// already_applied means retrieve the existing job; never start another provider request.
export const debitCredit = (userId: string, generationId: string) => applyCredit(userId, 'debit', generationId);
export const refundCredit = (userId: string, generationId: string) => applyCredit(userId, 'refund', generationId);
// Only a future verified payment handler may call this AFTER confirming RM5 was paid.
// This phase exposes no top-up/debit/refund HTTP endpoint or browser action.
export const creditConfirmedTopUp = (userId: string, paymentReference: string) => applyCredit(userId, 'topup', paymentReference);
