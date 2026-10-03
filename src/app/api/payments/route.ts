import { operation } from '@/lib/payments/service';
import { verifiedUser, sameOrigin, PRIVATE_HEADERS, errorResponse } from '@/lib/generations/http';
import { GenerationError } from '@/lib/generations/input';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function enabled() { if (process.env.RADAS_PAYMENTS_ENABLED !== 'true') throw new GenerationError('payments_disabled',503); }
export async function GET(request:Request) {
 try { const actor=await verifiedUser();enabled();const q=new URL(request.url).searchParams;
 if([...q.keys()].some(k=>k!=='admin')||q.getAll('admin').length>1||(q.has('admin')&&q.get('admin')!=='1')) throw new GenerationError('invalid_request',400);
 return Response.json(await operation(actor,q.get('admin')==='1'?'admin_list':'list'),{headers:PRIVATE_HEADERS});
 }catch(e){return errorResponse(e);}
}
export async function POST(request:Request) {
 try { const actor=await verifiedUser();sameOrigin(request);enabled();
 if(!request.headers.get('content-type')?.startsWith('application/json')) throw new GenerationError('invalid_request',400);
 const reader=request.body?.getReader();if(!reader)throw new GenerationError('invalid_request',400);let size=0;const chunks:Uint8Array[]=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw new GenerationError('invalid_request',413);}chunks.push(value);}
 let b;try { b=JSON.parse(Buffer.concat(chunks).toString('utf8')); }catch{throw new GenerationError('invalid_request',400);}
 if(!b||typeof b!=='object'||Array.isArray(b)||!['create','submit','approve','reject','cancel'].includes(b.action)||typeof b.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id))throw new GenerationError('invalid_request',400);
 const allowed:Record<string,string[]>={cancel:['action','id'],create:['action','id','packageId'],submit:['action','id','reference'],approve:['action','id','reference','amountSen'],reject:['action','id','reason']};
 if(Object.keys(b).some(k=>!allowed[b.action].includes(k))||allowed[b.action].some(k=>!(k in b))||('reference'in b&&(typeof b.reference!=='string'||b.reference.length>100||b.reference.trim().length<3))||('reason'in b&&(typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>200))||('amountSen'in b&&!Number.isSafeInteger(b.amountSen))||('packageId'in b&&!['try','starter','creator','power'].includes(b.packageId)))throw new GenerationError('invalid_request',400);
 return Response.json(await operation(actor,b.action,b),{headers:PRIVATE_HEADERS});
 }catch(e){return errorResponse(e);}
}
