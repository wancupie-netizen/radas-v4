import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/generations/http';
import { examplesOperation } from '@/lib/video-examples/service';
import { VideoExamplesAdmin } from '@/components/video-examples-admin';
import { Brand } from '@/components/brand';
export const metadata: Metadata = { title:'RADAS — Manage Video Examples' };
export const dynamic = 'force-dynamic';
export default async function Page() {
  let actor: string; try { actor=await verifiedUser(); } catch { redirect('/login'); }
  try { await examplesOperation(actor,'admin_list'); } catch { return <main lang="en" className="workspace"><h1>Access unavailable</h1><a href="/studio?tab=dashboard">Back to Dashboard</a></main>; }
  return <main lang="en" className="workspace"><nav className="affiliate-actions"><Brand href="/studio?tab=dashboard" english/><a href="/studio?tab=dashboard">← Dashboard</a></nav><VideoExamplesAdmin/></main>;
}
