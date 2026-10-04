export const SUPPORT_URL = 'https://t.me/radasmalaysia';
export type UpdateInput = { id: string; title: string; body: string; published: boolean; revision: number };
export type UpdateEntry = UpdateInput & { publishedAt: string | null; updatedAt: string };
export type UpdatesSnapshot = { admin: boolean; updates: UpdateEntry[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validUpdate(value: unknown): value is UpdateInput {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 const v = value as UpdateInput;
 return Object.keys(v).length === 5 && Object.keys(v).every(k => ['id','title','body','published','revision'].includes(k)) && typeof v.id === 'string' && uuid.test(v.id) && typeof v.title === 'string' && v.title === v.title.trim() && v.title.length >= 1 && v.title.length <= 120 && typeof v.body === 'string' && v.body === v.body.trim() && v.body.length >= 1 && v.body.length <= 5000 && typeof v.published === 'boolean' && Number.isSafeInteger(v.revision) && v.revision >= 0 && v.revision <= 1000000;
}
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
export function parseUpdates(value: unknown): UpdatesSnapshot {
 if (!value || typeof value !== 'object') throw new Error('invalid_updates');
 const v = value as UpdatesSnapshot;
 if (typeof v.admin !== 'boolean' || !Array.isArray(v.updates) || v.updates.length > 200) throw new Error('invalid_updates');
 const ids = new Set<string>();
 const updates = v.updates.map(u => {
  if (!u || !validUpdate({id:u.id,title:u.title,body:u.body,published:u.published,revision:u.revision}) || u.revision < 1 || !date(u.updatedAt) || !(u.publishedAt === null || date(u.publishedAt)) || (u.published && !u.publishedAt) || (!v.admin && !u.published) || ids.has(u.id)) throw new Error('invalid_updates');
  ids.add(u.id);
  return {id:u.id,title:u.title,body:u.body,published:u.published,revision:u.revision,publishedAt:u.publishedAt,updatedAt:u.updatedAt};
 });
 return {admin:v.admin,updates};
}
