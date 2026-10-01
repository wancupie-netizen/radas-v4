import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'RADAS — Create Video', description: 'Generate video AI. Top up, generate dan download terus.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ms"><body>{children}</body></html>;
}
