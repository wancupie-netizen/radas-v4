import { createNexabotClient } from '@/lib/nexabot/client';
import { createGenerationStore } from '@/lib/generations/store';
import { createGenerationFlow } from '@/lib/generations/flow';
import { readGenerationInput } from '@/lib/generations/input';
import { PRIVATE_HEADERS, errorResponse, verifiedUser, sameOrigin, requireGenerationEnabled } from '@/lib/generations/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const userId = await verifiedUser(); sameOrigin(request); requireGenerationEnabled();
    const { requestId, input, hash } = await readGenerationInput(request);
    const flow = createGenerationFlow(createGenerationStore(), createNexabotClient());
    const generation = await flow.submit(userId, requestId, input, hash);
    return Response.json(generation, { status: 202, headers: PRIVATE_HEADERS });
  } catch (error) { return errorResponse(error); }
}
