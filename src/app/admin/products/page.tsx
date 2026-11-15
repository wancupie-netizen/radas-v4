import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/generations/http';
import { catalogOperation } from '@/lib/affiliate/service';
import { AffiliatePanel } from '@/components/affiliate-panel';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let actor: string; try { actor = await verifiedUser(); } catch { redirect('/login'); }
  try { await catalogOperation(actor,'admin_list'); } catch { return <main lang="en" className="workspace"><h1>Access unavailable</h1><a href="/studio">Back to Studio</a></main>; }
  return <main lang="en" className="workspace"><nav className="affiliate-actions"><a href="/studio?tab=affiliate">← Affiliate Products</a></nav><AffiliatePanel admin/></main>;
}
