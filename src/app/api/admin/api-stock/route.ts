import { getApiStock } from '@/lib/api-stock/service';
import { verifiedUser, PRIVATE_HEADERS, errorResponse } from '@/lib/generations/http';
import { GenerationError } from '@/lib/generations/input';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
 try {
  const actor = await verifiedUser();
  if (process.env.RADAS_PAYMENTS_ENABLED !== 'true') throw new GenerationError('payments_disabled', 503);
  if (new URL(request.url).search) throw new GenerationError('invalid_request', 400);
  return Response.json(await getApiStock(actor), { headers: PRIVATE_HEADERS });
 } catch (error) { return errorResponse(error); }
}
