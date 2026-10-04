import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/generations/http';
import { UpdatesPanel } from '@/components/updates-panel';
import { Brand } from '@/components/brand';
export const metadata: Metadata = { title: 'RADAS — Updates & Support' };
export const dynamic = 'force-dynamic';
export default async function Page() {
 let actor: string; try { actor = await verifiedUser(); } catch { redirect('/login'); }
 return <main className="workspace"><nav className="affiliate-actions"><Brand href="/studio"/><a href="/studio">← Studio</a></nav><UpdatesPanel/></main>;
}
