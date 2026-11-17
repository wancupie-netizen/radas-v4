import { createFinalizationClient, finalizationEnabled, finalizationOperation, withVideoState } from '@/lib/finalization/client';
import { parseGeneration } from '@/lib/generations/types';
import { generationLog } from '@/lib/generations/log';
import { requireRequestLimit } from '@/lib/protection/rate-limit';
import { createNexabotClient } from '@/lib/nexabot/client';
import { createGenerationStore } from '@/lib/generations/store';
import { createGenerationFlow } from '@/lib/generations/flow';
import { readGenerationInput } from '@/lib/generations/input';
import { PRIVATE_HEADERS, errorResponse, verifiedUser, sameOrigin, requireGenerationEnabled } from '@/lib/generations/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const started = performance.now();
  let requestId: string | undefined;
  let stage = 'request_auth';
  try {
    const userId = await verifiedUser(); sameOrigin(request); requireGenerationEnabled();
    await requireRequestLimit(userId, 'generation');
    stage = 'request_input';
    const { requestId: parsedId, input, hash } = await readGenerationInput(request);
    requestId = parsedId; stage = 'request_submit';
    const flow = createGenerationFlow(createGenerationStore(), createNexabotClient());
    const generation = await flow.submit(userId, parsedId, input, hash);
    generationLog(stage, { requestId, status: generation.status, durationMs: performance.now() - started });
    return Response.json(await withVideoState(userId, generation), { status: 202, headers: PRIVATE_HEADERS });
  } catch (error) { generationLog(stage, { requestId, error, durationMs: performance.now() - started }); return errorResponse(error); }
}


export async function GET() {
  try {
    const userId = await verifiedUser(); requireGenerationEnabled();
    if (!finalizationEnabled()) return Response.json({ items: [] }, { headers: PRIVATE_HEADERS });
    const result = await finalizationOperation(createFinalizationClient(), 'history', userId);
    if (!Array.isArray(result.items) || result.items.length > 20) throw new Error('invalid_history');
    const items = result.items.map(item => {
      if (!item || typeof item !== 'object') throw new Error('invalid_history');
      const generation = parseGeneration(item.generation);
      if (generation.id !== item.id || generation.status !== 'done' || typeof item.prompt !== 'string' || item.prompt.length > 2000 ||
          !['text','image','ingredients'].includes(item.mode) || !['portrait','landscape'].includes(item.orientation) ||
          !['720','1080'].includes(item.resolution) || typeof item.completedAt !== 'string' || !Number.isFinite(Date.parse(item.completedAt))) throw new Error('invalid_history');
      return { id: item.id, prompt: item.prompt, mode: item.mode, orientation: item.orientation, resolution: item.resolution, completedAt: item.completedAt, generation };
    });
    return Response.json({ items }, { headers: PRIVATE_HEADERS });
  } catch (error) { return errorResponse(error); }
}
