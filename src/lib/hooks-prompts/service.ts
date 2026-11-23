import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { GenerationError } from '@/lib/generations/input';
import { parseEntries, type HookPrompt } from './types';
export async function hooksOperation(actor: string, action: 'list' | 'admin_list' | 'save' | 'delete', entry?: HookPrompt) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (url !== 'https://fyqvvkpzcwrmyozxlqkw.supabase.co' || !key) throw new GenerationError('unavailable',503);
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)})}});
  const {data,error} = await client.rpc('radas_v4_hooks_prompts_operation',{p_actor:actor,p_action:action,p_entry:entry ?? null});
  if (error) throw new GenerationError(error.code === '42501' ? 'forbidden' : error.message === 'entry_conflict' ? 'entry_conflict' : error.message === 'invalid_entry' ? 'invalid_request' : 'unavailable',error.code === '42501' ? 403 : error.message === 'entry_conflict' ? 409 : error.message === 'invalid_entry' ? 400 : 503);
  try { return parseEntries(data); } catch { throw new GenerationError('unavailable',503); }
}
