import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { GenerationError } from '../generations/input';
import { UUID } from '../generations/types';
export class RateLimitError extends GenerationError {
 constructor(public readonly retryAfter: number) { super('rate_limited',429); }
}
export async function requireRequestLimit(userId: string, scope: 'generation' | 'payment') {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(url!=='https://fyqvvkpzcwrmyozxlqkw.supabase.co'||!key||!UUID.test(userId)||!['generation','payment'].includes(scope))throw new GenerationError('unavailable');
 try {
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000)})}});
  const {data,error}=await client.rpc('radas_v4_request_limit',{p_user_id:userId,p_scope:scope});
  if(error||!data||typeof data.allowed!=='boolean'||!Number.isSafeInteger(data.retryAfter)||(data.allowed?data.retryAfter!==0:data.retryAfter<1||data.retryAfter>60))throw new GenerationError('unavailable');
  if(!data.allowed)throw new RateLimitError(data.retryAfter);
 }catch(error){if(error instanceof RateLimitError)throw error;throw new GenerationError('unavailable');}
}
