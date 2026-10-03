'use client';
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
 return <html lang="ms"><body><main><h1>Paparan belum tersedia</h1><p role="alert">Cuba muatkan paparan semula. Semak status request dan baki sebelum generate atau membayar semula.</p><button type="button" onClick={retry}>Muatkan paparan semula</button><p><a href="/login">Ke halaman login</a></p></main></body></html>;
}
