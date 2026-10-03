import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createNexabotClient } from '../nexabot/client';
import { createGenerationStore } from '../generations/store';
import { GenerationError } from '../generations/input';
import { UUID } from '../generations/types';
export const VIDEO_BUCKET = 'radas-v4-videos';
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
type ObjectInfo = { objectPath: string; stored: boolean; sizeBytes: number | null; expiresAt: string };
function unexpired(expiresAt: string) {
  if (Date.now() >= Date.parse(expiresAt)) throw new GenerationError('expired', 410);
}
export function validateMp4(bytes: Uint8Array) {
  // Container header validation; not a claim of full video decoding.
  if (bytes.length < 12 || bytes.length > VIDEO_MAX_BYTES || Buffer.from(bytes.subarray(4, 8)).toString('ascii') !== 'ftyp') throw new GenerationError('video_unavailable');
  const headerSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (headerSize < 12 || headerSize > bytes.length) throw new GenerationError('video_unavailable');
}
export async function readProviderVideo(response: Response, signal: AbortSignal, expiresAt: string): Promise<Uint8Array> {
  const size = response.headers.get('content-length');
  if (!response.ok || !response.body || response.headers.get('content-type')?.split(';')[0].trim() !== 'video/mp4' ||
      (size !== null && (!/^\d+$/.test(size) || Number(size) > VIDEO_MAX_BYTES))) {
    await response.body?.cancel(); throw new GenerationError('video_unavailable');
  }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0; let interrupted = false;
  const abort = () => { interrupted = true; void reader.cancel().catch(() => {}); };
  const timer = setTimeout(abort, 120_000);
  signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  try {
    for (;;) {
      const item = await reader.read();
      if (interrupted) throw new GenerationError('video_unavailable');
      unexpired(expiresAt);
      if (item.done) break;
      total += item.value.byteLength; if (total > VIDEO_MAX_BYTES) throw new GenerationError('video_unavailable');
      chunks.push(item.value);
    }
    if (size !== null && Number(size) !== total) throw new GenerationError('video_unavailable');
    const result = Buffer.concat(chunks, total); validateMp4(result); return result;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); }
}
export function createVideoStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SECRET_KEY;
  if (url !== 'https://fyqvvkpzcwrmyozxlqkw.supabase.co' || !key) throw new GenerationError('unavailable');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
    fetch: async (input, init) => {
      const response = await fetch(input, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(120_000) });
      // Bound SDK download buffering even if an unexpected large object exists.
      if ((init?.method ?? 'GET') === 'GET' && response.body && response.ok) {
        const reader = response.body.getReader(); let total = 0;
        return new Response(new ReadableStream<Uint8Array>({
          async pull(controller) { try { const item = await reader.read(); if (item.done) { controller.close(); return; }
            total += item.value.length; if (total > VIDEO_MAX_BYTES) throw new Error('video_size'); controller.enqueue(item.value);
          } catch { await reader.cancel().catch(() => {}); controller.error(new Error('video_unavailable')); } },
          async cancel() { await reader.cancel(); },
        }), { status: response.status, headers: response.headers });
      }
      return response;
    },
  } });
  const bucket = client.storage.from(VIDEO_BUCKET);
  async function info(action: 'read' | 'mark', userId: string, id: string, size?: number): Promise<ObjectInfo> {
    const { data, error } = await client.rpc('radas_v4_video_object_operation', { p_action: action, p_user_id: userId, p_id: id, p_size: size ?? null });
    if (error) throw new GenerationError('unavailable');
    if (data?.error) { const status = { not_found: 404, expired: 410, not_ready: 409 }[data.error as string]; throw new GenerationError(status ? data.error : 'unavailable', status ?? 503); }
    if (!data || data.objectPath !== `${userId.toLowerCase()}/${id.toLowerCase()}.mp4` || typeof data.stored !== 'boolean' ||
      typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) ||
      (data.stored ? !Number.isSafeInteger(data.sizeBytes) || data.sizeBytes < 12 || data.sizeBytes > VIDEO_MAX_BYTES : data.sizeBytes !== null)) throw new GenerationError('unavailable');
    unexpired(data.expiresAt); return data;
  }
  async function download(path: string): Promise<Uint8Array | null> {
    const { data, error } = await bucket.download(path);
    if (error) { if (String((error as { statusCode?: string }).statusCode) === '404') return null; throw new GenerationError('video_unavailable'); }
    if (!data || data.size > VIDEO_MAX_BYTES || data.type.split(';')[0] !== 'video/mp4') throw new GenerationError('video_unavailable');
    const bytes = new Uint8Array(await data.arrayBuffer()); validateMp4(bytes); return bytes;
  }
  return { async ensure(userId: string, id: string, signal: AbortSignal): Promise<Uint8Array> {
    if (!UUID.test(userId) || !UUID.test(id)) throw new GenerationError('not_found', 404);
    const current = await info('read', userId, id); if (signal.aborted) throw new GenerationError('video_unavailable');
    let bytes = await download(current.objectPath);
    if (!bytes && current.stored) throw new GenerationError('video_unavailable'); // Never recreate a marked missing file.
    if (!bytes) {
      const job = await createGenerationStore().operation('read', userId, id);
      if (job.status !== 'done' || !job.providerJobId) throw new GenerationError('not_ready', 409);
      bytes = await readProviderVideo(await createNexabotClient().downloadVideo(job.providerJobId), signal, current.expiresAt);
      unexpired(current.expiresAt); if (signal.aborted) throw new GenerationError('video_unavailable');
      const { error } = await bucket.upload(current.objectPath, bytes, { contentType: 'video/mp4', cacheControl: '0', upsert: false });
      if (error) {
        // Another request, or a lost upload response, may have committed this immutable object.
        bytes = await download(current.objectPath); if (!bytes) throw new GenerationError('video_unavailable');
      }
    }
    if (signal.aborted) throw new GenerationError('video_unavailable');
    const final = await info(current.stored ? 'read' : 'mark', userId, id, bytes.length);
    if (!final.stored || final.sizeBytes !== bytes.length) throw new GenerationError('video_unavailable');
    return bytes;
  } };
}
