import { getCreditSnapshot } from '@/lib/credits/snapshot';
import { redirect } from 'next/navigation';
import { VideoWorkspace } from '@/components/video-workspace';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseConfig } from '@/lib/supabase/settings';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (!hasSupabaseConfig()) redirect('/login');
  const supabase = await createClient();
  let user;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch { /* Fail closed if verification is unavailable. */ }
  if (!user) redirect('/login');
  const credits = await getCreditSnapshot(supabase);
  return <VideoWorkspace accountEmail={user.email || ''} initialCredits={credits} />;
}
