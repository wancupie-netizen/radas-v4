import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/generations/http';
import { UpdatesPanel } from '@/components/updates-panel';
import { Brand } from '@/components/brand';
import { updatesOperation } from '@/lib/updates/service';
export const metadata: Metadata = { title: 'RADAS — Updates & Support' };
export const dynamic = 'force-dynamic';
export default async function Page() {
 let actor: string; try { actor = await verifiedUser(); } catch { redirect('/login'); }
 try { await updatesOperation(actor,'admin_list'); } catch { return <main lang="en" className="workspace"><h1>Access unavailable</h1><a href="/studio">Back to Studio</a></main>; }
 return <main lang="en" className="workspace"><nav className="affiliate-actions"><Brand href="/studio" english/><a href="/studio">← Studio</a><a href="/updates">View user page</a></nav><UpdatesPanel admin/></main>;
}
