'use client';
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
 return <main className="workspace"><h1>Paparan belum tersedia</h1><p role="alert">Sila cuba muatkan paparan semula. Jika request video atau bayaran sedang dihantar, semak status dan baki dahulu sebelum membuat request baharu.</p><button type="button" className="primary" onClick={retry}>Muatkan paparan semula</button><p><a href="/login">Ke halaman login</a></p></main>;
}
