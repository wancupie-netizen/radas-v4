export const CONTENT_TYPES = ['POV', 'UGC', 'Demonstrasi', 'Unboxing', 'Review', 'Storytelling', 'Perbandingan'] as const;
export type Product = { id: string; name: string; imageUrl: string; category: string; priceSen: number | null; commissionSen: number | null; url: string; reviewedOn: string; contentTypes: string[]; published: boolean; revision: number; sourceNotes?: string };
export type Catalog = { admin: boolean; access: 'allowed' | 'locked'; products: Product[] };
export function safeHttps(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || value !== value.trim()) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !!u.hostname && !/[\s\\]/.test(value); } catch { return false; }
}
const textField = (v: unknown, max: number, empty: boolean) => typeof v === 'string' && v.trim() === v && v.length <= max && (empty || v.length > 0);
const amount = (v: unknown, empty: boolean): v is number | null => (empty && v === null) || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 100000000);
function validDate(v: unknown, empty: boolean): boolean {
  return (empty && v === '') || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v && v <= new Date().toISOString().slice(0,10));
}
function validFields(p: unknown, empty: boolean): p is Product {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  const v = p as Product;
  return typeof v.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id) &&
    textField(v.name,120,false) && textField(v.category,60,empty) &&
    (v.imageUrl === '' || safeHttps(v.imageUrl)) && (v.url === '' || safeHttps(v.url)) &&
    amount(v.priceSen,empty) && amount(v.commissionSen,empty) && (v.priceSen === null || v.commissionSen === null || v.commissionSen <= v.priceSen) &&
    validDate(v.reviewedOn,empty) && Array.isArray(v.contentTypes) && v.contentTypes.length >= (empty ? 0 : 1) && v.contentTypes.length <= CONTENT_TYPES.length &&
    new Set(v.contentTypes).size === v.contentTypes.length && v.contentTypes.every(x => CONTENT_TYPES.some(y => y === x)) &&
    typeof v.published === 'boolean' && Number.isSafeInteger(v.revision) && v.revision >= 0 && v.revision <= 2147483646 &&
    (!Object.hasOwn(v,'sourceNotes') || (typeof v.sourceNotes === 'string' && v.sourceNotes.length <= 4000));
}
export function completeProduct(p: unknown): p is Product { return validFields(p,false); }
export function validProduct(p: unknown): p is Product { return validFields(p,(p as Product | null)?.published === false); }
export function parseCatalog(value: unknown): Catalog {
  const v = value as Catalog;
  if (!v || typeof v.admin !== 'boolean' || !['allowed','locked'].includes(v.access) || !Array.isArray(v.products) || v.products.length > 500 || !v.products.every(validProduct) || new Set(v.products.map(x=>x.id)).size !== v.products.length || (v.access === 'locked' && v.products.length !== 0) || (!v.admin && v.products.some(p=>!p.published))) throw new Error('invalid_catalog');
  return { admin: v.admin, access: v.access, products: v.products.map(p=>({id:p.id,name:p.name,imageUrl:p.imageUrl,category:p.category,priceSen:p.priceSen,commissionSen:p.commissionSen,url:p.url,reviewedOn:p.reviewedOn,contentTypes:p.contentTypes,published:p.published,revision:p.revision,...(Object.hasOwn(p,'sourceNotes')?{sourceNotes:p.sourceNotes}:{})})) };
}
