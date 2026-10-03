import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/generations/http';
import { catalogOperation } from '@/lib/affiliate/service';
import { AffiliatePanel } from '@/components/affiliate-panel';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let actor: string; try { actor = await verifiedUser(); } catch { redirect('/login'); }
  try { await catalogOperation(actor,'admin_list'); } catch { return <main className="workspace"><h1>Akses tidak tersedia</h1><a href="/studio">Kembali ke studio</a></main>; }
  return <main className="workspace"><nav className="affiliate-actions"><a href="/studio">← Studio</a><a href="/admin/payments">Pengesahan bayaran</a></nav><AffiliatePanel admin/></main>;
}
