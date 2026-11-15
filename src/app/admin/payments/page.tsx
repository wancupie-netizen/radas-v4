import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/generations/http';
import { operation } from '@/lib/payments/service';
import { AdminPayments } from '@/components/admin-payments';
export const dynamic='force-dynamic';
export default async function Page(){let actor;try{actor=await verifiedUser();}catch{redirect('/login');}if(process.env.RADAS_PAYMENTS_ENABLED!=='true')return <main lang="en"><p>Payments are not enabled.</p><a href="/studio">Back</a></main>;try{await operation(actor,'admin_list');}catch{return <main lang="en"><p>Access unavailable.</p><a href="/studio">Back</a></main>;}return <main lang="en" className="workspace"><a href="/studio">Back to Studio</a><h1>Payment Verification</h1><AdminPayments/></main>;}
