import { generationLog } from '@/lib/generations/log';
import { createNexabotClient } from '@/lib/nexabot/client';
import { createGenerationStore } from '@/lib/generations/store';
import { createGenerationFlow } from '@/lib/generations/flow';
import { GenerationError } from '@/lib/generations/input';
import { UUID } from '@/lib/generations/types';
import { PRIVATE_HEADERS, errorResponse, verifiedUser, requireGenerationEnabled } from '@/lib/generations/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const started = performance.now();
  let requestId: string | undefined;
  try {
    const userId = await verifiedUser(); requireGenerationEnabled();
    const { id } = await context.params; if (!UUID.test(id)) throw new GenerationError('not_found', 404);
    requestId = id;
    const generation = await createGenerationFlow(createGenerationStore(), createNexabotClient()).status(userId, id);
    return Response.json(generation, { headers: PRIVATE_HEADERS });
  } catch (error) { generationLog('request_status', { requestId, error, durationMs: performance.now() - started }); return errorResponse(error); }
}
