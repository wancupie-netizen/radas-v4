import { AuthForm } from '@/components/auth-form';
import { hasSupabaseConfig } from '@/lib/supabase/settings';
export const dynamic = 'force-dynamic';
export default function RegisterPage() { return <AuthForm mode="register" configured={hasSupabaseConfig()} />; }
