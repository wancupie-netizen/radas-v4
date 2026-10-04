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
 try { await updatesOperation(actor,'admin_list'); } catch { return <main className="workspace"><h1>Akses tidak tersedia</h1><a href="/studio">Kembali ke studio</a></main>; }
 return <main className="workspace"><nav className="affiliate-actions"><Brand href="/studio"/><a href="/studio">← Studio</a><a href="/updates">Lihat halaman pengguna</a></nav><UpdatesPanel admin/></main>;
}
