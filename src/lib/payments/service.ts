import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { parsePaymentResponse } from './response';
import { GenerationError } from '@/lib/generations/input';
export async function operation(actor: string, action: string, body: Record<string, unknown> = {}) {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SECRET_KEY;
 if(url!=='https://fyqvvkpzcwrmyozxlqkw.supabase.co'||!key) throw new GenerationError('unavailable',503);
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)})}});
 const {data,error}=await client.rpc('radas_v4_payment_operation',{p_actor:actor,p_action:action,p_id:body.id??null,p_package:body.packageId??null,p_reference:body.reference??null,p_amount:body.amountSen??null,p_reason:body.reason??null});
 if(error) {
  if(error.code==='42501') throw new GenerationError('forbidden',403);
  const expected=error.code==='23505'||(error.code==='P0001'&&['invalid_request','invalid_package','request_conflict','not_found','invalid_reference','payment_locked','bank_details_invalid','payment_not_submitted','reason_required','invalid_action'].some(message=>error.message===message));
  throw new GenerationError(expected?'payment_conflict':'unavailable',expected?409:503);
 }
 return parsePaymentResponse(data,actor,action);
}
