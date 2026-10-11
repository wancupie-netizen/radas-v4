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
    return Response.json(generation, { status: 202, headers: PRIVATE_HEADERS });
  } catch (error) { generationLog(stage, { requestId, error, durationMs: performance.now() - started }); return errorResponse(error); }
}
