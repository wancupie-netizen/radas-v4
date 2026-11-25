import {createFinalizationClient} from '@/lib/finalization/client';
import {parseTiming} from '@/lib/generations/timing';
import {UUID} from '@/lib/generations/types';
import {GenerationError} from '@/lib/generations/input';
import {PRIVATE_HEADERS,errorResponse,verifiedUser,requireGenerationEnabled} from '@/lib/generations/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
// One bounded owner-scoped SELECT. No provider requests, poll/claim writes or credit operations.
export async function GET(request:Request){
 try{
  const userId=await verifiedUser();requireGenerationEnabled();const params=new URL(request.url).searchParams;
  if([...params.keys()].some(key=>key!=='id')||params.getAll('id').length>1)throw new GenerationError('invalid_input',400);
  const id=params.get('id');if(id!==null&&!UUID.test(id))throw new GenerationError('invalid_input',400);
  const {data,error}=await createFinalizationClient().rpc('radas_v4_generation_timing',{p_user_id:userId,p_id:id});
  if(error)throw new GenerationError('unavailable');
  const item=parseTiming(data,id??undefined);
  // Rebuild the response from validated fields; never forward service-only provider fields.
  return Response.json({serverNow:(data as {serverNow:string}).serverNow,item:item?{startedAt:item.clock.startedAt,stoppedAt:item.clock.stoppedAt,prompt:item.prompt,mode:item.mode,orientation:item.orientation,resolution:item.resolution,generation:item.generation}:null},{headers:PRIVATE_HEADERS});
 }catch(error){return errorResponse(error);}
}
