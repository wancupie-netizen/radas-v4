'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CONTENT_TYPES, parseCatalog, validProduct, type Catalog, type Product } from '@/lib/affiliate/types';
import { requestJson, RequestError } from '@/lib/errors/client';
const money = (sen: number) => `RM${(sen/100).toFixed(2)}`;
function blank(): Product { return {id:crypto.randomUUID(),name:'',imageUrl:'',category:'',priceSen:0,commissionSen:0,url:'',reviewedOn:new Date().toISOString().slice(0,10),contentTypes:['POV'],published:false,revision:0}; }
export function AffiliatePanel({ admin = false, balance, onTopUp }: { admin?: boolean; balance?: number; onTopUp?: () => void }) {
  const [catalog,setCatalog] = useState<Catalog | null>(null), [error,setError] = useState(''), [loading,setLoading] = useState(true);
  const [query,setQuery] = useState(''), [category,setCategory] = useState(''), [draft,setDraft] = useState<Product | null>(null), [busy,setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null), sequence = useRef(0), writing = useRef(false);
  async function refresh() {
    if (writing.current) return;
    controller.current?.abort(); const c = new AbortController(); controller.current = c; const n = ++sequence.current;
    setCatalog(null); setLoading(true); setError('');
    try { const data = parseCatalog(await requestJson(`/api/affiliate${admin?'?admin=1':''}`,{signal:c.signal})); if(n===sequence.current) setCatalog(data); }
    catch(e) { if(n!==sequence.current || c.signal.aborted) return; if(e instanceof RequestError && e.status===401) window.location.assign('/login'); setError(e instanceof RequestError && e.status===403?'Akses admin tidak dibenarkan.':'Senarai produk belum dapat dimuatkan. Semak semula.'); }
    finally { if(n===sequence.current) setLoading(false); }
  }
  useEffect(()=>{
    void refresh();
    const visibility = () => { if(document.visibilityState==='hidden'){controller.current?.abort();++sequence.current;setCatalog(null);}else void refresh(); };
    const focus = () => { if(document.visibilityState==='visible') void refresh(); };
    document.addEventListener('visibilitychange',visibility); window.addEventListener('focus',focus);
    const timer = window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},60000);
    return ()=>{controller.current?.abort();++sequence.current;window.clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',focus);};
  },[admin,balance]); // Balance changes and returning to this tab recheck server entitlement.
  async function mutate(action: 'save' | 'delete', product: Product) {
    if(writing.current) return;
    if(!validProduct(product)){setError('Semak semua medan, pautan HTTPS, komisen dan tarikh.');return;}
    writing.current=true; setBusy(true); setError(''); controller.current?.abort(); const n=++sequence.current;
    try {
      const data=parseCatalog(await requestJson('/api/affiliate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,product})}));
      if(n===sequence.current){setCatalog(data);setDraft(null);}
    } catch(e) { if(e instanceof RequestError && e.status===401)window.location.assign('/login');setError(e instanceof RequestError && e.status===409?'Produk telah berubah. Semak senarai dan buka semula produk sebelum menyimpan.':'Respons belum dapat dipastikan. Semak senarai dahulu; draf dan ID asal dikekalkan.'); }
    finally { writing.current=false;setBusy(false);setLoading(false); }
  }
  const accessible = !!catalog && catalog.access==='allowed' && (admin || catalog.admin || balance === undefined || balance>0);
  const products = accessible ? catalog.products : [];
  const categories=[...new Set(products.map(p=>p.category))].sort();
  const filtered=products.filter(p=>(!category || p.category===category) && `${p.name} ${p.category} ${p.contentTypes.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  function submit(e: FormEvent<HTMLFormElement>){e.preventDefault();if(draft)void mutate('save',draft);}
  function edit<K extends keyof Product>(key: K, value: Product[K]){setDraft(p=>p?{...p,[key]:value}:p);}
  return <section className="affiliate-panel" aria-labelledby="affiliate-title">
    <div className="affiliate-heading"><div><span className="eyebrow">SUMBER CONTENT</span><h1 id="affiliate-title">{admin?'Urus Produk':'Produk Affiliate'}<span>.</span></h1><p>Pilih produk dan jenis content yang sesuai untuk video anda.</p></div><button className="secondary" disabled={busy} onClick={()=>void refresh()}>Semak semula</button></div>
    {error && <p className="notice" role="alert">{error}</p>}
    {loading ? <p className="notice" role="status">Menyemak akses…</p> : !catalog ? null : !accessible ? <div className="panel affiliate-locked"><h2>Akses Produk Affiliate dikunci</h2><p>Top up bermula RM5 dan tunggu pengesahan admin. Akses tersedia selagi baki kredit masih ada.</p>{onTopUp && <button className="primary" onClick={onTopUp}>Top Up RM5</button>}</div> : <>
      {!admin && catalog.admin && <a className="secondary affiliate-admin-link" href="/admin/products">Urus produk sebagai admin</a>}
      {admin && <button className="primary" disabled={busy} onClick={()=>{setDraft(blank());setError('');}}>Tambah produk</button>}
      <div className="affiliate-filters"><label>Cari produk<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nama, kategori atau jenis content"/></label><label>Kategori<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Semua kategori</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div>
      <p className="input-help">{filtered.length} produk · Harga dan komisen ialah anggaran; semak nilai semasa di platform affiliate.</p>
      {products.length===0 ? <p className="notice">Belum ada produk {admin?'dalam katalog':'yang diterbitkan'}.</p> : filtered.length===0 ? <p className="notice">Tiada produk sepadan. Cuba carian lain atau semua kategori.</p> : <div className="affiliate-grid">{filtered.map(p=><article className="panel affiliate-card" key={p.id}>
        {/* External images never carry app cookies/referrers. No server fetching of admin URLs. */}
        <img src={p.imageUrl} alt={p.name} loading="lazy" referrerPolicy="no-referrer" width="400" height="300"/>
        <div className="affiliate-card-body"><span className="eyebrow">{p.category}</span><h2>{p.name}</h2><dl><div><dt>Harga</dt><dd>{money(p.priceSen)}</dd></div><div><dt>Anggaran komisen</dt><dd>{money(p.commissionSen)}</dd></div></dl><p className="input-help">Cadangan jenis content</p><div className="affiliate-tags">{p.contentTypes.map(t=><span key={t}>{t}</span>)}</div><p className="input-help">Disemak: <time dateTime={p.reviewedOn}>{p.reviewedOn}</time></p>
        {admin ? <><p className="input-help">{p.published?'Diterbitkan':'Draf'}</p><div className="affiliate-actions"><button className="secondary" disabled={busy} onClick={()=>{setDraft({...p,contentTypes:[...p.contentTypes]});setError('');}}>Edit</button><button className="text-button" disabled={busy} onClick={()=>{if(window.confirm(`Padam ${p.name}?`))void mutate('delete',p);}}>Padam</button></div></> : <a className="secondary" href={p.url} target="_blank" rel="noopener noreferrer sponsored">Lihat produk ↗</a>}
        </div></article>)}</div>}
    </>}
    {admin && draft && <form className="panel affiliate-editor" onSubmit={submit}><h2>{draft.revision===0?'Tambah':'Edit'} produk</h2><p className="input-help">ID: {draft.id}</p><fieldset disabled={busy}>
      <label>Nama produk<input required maxLength={120} value={draft.name} onChange={e=>edit('name',e.target.value)}/></label>
      <label>Pautan gambar HTTPS<input type="url" required maxLength={2048} value={draft.imageUrl} onChange={e=>edit('imageUrl',e.target.value)}/></label>
      <label>Kategori<input required maxLength={60} value={draft.category} onChange={e=>edit('category',e.target.value)}/></label>
      <div className="affiliate-filters"><label>Harga (RM)<input type="number" min="0" max="1000000" step="0.01" required value={draft.priceSen/100} onChange={e=>edit('priceSen',Math.round(Number(e.target.value)*100))}/></label><label>Anggaran komisen (RM)<input type="number" min="0" max={draft.priceSen/100} step="0.01" required value={draft.commissionSen/100} onChange={e=>edit('commissionSen',Math.round(Number(e.target.value)*100))}/></label></div>
      <label>Link produk / affiliate<input type="url" required maxLength={2048} value={draft.url} onChange={e=>edit('url',e.target.value)}/></label>
      <label>Tarikh terakhir disemak<input type="date" required max={new Date().toISOString().slice(0,10)} value={draft.reviewedOn} onChange={e=>edit('reviewedOn',e.target.value)}/></label>
      <fieldset><legend>Cadangan jenis content (pilih sekurang-kurangnya satu)</legend><div className="affiliate-checks">{CONTENT_TYPES.map(t=><label key={t}><input type="checkbox" checked={draft.contentTypes.includes(t)} onChange={e=>edit('contentTypes',e.target.checked?[...draft.contentTypes,t]:draft.contentTypes.filter(x=>x!==t))}/>{t}</label>)}</div></fieldset>
      <label className="affiliate-publish"><input type="checkbox" checked={draft.published} onChange={e=>edit('published',e.target.checked)}/>Terbitkan kepada pengguna</label>
      <div className="affiliate-actions"><button className="primary" type="submit">{busy?'Menyimpan…':'Simpan produk'}</button><button type="button" className="secondary" onClick={()=>setDraft(null)}>Tutup draf</button></div>
    </fieldset></form>}
  </section>;
}
