export type SoldFields = { soldText?: string; soldCheckedOn?: string };
export type SoldUpdate = { id: string; revision: number; soldText: string; soldCheckedOn: string };
export const SOLD_PATTERN = /^(?:(?:0|[1-9][0-9]*)|[1-9][0-9]{0,2}(?:,[0-9]{3})+|(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?[KkMmBb])[+]?$/;
export function soldToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year','month','day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function validSoldFields(value: unknown): value is SoldFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const hasText = Object.hasOwn(v, 'soldText'), hasDate = Object.hasOwn(v, 'soldCheckedOn');
  if (!hasText && !hasDate) return true; // Legacy products have no sold information.
  if (!hasText || !hasDate || typeof v.soldText !== 'string' || typeof v.soldCheckedOn !== 'string') return false;
  if (v.soldText === '' && v.soldCheckedOn === '') return true;
  return v.soldText.length <= 20 && SOLD_PATTERN.test(v.soldText) && /^\d{4}-\d{2}-\d{2}$/.test(v.soldCheckedOn) &&
    Number.isFinite(Date.parse(v.soldCheckedOn)) && new Date(v.soldCheckedOn).toISOString().slice(0,10) === v.soldCheckedOn && v.soldCheckedOn <= soldToday();
}
export function validSoldUpdate(value: unknown): value is SoldUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 4 && Object.keys(v).every(key => ['id','revision','soldText','soldCheckedOn'].includes(key)) &&
    typeof v.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id) &&
    Number.isSafeInteger(v.revision) && Number(v.revision) >= 0 && Number(v.revision) <= 2147483646 &&
    Object.hasOwn(v, 'soldText') && Object.hasOwn(v, 'soldCheckedOn') && validSoldFields(v);
}
