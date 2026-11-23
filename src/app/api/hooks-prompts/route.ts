import { hooksOperation } from '@/lib/hooks-prompts/service';
import { validEntry } from '@/lib/hooks-prompts/types';
import { verifiedUser, sameOrigin, PRIVATE_HEADERS, errorResponse } from '@/lib/generations/http';
import { GenerationError } from '@/lib/generations/input';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const actor = await verifiedUser(), q = new URL(request.url).searchParams;
    if ([...q.keys()].some(k=>k!=='admin') || q.getAll('admin').length>1 || (q.has('admin') && q.get('admin')!=='1')) throw new GenerationError('invalid_request',400);
    return Response.json(await hooksOperation(actor,q.has('admin')?'admin_list':'list'),{headers:PRIVATE_HEADERS});
  } catch(e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try {
    const actor = await verifiedUser(); sameOrigin(request);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new GenerationError('invalid_request',400);
    const reader = request.body?.getReader(); if (!reader) throw new GenerationError('invalid_request',400);
    let bytes = 0; const chunks: Uint8Array[] = [];
    for (;;) { const {done,value} = await reader.read(); if(done) break; bytes+=value.length; if(bytes>65536){await reader.cancel();throw new GenerationError('invalid_request',413);} chunks.push(value); }
    let body; try { body=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new GenerationError('invalid_request',400); }
    if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==2 || Object.keys(body).some(k=>!['action','entry'].includes(k)) || !['save','delete'].includes(body.action) || !validEntry(body.entry)) throw new GenerationError('invalid_request',400);
    return Response.json(await hooksOperation(actor,body.action,body.entry),{headers:PRIVATE_HEADERS});
  } catch(e) { return errorResponse(e); }
}
