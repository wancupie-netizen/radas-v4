import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/generations/http';
import { hooksOperation } from '@/lib/hooks-prompts/service';
import { HooksPromptsAdmin } from '@/components/hooks-prompts-admin';
import { Brand } from '@/components/brand';
export const metadata: Metadata = { title:'RADAS — Manage Hook & Prompt' };
export const dynamic = 'force-dynamic';
export default async function Page() {
  let actor: string; try { actor=await verifiedUser(); } catch { redirect('/login'); }
  try { await hooksOperation(actor,'admin_list'); } catch { return <main lang="en" className="workspace"><h1>Access unavailable</h1><a href="/studio?tab=hooks-prompts">Back to Hook & Prompt</a></main>; }
  return <main lang="en" className="workspace"><nav className="affiliate-actions"><Brand href="/studio?tab=hooks-prompts" english/><a href="/studio?tab=hooks-prompts">Hook & Prompt</a></nav><HooksPromptsAdmin/></main>;
}
