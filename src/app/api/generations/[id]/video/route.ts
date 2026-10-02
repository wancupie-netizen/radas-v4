import { createVideoStorage } from '@/lib/storage/video';
import { GenerationError } from '@/lib/generations/input';
import { UUID } from '@/lib/generations/types';
import { PRIVATE_HEADERS, errorResponse, verifiedUser, requireGenerationEnabled } from '@/lib/generations/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await verifiedUser(); requireGenerationEnabled();
    const { id } = await context.params; if (!UUID.test(id)) throw new GenerationError('not_found', 404);
    const bytes = await createVideoStorage().ensure(userId, id, request.signal);
    return new Response(Buffer.from(bytes), { headers: { ...PRIVATE_HEADERS, 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length), 'Content-Disposition': `inline; filename="radas-${id}.mp4"` } });
  } catch (error) { return errorResponse(error); }
}
