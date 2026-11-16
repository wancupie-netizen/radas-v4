import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing-page';
export const metadata: Metadata = {
 title: 'RADAS — Generate AI Video Serendah RM8',
 description: 'RM8 untuk 60 video AI. Text to Video dan Image to Video 10 saat. Top up bila perlu, generate dan download terus.',
};
export default function Page() { return <LandingPage />; }
