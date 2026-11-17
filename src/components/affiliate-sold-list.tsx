'use client';
import { useState } from 'react';
import { soldToday, validSoldUpdate, type SoldUpdate } from '@/lib/affiliate/sold';
import type { Product } from '@/lib/affiliate/types';

export function ProductSold({ product }: { product: Product }) {
  return product.soldText && product.soldCheckedOn ? <div className="affiliate-sold-badge"><strong>{product.soldText} sold</strong><span>As of <time dateTime={product.soldCheckedOn}>{product.soldCheckedOn}</time></span></div> : null;
}

export function AffiliateSoldList({ products, busy, onSave, onEditingChange }: {
  products: Product[]; busy: boolean; onSave: (value: SoldUpdate) => Promise<boolean>; onEditingChange: (editing: boolean) => void;
}) {
  const [draft, setDraft] = useState<SoldUpdate | null>(null);
  function cancel() { if (busy) return; setDraft(null); onEditingChange(false); }
  function edit(product: Product) {
    if (busy || draft) return;
    setDraft({ id:product.id, revision:product.revision, soldText:product.soldText ?? '', soldCheckedOn:product.soldText ? product.soldCheckedOn ?? '' : soldToday() });
    onEditingChange(true);
  }
  async function save() {
    if (!draft || busy || !validSoldUpdate(draft)) return;
    const confirmed = await onSave(draft);
    if (confirmed) { setDraft(null); onEditingChange(false); }
  }
  return <div className="affiliate-sold-list">
    <p className="input-help">Enter the sold figure shown on the product listing, such as 250, 1.2K or 10K+. Keep its original format and record the date you checked it.</p>
    <div className="affiliate-sold-scroll"><table className="affiliate-sold-table">
      <caption className="sr-only">Update sold figures for existing affiliate products</caption>
      <thead><tr><th scope="col">Product</th><th scope="col">Sold</th><th scope="col">Date checked</th><th scope="col">Actions</th></tr></thead>
      <tbody>{products.map(product => {
        const active = draft?.id === product.id;
        return <tr key={product.id}>
          <th scope="row"><strong>{product.name}</strong><span className="input-help">{product.category || 'Category not provided'} · {product.published ? 'Published' : 'Draft'}</span></th>
          <td data-label="Sold">{active ? <input aria-label={`Sold for ${product.name}`} type="text" maxLength={20} autoComplete="off" placeholder="e.g. 1.2K+" disabled={busy} value={draft.soldText} onChange={event => {
            const value = event.target.value;
            setDraft(previous => previous ? { ...previous, soldText:value, soldCheckedOn:value ? previous.soldCheckedOn || soldToday() : '' } : previous);
          }}/> : product.soldText || <span className="input-help">Not provided</span>}</td>
          <td data-label="Date checked">{active ? <input aria-label={`Sold date for ${product.name}`} type="date" max={soldToday()} disabled={busy} value={draft.soldCheckedOn} onChange={event => setDraft(previous => previous ? { ...previous, soldCheckedOn:event.target.value } : previous)}/> : product.soldCheckedOn ? <time dateTime={product.soldCheckedOn}>{product.soldCheckedOn}</time> : <span className="input-help">—</span>}</td>
          <td data-label="Actions">{active ? <div className="affiliate-sold-actions"><button type="button" className="primary" disabled={busy || !validSoldUpdate(draft)} onClick={() => void save()}>{busy ? 'Saving…' : 'Save sold'}</button><button type="button" className="secondary" disabled={busy} onClick={cancel}>Cancel</button><button type="button" className="text-button" disabled={busy} onClick={() => setDraft(previous => previous ? { ...previous, soldText:'', soldCheckedOn:'' } : previous)}>Clear sold</button></div> : <button type="button" className="secondary" disabled={busy || !!draft} onClick={() => edit(product)} aria-label={`Update sold for ${product.name}`}>Update sold</button>}</td>
        </tr>;
      })}</tbody>
    </table></div>
    {draft && <p className="input-help" role="status">Save or cancel before changing product or page. Clear sold removes both the figure and its checked date. Failed saves retain your entry for retry.</p>}
  </div>;
}
