import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { validatePrompt, validateImageFile, VIDEO_INPUT } from '../video/input';
import type { VideoRequest } from '../nexabot/client';
import { UUID } from './types';
export class GenerationError extends Error {
  constructor(public readonly code: string, public readonly status = 503, public readonly activeId?: string) { super(code); }
}
export async function readGenerationInput(request: Request) {
  if (!(request.headers.get('content-type') ?? '').startsWith('multipart/form-data;')) throw new GenerationError('invalid_input', 400);
  const maximum = VIDEO_INPUT.maxImageBytes + 32 * 1024;
  const reader = request.body?.getReader(); if (!reader) throw new GenerationError('invalid_input', 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length;
      if (size > maximum) throw new GenerationError('image_too_large', 413); chunks.push(item.value); }
  } finally { await reader.cancel(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': request.headers.get('content-type')! } }).formData(); }
  catch { throw new GenerationError('invalid_input', 400); }
  const fields = ['requestId', 'mode', 'prompt', 'orientation', 'resolution', 'image'];
  for (const name of form.keys()) if (!fields.includes(name) || form.getAll(name).length !== 1) throw new GenerationError('invalid_input', 400);
  const requestId = form.get('requestId'); const mode = form.get('mode'); const prompt = form.get('prompt');
  const orientation = form.get('orientation'); const resolution = form.get('resolution');
  if (typeof requestId !== 'string' || !UUID.test(requestId) || typeof prompt !== 'string' || validatePrompt(prompt) ||
    (mode !== 'text' && mode !== 'image') || (orientation !== 'portrait' && orientation !== 'landscape') || (resolution !== '720' && resolution !== '1080')) throw new GenerationError('invalid_input', 400);
  const image = form.get('image'); let imageDataUri: string | undefined; let imageHash = '';
  if (mode === 'text' && image !== null) throw new GenerationError('invalid_input', 400);
  if (mode === 'image') {
    if (!(image instanceof File) || await validateImageFile(image)) throw new GenerationError('invalid_image', 400);
    const bytes = Buffer.from(await image.arrayBuffer());
    try {
      const decoder = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning', animated: false });
      const metadata = await decoder.metadata();
      if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1 || !['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw new Error('invalid');
      // Full decode, not merely a valid header. The raw pixels are not persisted.
      await decoder.raw().toBuffer();
    } catch { throw new GenerationError('invalid_image', 400); }
    imageDataUri = `data:${image.type};base64,${bytes.toString('base64')}`;
    imageHash = createHash('sha256').update(bytes).digest('hex');
  }
  const input: VideoRequest = mode === 'text' ? { mode, prompt: prompt.trim(), orientation, resolution } :
    { mode, prompt: prompt.trim(), orientation, resolution, imageDataUri: imageDataUri! };
  const hash = createHash('sha256').update(JSON.stringify({ mode, prompt: input.prompt, orientation, resolution, imageHash })).digest('hex');
  return { requestId: requestId.toLowerCase(), input, hash };
}
