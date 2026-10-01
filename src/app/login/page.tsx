import { AuthForm } from '@/components/auth-form';
import { hasSupabaseConfig } from '@/lib/supabase/settings';
export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ confirmation?: string }> }) {
  const params = await searchParams;
  return <AuthForm mode="login" configured={hasSupabaseConfig()} confirmationFailed={params.confirmation === 'failed'} />;
}
