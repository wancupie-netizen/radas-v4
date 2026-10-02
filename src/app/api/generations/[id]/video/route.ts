import { createNexabotClient } from '@/lib/nexabot/client';
import { createGenerationStore } from '@/lib/generations/store';
import { GenerationError } from '@/lib/generations/input';
import { UUID } from '@/lib/generations/types';
import { PRIVATE_HEADERS, errorResponse, verifiedUser, requireGenerationEnabled } from '@/lib/generations/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await verifiedUser(); requireGenerationEnabled();
    const { id } = await context.params; if (!UUID.test(id)) throw new GenerationError('not_found', 404);
    const job = await createGenerationStore().operation('read', userId, id);
    if (job.status !== 'done' || !job.providerJobId) throw new GenerationError('not_ready', 409);
    const response = await createNexabotClient().downloadVideo(job.providerJobId);
    const reader = response.body!.getReader(); let bytes = 0; let ended = false; let interrupted = false;
    const finish = () => { ended = true; clearTimeout(timer); request.signal.removeEventListener('abort', abort); };
    const abort = () => { interrupted = true; void reader.cancel(); };
    const timer = setTimeout(abort, 120_000);
    if (request.signal.aborted) abort(); else request.signal.addEventListener('abort', abort, { once: true });
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const item = await reader.read();
          if (interrupted) throw new Error('interrupted');
          if (item.done) { finish(); controller.close(); return; }
          bytes += item.value.length;
          if (bytes > 128 * 1024 * 1024) throw new Error('size');
          controller.enqueue(item.value);
        } catch { if (!ended) { finish(); await reader.cancel(); controller.error(new Error('video_unavailable')); } }
      },
      async cancel() { finish(); await reader.cancel(); },
    });
    return new Response(stream, { headers: { ...PRIVATE_HEADERS, 'Content-Type': 'video/mp4', 'Content-Disposition': `inline; filename="radas-${id}.mp4"` } });
  } catch (error) { return errorResponse(error); }
}
