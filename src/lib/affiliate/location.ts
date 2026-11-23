export type CatalogLocation = { page: number; query: string; category: string; onlyDrafts: boolean };
export const CATALOG_PAGE_SIZE = 9;
export type StudioTab = 'video' | 'affiliate' | 'dashboard' | 'hooks-prompts';

export function readStudioTab(url: URL): StudioTab {
 const tab=url.searchParams.get('tab');
 return tab === 'affiliate' || tab === 'dashboard' || tab === 'hooks-prompts' ? tab : 'video';
}

export function writeStudioTab(url: URL, tab: StudioTab): string {
 const next = new URL(url);
 if(tab !== 'video')next.searchParams.set('tab',tab);else next.searchParams.delete('tab');
 return next.pathname + next.search + next.hash;
}

export function readCatalogLocation(url: URL): CatalogLocation {
 const p = url.searchParams;
 const value = p.get('af_page') ?? '';
 const page = /^[1-9]\d{0,2}$/.test(value) ? Number(value) : 1;
 return {
  page: Math.min(page, Math.ceil(500 / CATALOG_PAGE_SIZE)),
  query: (p.get('af_q') ?? '').slice(0,254),
  category: (p.get('af_category') ?? '').slice(0,60),
  onlyDrafts: p.get('af_drafts') === '1',
 };
}

export function writeCatalogLocation(url: URL, state: CatalogLocation): string {
 const next = new URL(url);
 for (const [key, value] of [
  ['af_page', state.page > 1 ? String(state.page) : ''],
  ['af_q', state.query], ['af_category', state.category],
  ['af_drafts', state.onlyDrafts ? '1' : ''],
 ]) {
  if (value) next.searchParams.set(key,value); else next.searchParams.delete(key);
 }
 return next.pathname + next.search + next.hash;
}
