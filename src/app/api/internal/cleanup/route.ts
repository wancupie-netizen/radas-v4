import { timingSafeEqual } from 'node:crypto';
import { createCleanupClient, createCleanupRunner, requireCleanupEnabled } from '@/lib/cleanup/run';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: 'cleanup_unavailable' }, { status: 503, headers });
  const supplied = request.headers.get('authorization') ?? ''; const expected = `Bearer ${secret}`;
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => key !== 'dryRun') || (query.has('dryRun') && (query.getAll('dryRun').length !== 1 || query.get('dryRun') !== '1'))) return Response.json({ error: 'invalid_request' }, { status: 400, headers });
  try {
    requireCleanupEnabled(); const runner = createCleanupRunner(createCleanupClient());
    return Response.json(query.has('dryRun') ? await runner.inspect() : await runner.run(), { headers });
  } catch { return Response.json({ error: 'cleanup_unavailable' }, { status: 503, headers }); }
}
