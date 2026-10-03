export const CONTENT_TYPES = ['POV', 'UGC', 'Demonstrasi', 'Unboxing', 'Review', 'Storytelling', 'Perbandingan'] as const;
export type Product = { id: string; name: string; imageUrl: string; category: string; priceSen: number; commissionSen: number; url: string; reviewedOn: string; contentTypes: string[]; published: boolean; revision: number };
export type Catalog = { admin: boolean; access: 'allowed' | 'locked'; products: Product[] };
export function safeHttps(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || value !== value.trim()) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !!u.hostname && !/[\s\\]/.test(value); } catch { return false; }
}
export function validProduct(p: unknown): p is Product {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  const v = p as Product;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id) &&
    typeof v.name === 'string' && v.name.trim() === v.name && v.name.length >= 1 && v.name.length <= 120 &&
    typeof v.category === 'string' && v.category.trim() === v.category && v.category.length >= 1 && v.category.length <= 60 &&
    safeHttps(v.imageUrl) && safeHttps(v.url) && Number.isSafeInteger(v.priceSen) && v.priceSen >= 0 && v.priceSen <= 100000000 &&
    Number.isSafeInteger(v.commissionSen) && v.commissionSen >= 0 && v.commissionSen <= v.priceSen &&
    typeof v.reviewedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.reviewedOn) && !Number.isNaN(Date.parse(v.reviewedOn)) &&
    new Date(v.reviewedOn).toISOString().slice(0,10) === v.reviewedOn && v.reviewedOn <= new Date().toISOString().slice(0,10) &&
    Array.isArray(v.contentTypes) && v.contentTypes.length >= 1 && v.contentTypes.length <= CONTENT_TYPES.length && new Set(v.contentTypes).size === v.contentTypes.length && v.contentTypes.every(x => CONTENT_TYPES.some(y => y === x)) &&
    typeof v.published === 'boolean' && Number.isSafeInteger(v.revision) && v.revision >= 0;
}
export function parseCatalog(value: unknown): Catalog {
  const v = value as Catalog;
  if (!v || typeof v.admin !== 'boolean' || !['allowed','locked'].includes(v.access) || !Array.isArray(v.products) || v.products.length > 500 || !v.products.every(validProduct) || new Set(v.products.map(x=>x.id)).size !== v.products.length || (v.access === 'locked' && v.products.length !== 0) || (!v.admin && v.products.some(p=>!p.published))) throw new Error('invalid_catalog');
  return { admin: v.admin, access: v.access, products: v.products.map(p=>({id:p.id,name:p.name,imageUrl:p.imageUrl,category:p.category,priceSen:p.priceSen,commissionSen:p.commissionSen,url:p.url,reviewedOn:p.reviewedOn,contentTypes:p.contentTypes,published:p.published,revision:p.revision})) };
}
