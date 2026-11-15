'use client';
import './affiliate-panel.css';
import { WorkspaceGreeting } from './workspace-greeting';
import { ProductPromptTemplates } from './product-prompt-templates';
import { contentTypeLabel } from '@/lib/affiliate/labels';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CONTENT_TYPES, parseCatalog, validProduct, completeProduct, type Catalog, type Product } from '@/lib/affiliate/types';
import { requestJson, RequestError } from '@/lib/errors/client';
import { CATALOG_PAGE_SIZE as PAGE_SIZE, readCatalogLocation, writeCatalogLocation } from '@/lib/affiliate/location';
const money = (sen: number | null) => sen === null ? "Not provided" : `RM${(sen/100).toFixed(2)}`;
function blank(): Product { return {id:crypto.randomUUID(),name:'',imageUrl:'',category:'',priceSen:null,commissionSen:null,url:'',reviewedOn:'',contentTypes:[],sourceNotes:'',published:false,revision:0}; }
function ProductImage({ product }: { product: Product }) {
  const [failed,setFailed] = useState(false);
  return <div className="affiliate-product-image">
    {product.imageUrl && !failed ? <img src={product.imageUrl} alt={product.name} loading="lazy" referrerPolicy="no-referrer" width="400" height="400" onError={()=>setFailed(true)}/> : <div className="affiliate-image-placeholder">
      <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg>
      <span>{product.imageUrl ? "The image could not be loaded" : "No image uploaded yet"}</span>
    </div>}
  </div>;
}
export function AffiliatePanel({ admin = false, accountName = '' }: { admin?: boolean; accountName?: string; }) {
  const [catalog,setCatalog] = useState<Catalog | null>(null), [error,setError] = useState(''), [loading,setLoading] = useState(true);
  const [query,setQuery] = useState(''), [category,setCategory] = useState(''), [draft,setDraft] = useState<Product | null>(null), [busy,setBusy] = useState(false);
  const [page,setPage] = useState(1);
  const [onlyDrafts,setOnlyDrafts] = useState(false);
  const [locationReady,setLocationReady] = useState(false), [addedId,setAddedId] = useState('');
  const controller = useRef<AbortController | null>(null), sequence = useRef(0), writing = useRef(false), reading = useRef(false);
  useEffect(()=>{
    const restore=()=>{
      const state=readCatalogLocation(new URL(window.location.href));
      setQuery(state.query);setCategory(state.category);setPage(state.page);setOnlyDrafts(admin && state.onlyDrafts);
      setLocationReady(true);
    };
    restore();window.addEventListener('popstate',restore);
    return ()=>window.removeEventListener('popstate',restore);
  },[admin]);
  async function refresh(background = false) {
    if (writing.current || (background && reading.current)) return;
    controller.current?.abort(); const c = new AbortController(); controller.current = c; const n = ++sequence.current;
    reading.current = true;
    if(!background){setCatalog(null);setLoading(true);} setError('');
    try { const data = parseCatalog(await requestJson(`/api/affiliate${admin?'?admin=1':''}`,{signal:c.signal})); if(n===sequence.current) setCatalog(data); }
    catch(e) { if(n!==sequence.current || c.signal.aborted) return; setCatalog(null); if(e instanceof RequestError && e.status===401) window.location.assign('/login'); setError(e instanceof RequestError && e.status===403?"Admin access denied.":"The product list could not be loaded. Please refresh."); }
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
  },[admin]);
  async function mutate(action: 'save' | 'delete', product: Product) {
    if(writing.current) return;
    if(!validProduct(product)){setError("Check all fields, HTTPS links, commission and dates.");return;}
    writing.current=true; setBusy(true); setError(''); controller.current?.abort(); const n=++sequence.current;
    try {
      const data=parseCatalog(await requestJson('/api/affiliate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,product})}));
      if(n===sequence.current){
        setCatalog(data);setDraft(null);
        if(action==='save' && product.revision===0 && data.products.some(p=>p.id===product.id)) {
          setQuery('');setCategory('');setOnlyDrafts(false);setPage(1);setAddedId(product.id);
        }
      }
    } catch(e) { if(e instanceof RequestError && e.status===401)window.location.assign('/login');setError(e instanceof RequestError && e.status===409?"This product has changed. Refresh the list and reopen the product before saving.":"The response has not yet been confirmed. Check the list first; your draft and original ID have been retained."); }
    finally { writing.current=false;setBusy(false);setLoading(false); }
  }
  const accessible = !!catalog && catalog.access==='allowed';
  const products = accessible ? catalog.products : [];
  const categories=[...new Set(products.map(p=>p.category).filter(Boolean))].sort();
  const draftCount = products.filter(p=>!p.published).length;
  const filtered=products.filter(p=>(!admin || !onlyDrafts || !p.published) && (!category || p.category===category) && `${p.name} ${p.category} ${p.contentTypes.join(' ')} ${p.contentTypes.map(contentTypeLabel).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  function submit(e: FormEvent<HTMLFormElement>){e.preventDefault();if(draft)void mutate('save',draft);}
  function edit<K extends keyof Product>(key: K, value: Product[K]){setDraft(p=>p?{...p,[key]:value}:p);}
  const pageCount = Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const currentPage = Math.min(page,pageCount);
  useEffect(()=>{
    if(!locationReady)return;
    // Do not collapse a restored page while the catalogue is still loading.
    const nextPage=catalog ? currentPage : page;
    const next=writeCatalogLocation(new URL(window.location.href),{page:nextPage,query,category,onlyDrafts:admin && onlyDrafts});
    if(next!==window.location.pathname+window.location.search+window.location.hash)window.history.replaceState(window.history.state,'',next);
    if(catalog && page!==currentPage)setPage(currentPage);
  },[admin,locationReady,catalog,currentPage,page,query,category,onlyDrafts]);
  useEffect(()=>{
    if(!addedId)return;
    document.getElementById(`affiliate-product-${addedId}`)?.focus();
    const timer=window.setTimeout(()=>setAddedId(''),6000);
    return ()=>window.clearTimeout(timer);
  },[addedId]);
  const visibleProducts = filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  const editing = !!draft;
  function changePage(nextPage: number) {
    if(busy || draft || nextPage===currentPage)return;
    if(!admin) {
      const next=writeCatalogLocation(new URL(window.location.href),{page:nextPage,query,category,onlyDrafts:false});
      // User pagination adds history; restoration, filtering and page clamping still replace it.
      if(next!==window.location.pathname+window.location.search+window.location.hash)window.history.pushState(window.history.state,'',next);
    }
    setPage(nextPage);
  }
  function startEdit(product: Product) {
    if(busy || draft) return;
    setDraft({...product,contentTypes:[...product.contentTypes]});setError('');
  }
  function editorForm() {
    return draft ? <form className="affiliate-editor" onSubmit={submit}><h2>{draft.revision===0?"Add":'Edit'} product</h2><p className="input-help">ID: {draft.id}</p><fieldset disabled={busy}>
      <label>Product name<input required maxLength={120} value={draft.name} onChange={e=>edit('name',e.target.value)}/></label>
      <label>HTTPS image URL (optional)<input type="url" placeholder="To be updated" maxLength={2048} value={draft.imageUrl} onChange={e=>edit('imageUrl',e.target.value)}/></label>
      <label>Category<input required={draft.published} maxLength={60} value={draft.category} onChange={e=>edit('category',e.target.value)}/></label>
      <div className="affiliate-filters"><label>Price (RM)<input type="number" min="0" max="1000000" step="0.01" required={draft.published} value={draft.priceSen === null ? '' : draft.priceSen/100} onChange={e=>edit('priceSen',e.target.value === '' ? null : Math.round(Number(e.target.value)*100))}/></label><label>Estimated commission (RM)<input type="number" min="0" max={draft.priceSen === null ? 1000000 : draft.priceSen/100} step="0.01" required={draft.published} value={draft.commissionSen === null ? '' : draft.commissionSen/100} onChange={e=>edit('commissionSen',e.target.value === '' ? null : Math.round(Number(e.target.value)*100))}/></label></div>
      <label>Product / affiliate link (optional)<input type="url" placeholder="To be updated" maxLength={2048} value={draft.url} onChange={e=>edit('url',e.target.value)}/></label>
      <label>Last checked date<input type="date" required={draft.published} max={new Date().toISOString().slice(0,10)} value={draft.reviewedOn} onChange={e=>edit('reviewedOn',e.target.value)}/></label>
      <fieldset><legend>Suggested content types (at least one required to publish)</legend><div className="affiliate-checks">{CONTENT_TYPES.map(t=><label key={t}><input type="checkbox" checked={draft.contentTypes.includes(t)} onChange={e=>edit('contentTypes',e.target.checked?[...draft.contentTypes,t]:draft.contentTypes.filter(x=>x!==t))}/>{contentTypeLabel(t)}</label>)}</div></fieldset>
      <ProductPromptTemplates name={draft.name} contentTypes={draft.contentTypes} preview/>
      <label>Source notes (admin only)<textarea maxLength={4000} value={draft.sourceNotes ?? ''} onChange={e=>edit('sourceNotes',e.target.value)}/></label><p className="input-help">Drafts can be saved with a name only. Complete the required fields before publishing. Image and product links are optional.</p><label className="affiliate-publish"><input type="checkbox" checked={draft.published} disabled={!draft.published && !completeProduct(draft)} onChange={e=>edit('published',e.target.checked)}/>Publish to users</label>
      <div className="affiliate-actions"><button className="primary" type="submit">{busy?"Saving…":"Save product"}</button><button type="button" className="secondary" onClick={()=>setDraft(null)}>Cancel</button></div>
    </fieldset></form> : null;
  }
  return <section className="affiliate-panel" aria-labelledby="affiliate-title">
    <div className="affiliate-heading">{admin?<div><span className="eyebrow">CONTENT RESOURCES</span><h1 id="affiliate-title">Manage Products<span>.</span></h1><p>Choose a product and content type for your video.</p></div>:<WorkspaceGreeting name={accountName} affiliate id="affiliate-title"/>}<button className="secondary" disabled={busy} onClick={()=>void refresh()}>Refresh</button></div>
    {error && <p className="notice" role="alert">{error}</p>}
    {addedId && <p className="input-help" role="status">New product added successfully. It is shown at the top of the list.</p>}
    {loading ? <p className="notice" role="status">Loading products…</p> : !catalog ? null : !accessible ? <p className="notice">The product list could not be loaded. Please refresh.</p> : <>
      {!admin && catalog.admin && <a className="secondary affiliate-admin-link" href="/admin/products">Manage products as admin</a>}
      {admin && <div className="affiliate-toolbar"><button className="primary" disabled={busy || editing} onClick={()=>{if(busy || draft)return;setDraft(blank());setError('');}}>Add product</button>
      <div className="affiliate-actions" role="group" aria-label="Product publishing status">
        <button type="button" className={onlyDrafts?'secondary':'primary'} aria-pressed={!onlyDrafts} disabled={busy || editing} onClick={()=>{setOnlyDrafts(false);setPage(1);}}>All ({products.length})</button>
        <button type="button" className={onlyDrafts?'primary':'secondary'} aria-pressed={onlyDrafts} disabled={busy || editing} onClick={()=>{setOnlyDrafts(true);setPage(1);}}>Unpublished ({draftCount})</button>
      </div></div>}
      <div className="affiliate-filters"><label>Search products<input type="search" maxLength={254} disabled={busy || editing} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Name, category or content type"/></label><label>Category<select disabled={busy || editing} value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div>
      {admin && draft && !visibleProducts.some(p=>p.id===draft.id) && <article className="panel affiliate-card affiliate-new-card">{editorForm()}</article>}
      {editing && <p className="input-help">Save or cancel your edits before changing the page, search or product.</p>}
      <p className="input-help">{filtered.length} products · Prices and commissions are estimates; check current figures on the affiliate platform.</p>
      {products.length===0 ? <p className="notice">{admin?"No products in the catalogue yet.":"No published products yet."}</p> : filtered.length===0 ? <p className="notice">No matching products. Try a different search or filter.</p> : <div className="affiliate-grid">{visibleProducts.map(p=><article id={`affiliate-product-${p.id}`} tabIndex={addedId===p.id?-1:undefined} className={`panel affiliate-card${draft?.id===p.id ? ' affiliate-card-editing' : ''}${addedId===p.id ? ' affiliate-card-added' : ''}`} key={p.id}>
        {admin && draft?.id===p.id ? editorForm() : <>
        {/* External images never carry app cookies/referrers. No server fetching of admin URLs. */}
        <ProductImage key={p.imageUrl} product={p}/>
        <div className="affiliate-card-body"><div className="affiliate-card-heading"><h2 title={p.name}>{p.name}</h2>{admin && <span className={`affiliate-status ${p.published?'affiliate-status-live':'affiliate-status-draft'}`}>{p.published?"Published":"Draft"}</span>}</div><p className="affiliate-category">{p.category || "Category not provided"}</p><dl className="affiliate-metrics"><div><dt>Price</dt><dd>{money(p.priceSen)}</dd></div><div className="affiliate-commission"><dt>Estimated commission</dt><dd>{money(p.commissionSen)}</dd></div></dl>{p.contentTypes.length>0 && <div className="affiliate-tags">{p.contentTypes.map(t=><span key={t}>{contentTypeLabel(t)}</span>)}</div>}<p className="input-help affiliate-reviewed">Checked: {p.reviewedOn ? <time dateTime={p.reviewedOn}>{p.reviewedOn}</time> : "Not provided"}</p>
        <ProductPromptTemplates name={p.name} contentTypes={p.contentTypes}/>
        {admin ? <>{p.sourceNotes && <details><summary>Source notes</summary><pre className="input-help" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{p.sourceNotes}</pre></details>}<div className="affiliate-actions"><button className="secondary" disabled={busy || editing} onClick={()=>startEdit(p)}>Edit</button><button className="text-button" disabled={busy || editing} onClick={()=>{if(busy || draft)return;if(window.confirm(`Delete ${p.name}?`))void mutate('delete',p);}}>Delete</button></div></> : p.url ? <a className="secondary" href={p.url} target="_blank" rel="noopener noreferrer sponsored">View product ↗</a> : <p className="input-help">Product link to be updated</p>}
        </div></>}</article>)}</div>}
      {filtered.length>0 && <nav className="affiliate-pagination" aria-label="Product pages">
        <span className="input-help">{(currentPage-1)*PAGE_SIZE+1}–{Math.min(currentPage*PAGE_SIZE,filtered.length)} of {filtered.length} products</span>
        <div className="affiliate-page-buttons">{Array.from({length:pageCount},(_,i)=>i+1).map(n=><button key={n} type="button" aria-label={`Page ${n}`} aria-current={n===currentPage?'page':undefined} disabled={busy || editing} onClick={()=>changePage(n)}>{n}</button>)}</div>
      </nav>}
    </>}
  </section>;
}
