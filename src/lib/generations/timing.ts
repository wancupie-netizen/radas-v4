import {parseGeneration, type Generation} from './types';
import type {RecentDetails} from '../history/recent';
export type GenerationClock={startedAt:string;stoppedAt:string|null;serverNow:string};
export type TimedGeneration=RecentDetails & {generation:Generation;clock:GenerationClock};
export function parseTiming(value:unknown,expectedId?:string):TimedGeneration|null {
 if(!value||typeof value!=='object')throw new Error('invalid_timing');
 const data=value as Record<string,unknown>;
 if(typeof data.serverNow!=='string'||!Number.isFinite(Date.parse(data.serverNow)))throw new Error('invalid_timing');
 if(data.item===null)return null;
 if(!data.item||typeof data.item!=='object')throw new Error('invalid_timing');
 const item=data.item as Record<string,unknown>,generation=parseGeneration(item.generation);
 if(expectedId&&generation.id!==expectedId)throw new Error('timing_mismatch');
 if(typeof item.startedAt!=='string'||!Number.isFinite(Date.parse(item.startedAt))||Date.parse(item.startedAt)>Date.parse(data.serverNow)||Date.parse(item.startedAt)>=Date.parse(generation.expiresAt)||
  item.stoppedAt!==null&&(typeof item.stoppedAt!=='string'||!Number.isFinite(Date.parse(item.stoppedAt))||Date.parse(item.stoppedAt)<Date.parse(item.startedAt)||Date.parse(item.stoppedAt)>Math.min(Date.parse(data.serverNow),Date.parse(generation.expiresAt))))throw new Error('invalid_timing');
 if((generation.refunded||generation.slotReleasedAt||generation.releasedAt||['ready','needs_review','expired'].includes(generation.videoState??'')||['failed','rejected'].includes(generation.status))&&item.stoppedAt===null)throw new Error('invalid_timing');
 if(typeof item.prompt!=='string'||item.prompt.length>2000||!['text','image','ingredients'].includes(String(item.mode))||!['portrait','landscape'].includes(String(item.orientation))||!['720','1080'].includes(String(item.resolution)))throw new Error('invalid_timing');
 return {id:generation.id,prompt:item.prompt,mode:item.mode as RecentDetails['mode'],orientation:item.orientation as RecentDetails['orientation'],resolution:item.resolution as RecentDetails['resolution'],generation,
  clock:{startedAt:item.startedAt,stoppedAt:item.stoppedAt as string|null,serverNow:data.serverNow}};
}
// Elapsed time uses a server-clock anchor plus monotonic browser time; system-clock changes cannot reset it.
export function elapsedSeconds(clock:GenerationClock,monotonicElapsedMs:number,expiresAt:string):number {
 const end=clock.stoppedAt?Date.parse(clock.stoppedAt):Math.min(Date.parse(expiresAt),Date.parse(clock.serverNow)+Math.max(0,monotonicElapsedMs));
 return Math.max(0,Math.floor((end-Date.parse(clock.startedAt))/1000));
}
export function formatElapsed(seconds:number):string {
 const safe=Math.max(0,Math.floor(seconds));return String(Math.floor(safe/60)).padStart(2,'0')+':'+String(safe%60).padStart(2,'0');
}
