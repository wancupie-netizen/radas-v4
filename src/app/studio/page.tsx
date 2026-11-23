import type { Metadata } from 'next';
import { getCreditSnapshot } from '@/lib/credits/snapshot';
import { redirect } from 'next/navigation';
import { accountDisplayName } from '@/components/workspace-greeting';
import { VideoWorkspace } from '@/components/video-workspace';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/settings';
type Search = Promise<{ [key:string]:string|string[]|undefined }>;
export async function generateMetadata({ searchParams }: { searchParams:Search }): Promise<Metadata> {
  const {tab}=await searchParams;
  return {title:tab==='dashboard'?'RADAS — Dashboard':tab==='affiliate'?'RADAS — Affiliate Products':tab==='hooks-prompts'?'RADAS — Hook & Prompt':'RADAS — Create Video'};
}
export const dynamic = 'force-dynamic';
export default async function Page({searchParams}: {searchParams:Search}) {
  if (!hasSupabaseConfig()) redirect('/login');
  const supabase = await createClient();
  let user;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch { /* Fail closed if verification is unavailable. */ }
  if (!user) redirect('/login');
  const credits = await getCreditSnapshot(supabase);
  const {tab}=await searchParams;
  const initialTab=tab==='dashboard'||tab==='affiliate'||tab==='hooks-prompts'?tab:'video';
  return <VideoWorkspace initialTab={initialTab} accountEmail={user.email || ''} accountName={accountDisplayName(user.user_metadata?.name)} initialCredits={credits} generationEnabled={process.env.RADAS_GENERATION_ENABLED === 'true'} />;
}
