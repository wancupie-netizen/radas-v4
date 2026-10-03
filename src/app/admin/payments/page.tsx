import { redirect } from 'next/navigation';
import { verifiedUser } from '@/lib/generations/http';
import { operation } from '@/lib/payments/service';
import { PaymentPanel } from '@/components/payment-panel';
export const dynamic='force-dynamic';
export default async function Page(){let actor;try{actor=await verifiedUser();}catch{redirect('/login');}if(process.env.RADAS_PAYMENTS_ENABLED!=='true')return <main><p>Bayaran belum diaktifkan.</p><a href="/">Kembali</a></main>;try{await operation(actor,'admin_list');}catch{return <main><p>Akses tidak tersedia.</p><a href="/">Kembali</a></main>;}return <main className="workspace"><a href="/">Kembali ke studio</a><h1>Pengesahan Bayaran</h1><PaymentPanel admin/></main>;}
