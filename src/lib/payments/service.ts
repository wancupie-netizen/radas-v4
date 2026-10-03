import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { GenerationError } from '@/lib/generations/input';
export async function operation(actor: string, action: string, body: Record<string, unknown> = {}) {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SECRET_KEY;
 if(url!=='https://fyqvvkpzcwrmyozxlqkw.supabase.co'||!key) throw new GenerationError('unavailable',503);
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)})}});
 const {data,error}=await client.rpc('radas_v4_payment_operation',{p_actor:actor,p_action:action,p_id:body.id??null,p_package:body.packageId??null,p_reference:body.reference??null,p_amount:body.amountSen??null,p_reason:body.reason??null});
 if(error) throw new GenerationError(error.code==='42501'?'forbidden':error.code?.startsWith('08')?'unavailable':'payment_conflict',error.code==='42501'?403:error.code?.startsWith('08')?503:409);
 if(!data||typeof data!=='object') throw new GenerationError('unavailable',503);
 return data;
}
