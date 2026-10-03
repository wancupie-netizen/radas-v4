import { catalogOperation } from '@/lib/affiliate/service';
import { validProduct } from '@/lib/affiliate/types';
import { verifiedUser, sameOrigin, PRIVATE_HEADERS, errorResponse } from '@/lib/generations/http';
import { GenerationError } from '@/lib/generations/input';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const actor = await verifiedUser(), q = new URL(request.url).searchParams;
    if ([...q.keys()].some(k=>k!=='admin') || q.getAll('admin').length>1 || (q.has('admin') && q.get('admin')!=='1')) throw new GenerationError('invalid_request',400);
    return Response.json(await catalogOperation(actor,q.has('admin')?'admin_list':'list'),{headers:PRIVATE_HEADERS});
  } catch(e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try {
    const actor = await verifiedUser(); sameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new GenerationError('invalid_request',400);
    const reader = request.body?.getReader(); if (!reader) throw new GenerationError('invalid_request',400);
    let bytes = 0; const chunks: Uint8Array[] = [];
    for (;;) { const {done,value} = await reader.read(); if(done) break; bytes += value.length; if(bytes>8192){await reader.cancel();throw new GenerationError('invalid_request',413);} chunks.push(value); }
    let b; try { b = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new GenerationError('invalid_request',400); }
    const keys = ['id','name','imageUrl','category','priceSen','commissionSen','url','reviewedOn','contentTypes','published','revision'];
    if (!b || typeof b!=='object' || Array.isArray(b) || Object.keys(b).some(k=>!['action','product'].includes(k)) || !['save','delete'].includes(b.action) || !validProduct(b.product) || Object.keys(b.product).some(k=>!keys.includes(k))) throw new GenerationError('invalid_request',400);
    return Response.json(await catalogOperation(actor,b.action,b.product),{headers:PRIVATE_HEADERS});
  } catch(e) { return errorResponse(e); }
}
