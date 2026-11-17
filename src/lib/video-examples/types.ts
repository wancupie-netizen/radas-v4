export type VideoExample = { id: string; title: string; videoId: string; description: string; sortOrder: number; published: boolean; revision: number };
export type ExamplesSnapshot = { admin: boolean; examples: VideoExample[] };
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// Accept links only; arbitrary iframe HTML, origins and URL credentials never reach the player.
export function youtubeVideoId(value: string): string | null {
  if (!value || value.length > 2048 || value !== value.trim() || /[\s\\]/.test(value)) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    let id: string | null = null;
    if (u.hostname === 'youtu.be' && /^\/[A-Za-z0-9_-]{11}$/.test(u.pathname)) id = u.pathname.slice(1);
    if (['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)) {
      if (u.pathname === '/watch' && u.searchParams.getAll('v').length === 1) id = u.searchParams.get('v');
      else if (/^\/(shorts|embed)\/[A-Za-z0-9_-]{11}$/.test(u.pathname)) id = u.pathname.split('/')[2];
    }
    return id && VIDEO_ID.test(id) ? id : null;
  } catch { return null; }
}
export function validExample(value: unknown): value is VideoExample {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as VideoExample;
  return Object.keys(v).length === 7 && Object.keys(v).every(k => ['id','title','videoId','description','sortOrder','published','revision'].includes(k)) &&
    typeof v.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.id) &&
    typeof v.title === 'string' && v.title === v.title.trim() && v.title.length >= 1 && v.title.length <= 120 &&
    typeof v.description === 'string' && v.description === v.description.trim() && v.description.length <= 240 &&
    typeof v.published === 'boolean' && typeof v.videoId === 'string' && (VIDEO_ID.test(v.videoId) || (!v.published && v.videoId === '')) &&
    Number.isSafeInteger(v.sortOrder) && v.sortOrder >= 0 && v.sortOrder <= 9999 &&
    Number.isSafeInteger(v.revision) && v.revision >= 0 && v.revision <= 2147483646;
}
export function parseExamples(value: unknown): ExamplesSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_examples');
  const v = value as ExamplesSnapshot;
  if (typeof v.admin !== 'boolean' || !Array.isArray(v.examples) || v.examples.length > 100 || !v.examples.every(e => validExample(e) && e.revision > 0 && (v.admin || e.published)) || new Set(v.examples.map(e => e.id)).size !== v.examples.length) throw new Error('invalid_examples');
  return { admin:v.admin, examples:v.examples.map(e => ({id:e.id,title:e.title,videoId:e.videoId,description:e.description,sortOrder:e.sortOrder,published:e.published,revision:e.revision})) };
}
