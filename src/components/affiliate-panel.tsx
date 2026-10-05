'use client';
import './affiliate-panel.css';
import { WorkspaceGreeting } from './workspace-greeting';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CONTENT_TYPES, parseCatalog, validProduct, completeProduct, type Catalog, type Product } from '@/lib/affiliate/types';
import { requestJson, RequestError } from '@/lib/errors/client';
const PAGE_SIZE = 9;
const money = (sen: number | null) => sen === null ? 'Belum diisi' : `RM${(sen/100).toFixed(2)}`;
function blank(): Product { return {id:crypto.randomUUID(),name:'',imageUrl:'',category:'',priceSen:null,commissionSen:null,url:'',reviewedOn:'',contentTypes:[],sourceNotes:'',published:false,revision:0}; }
export function AffiliatePanel({ admin = false, balance, onTopUp, accountName = '' }: { admin?: boolean; accountName?: string; balance?: number; onTopUp?: () => void }) {
  const [catalog,setCatalog] = useState<Catalog | null>(null), [error,setError] = useState(''), [loading,setLoading] = useState(true);
  const [query,setQuery] = useState(''), [category,setCategory] = useState(''), [draft,setDraft] = useState<Product | null>(null), [busy,setBusy] = useState(false);
  const [page,setPage] = useState(1);
  const controller = useRef<AbortController | null>(null), sequence = useRef(0), writing = useRef(false), reading = useRef(false);
  async function refresh(background = false) {
    if (writing.current || (background && reading.current)) return;
    controller.current?.abort(); const c = new AbortController(); controller.current = c; const n = ++sequence.current;
    reading.current = true;
    if(!background){setCatalog(null);setLoading(true);} setError('');
    try { const data = parseCatalog(await requestJson(`/api/affiliate${admin?'?admin=1':''}`,{signal:c.signal})); if(n===sequence.current) setCatalog(data); }
    catch(e) { if(n!==sequence.current || c.signal.aborted) return; setCatalog(null); if(e instanceof RequestError && e.status===401) window.location.assign('/login'); setError(e instanceof RequestError && e.status===403?'Akses admin tidak dibenarkan.':'Senarai produk belum dapat dimuatkan. Semak semula.'); }
    finally { if(n===sequence.current){reading.current=false;setLoading(false);} }
  }
  useEffect(()=>{
    void refresh();
    // Admin catalogue changes through save/delete or explicit refresh. Do not
    // interrupt reading or inline editing when a timer fires or focus changes.
    if(admin) return ()=>{controller.current?.abort();++sequence.current;};
    const visibility = () => { if(document.visibilityState==='hidden'){controller.current?.abort();++sequence.current;reading.current=false;}else void refresh(true); };
    const focus = () => { if(document.visibilityState==='visible') void refresh(true); };
    document.addEventListener('visibilitychange',visibility); window.addEventListener('focus',focus);
    const timer = window.setInterval(()=>{if(document.visibilityState==='visible') void refresh(true);},60000);
    return ()=>{controller.current?.abort();++sequence.current;window.clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',focus);};
  },[admin,balance]); // Recheck access without replacing the visible catalogue during background reads.
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
  const categories=[...new Set(products.map(p=>p.category).filter(Boolean))].sort();
  const filtered=products.filter(p=>(!category || p.category===category) && `${p.name} ${p.category} ${p.contentTypes.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  function submit(e: FormEvent<HTMLFormElement>){e.preventDefault();if(draft)void mutate('save',draft);}
  function edit<K extends keyof Product>(key: K, value: Product[K]){setDraft(p=>p?{...p,[key]:value}:p);}
  const pageCount = Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const currentPage = Math.min(page,pageCount);
  const visibleProducts = filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const editing = !!draft;
  function startEdit(product: Product) {
    if(busy || draft) return;
    setDraft({...product,contentTypes:[...product.contentTypes]});setError('');
  }
  function editorForm() {
    return draft ? <form className="affiliate-editor" onSubmit={submit}><h2>{draft.revision===0?'Tambah':'Edit'} produk</h2><p className="input-help">ID: {draft.id}</p><fieldset disabled={busy}>
      <label>Nama produk<input required maxLength={120} value={draft.name} onChange={e=>edit('name',e.target.value)}/></label>
      <label>Pautan gambar HTTPS (pilihan)<input type="url" placeholder="Akan dikemaskini" maxLength={2048} value={draft.imageUrl} onChange={e=>edit('imageUrl',e.target.value)}/></label>
      <label>Kategori<input required={draft.published} maxLength={60} value={draft.category} onChange={e=>edit('category',e.target.value)}/></label>
      <div className="affiliate-filters"><label>Harga (RM)<input type="number" min="0" max="1000000" step="0.01" required={draft.published} value={draft.priceSen === null ? '' : draft.priceSen/100} onChange={e=>edit('priceSen',e.target.value === '' ? null : Math.round(Number(e.target.value)*100))}/></label><label>Anggaran komisen (RM)<input type="number" min="0" max={draft.priceSen === null ? 1000000 : draft.priceSen/100} step="0.01" required={draft.published} value={draft.commissionSen === null ? '' : draft.commissionSen/100} onChange={e=>edit('commissionSen',e.target.value === '' ? null : Math.round(Number(e.target.value)*100))}/></label></div>
      <label>Link produk / affiliate (pilihan)<input type="url" placeholder="Akan dikemaskini" maxLength={2048} value={draft.url} onChange={e=>edit('url',e.target.value)}/></label>
      <label>Tarikh terakhir disemak<input type="date" required={draft.published} max={new Date().toISOString().slice(0,10)} value={draft.reviewedOn} onChange={e=>edit('reviewedOn',e.target.value)}/></label>
      <fieldset><legend>Cadangan jenis content (wajib sekurang-kurangnya satu untuk terbit)</legend><div className="affiliate-checks">{CONTENT_TYPES.map(t=><label key={t}><input type="checkbox" checked={draft.contentTypes.includes(t)} onChange={e=>edit('contentTypes',e.target.checked?[...draft.contentTypes,t]:draft.contentTypes.filter(x=>x!==t))}/>{t}</label>)}</div></fieldset>
      <label>Catatan sumber (admin sahaja)<textarea maxLength={4000} value={draft.sourceNotes ?? ''} onChange={e=>edit('sourceNotes',e.target.value)}/></label><p className="input-help">Draf boleh disimpan dengan nama sahaja. Lengkapkan medan wajib sebelum terbit. Pautan gambar dan link produk boleh kosong.</p><label className="affiliate-publish"><input type="checkbox" checked={draft.published} disabled={!draft.published && !completeProduct(draft)} onChange={e=>edit('published',e.target.checked)}/>Terbitkan kepada pengguna</label>
      <div className="affiliate-actions"><button className="primary" type="submit">{busy?'Menyimpan…':'Simpan produk'}</button><button type="button" className="secondary" onClick={()=>setDraft(null)}>Batal</button></div>
    </fieldset></form> : null;
  }
  return <section className="affiliate-panel" aria-labelledby="affiliate-title">
    <div className="affiliate-heading">{admin?<div><span className="eyebrow">SUMBER CONTENT</span><h1 id="affiliate-title">Urus Produk<span>.</span></h1><p>Pilih produk dan jenis content yang sesuai untuk video anda.</p></div>:<WorkspaceGreeting name={accountName} affiliate id="affiliate-title"/>}<button className="secondary" disabled={busy} onClick={()=>void refresh()}>Semak semula</button></div>
    {error && <p className="notice" role="alert">{error}</p>}
    {loading ? <p className="notice" role="status">Menyemak akses…</p> : !catalog ? null : !accessible ? <div className="panel affiliate-locked"><h2>Akses Produk Affiliate dikunci</h2><p>Top up bermula RM5 dan tunggu pengesahan admin. Akses tersedia selagi baki kredit masih ada.</p>{onTopUp && <button className="primary" onClick={onTopUp}>Top Up RM5</button>}</div> : <>
      {!admin && catalog.admin && <a className="secondary affiliate-admin-link" href="/admin/products">Urus produk sebagai admin</a>}
      {admin && <button className="primary" disabled={busy || editing} onClick={()=>{if(busy || draft)return;setDraft(blank());setError('');}}>Tambah produk</button>}
      <div className="affiliate-filters"><label>Cari produk<input type="search" disabled={busy || editing} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Nama, kategori atau jenis content"/></label><label>Kategori<select disabled={busy || editing} value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="">Semua kategori</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div>
      {admin && draft && !visibleProducts.some(p=>p.id===draft.id) && <article className="panel affiliate-card affiliate-new-card">{editorForm()}</article>}
      {editing && <p className="input-help">Simpan atau batal edit sebelum menukar halaman, carian atau produk.</p>}
      <p className="input-help">{filtered.length} produk · Harga dan komisen ialah anggaran; semak nilai semasa di platform affiliate.</p>
      {products.length===0 ? <p className="notice">Belum ada produk {admin?'dalam katalog':'yang diterbitkan'}.</p> : filtered.length===0 ? <p className="notice">Tiada produk sepadan. Cuba carian lain atau semua kategori.</p> : <div className="affiliate-grid">{visibleProducts.map(p=><article className={`panel affiliate-card${draft?.id===p.id ? ' affiliate-card-editing' : ''}`} key={p.id}>
        {admin && draft?.id===p.id ? editorForm() : <>
        {/* External images never carry app cookies/referrers. No server fetching of admin URLs. */}
        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" referrerPolicy="no-referrer" width="400" height="300"/> : null}
        <div className="affiliate-card-body"><div className="affiliate-card-heading"><h2>{p.name}</h2>{admin && <span className={`affiliate-status ${p.published?'affiliate-status-live':'affiliate-status-draft'}`}>{p.published?'Diterbitkan':'Draf'}</span>}</div><p className="affiliate-category">{p.category || 'Kategori belum diisi'}</p><dl className="affiliate-metrics"><div><dt>Harga</dt><dd>{money(p.priceSen)}</dd></div><div className="affiliate-commission"><dt>Anggaran komisen</dt><dd>{money(p.commissionSen)}</dd></div></dl>{p.contentTypes.length>0 && <div className="affiliate-tags">{p.contentTypes.map(t=><span key={t}>{t}</span>)}</div>}<p className="input-help">Disemak: {p.reviewedOn ? <time dateTime={p.reviewedOn}>{p.reviewedOn}</time> : 'Belum diisi'}</p>
        {admin ? <>{p.sourceNotes && <details><summary>Catatan sumber</summary><pre className="input-help" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{p.sourceNotes}</pre></details>}<div className="affiliate-actions"><button className="secondary" disabled={busy || editing} onClick={()=>startEdit(p)}>Edit</button><button className="text-button" disabled={busy || editing} onClick={()=>{if(busy || draft)return;if(window.confirm(`Padam ${p.name}?`))void mutate('delete',p);}}>Padam</button></div></> : p.url ? <a className="secondary" href={p.url} target="_blank" rel="noopener noreferrer sponsored">Lihat produk ↗</a> : <p className="input-help">Link produk akan dikemaskini</p>}
        </div></>}</article>)}</div>}
      {filtered.length>0 && <nav className="affiliate-pagination" aria-label="Halaman produk">
        <span className="input-help">{(currentPage-1)*PAGE_SIZE+1}–{Math.min(currentPage*PAGE_SIZE,filtered.length)} daripada {filtered.length} produk</span>
        <div className="affiliate-page-buttons">{Array.from({length:pageCount},(_,i)=>i+1).map(n=><button key={n} type="button" aria-label={`Halaman ${n}`} aria-current={n===currentPage?'page':undefined} disabled={busy || editing} onClick={()=>{if(!busy && !draft)setPage(n);}}>{n}</button>)}</div>
      </nav>}
    </>}
  </section>;
}
