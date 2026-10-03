import type { Metadata } from 'next';
import './globals.css';
import localFont from 'next/font/local';
const inter = localFont({src:[{path:'./fonts/Inter-400.woff2',weight:'400',style:'normal'},{path:'./fonts/Inter-500.woff2',weight:'500',style:'normal'},{path:'./fonts/Inter-600.woff2',weight:'600',style:'normal'},{path:'./fonts/Inter-700.woff2',weight:'700',style:'normal'}],variable:'--font-inter',display:'swap'});
export const metadata: Metadata = { title: 'RADAS — Create Video', description: 'Generate video AI. Top up, generate dan download terus.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ms" className={inter.variable}><body>{children}</body></html>;
}
