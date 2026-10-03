import Link from 'next/link';

export function Brand({ href = '/', full = false }: { href?: string; full?: boolean }) {
  return <Link href={href} className={`brand ${full ? 'brand-full' : 'brand-compact'}`} aria-label="RADAS halaman utama">
    {full ? <span className="brand-plate"><span className="brand-full-window"><img src="/radas-logo.png" width="1774" height="887" alt="RADAS"/></span></span> : <><span className="brand-symbol" aria-hidden="true"><img src="/radas-logo.png" width="1774" height="887" alt=""/></span><span className="brand-word">RADAS</span></>}
  </Link>;
}
