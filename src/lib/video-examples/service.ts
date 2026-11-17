import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { GenerationError } from '@/lib/generations/input';
import { parseExamples, type VideoExample } from './types';
export async function examplesOperation(actor: string, action: 'list' | 'admin_list' | 'save' | 'delete', example?: VideoExample) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (url !== 'https://fyqvvkpzcwrmyozxlqkw.supabase.co' || !key) throw new GenerationError('unavailable',503);
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)})}});
  const {data,error} = await client.rpc('radas_v4_video_examples_operation',{p_actor:actor,p_action:action,p_example:example ?? null});
  if (error) throw new GenerationError(error.code === '42501' ? 'forbidden' : error.message === 'example_conflict' ? 'example_conflict' : error.message === 'invalid_example' ? 'invalid_request' : 'unavailable',error.code === '42501' ? 403 : error.message === 'example_conflict' ? 409 : error.message === 'invalid_example' ? 400 : 503);
  try { return parseExamples(data); } catch { throw new GenerationError('unavailable',503); }
}
