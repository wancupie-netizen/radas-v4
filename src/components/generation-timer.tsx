'use client';
import {useEffect,useRef,useState} from 'react';
import {requestJson,RequestError} from '@/lib/errors/client';
import {elapsedSeconds,formatElapsed,parseTiming,type GenerationClock} from '@/lib/generations/timing';
import type {Generation} from '@/lib/generations/types';
export function GenerationTimer({id,generation,initial,provisionalStartedAt}:{id:string;generation?:Generation;initial?:GenerationClock;provisionalStartedAt?:number}){
 const [anchor,setAnchor]=useState<{clock:GenerationClock;received:number;expiresAt:string}|null>(null);
 const [now,setNow]=useState<number|null>(null);
 const [readAttempt,setReadAttempt]=useState(0);
 const observedStop=useRef<number|null>(null);
 const terminal=Boolean(generation&&(generation.slotReleasedAt||generation.releasedAt||['failed','rejected'].includes(generation.status)||['ready','needs_review','expired'].includes(generation.videoState??'')));
 useEffect(()=>{if(initial&&generation)setAnchor({clock:initial,received:performance.now(),expiresAt:generation.expiresAt});},[initial]);
 useEffect(()=>{
  const controller=new AbortController();let alive=true;
  void(async()=>{try{
   const data=await requestJson('/api/generations/timing?id='+encodeURIComponent(id),{signal:controller.signal});
   const item=parseTiming(data,id);if(alive&&item)setAnchor({clock:item.clock,received:performance.now(),expiresAt:item.generation.expiresAt});
  }catch(error){if(alive&&error instanceof RequestError&&error.status===401)window.location.assign('/login');}})();
  return()=>{alive=false;controller.abort();};
 },[readAttempt,id,generation?.status,generation?.videoState,generation?.releasedAt,generation?.slotReleasedAt]);
 useEffect(()=>{
  const resume=()=>{if(document.visibilityState==='visible')setReadAttempt(value=>value+1);};
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
  return()=>{document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);};
 },[]);
 useEffect(()=>{
  if(terminal&&observedStop.current===null)observedStop.current=performance.now();
  if(!terminal)observedStop.current=null;
  const tick=()=>setNow(performance.now());tick();
  if(terminal||anchor?.clock.stoppedAt)return;
  const timer=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
 },[terminal,anchor]);
 let seconds:number|null=null;
 const approximate=terminal&&anchor&&!anchor.clock.stoppedAt;
 if(anchor&&now!==null)seconds=elapsedSeconds(anchor.clock,Math.max(0,(observedStop.current??now)-anchor.received),anchor.expiresAt);
 else if(provisionalStartedAt!==undefined&&now!==null)seconds=Math.max(0,Math.floor(((observedStop.current??now)-provisionalStartedAt)/1000));
 const label=anchor?(approximate?'Elapsed time (approx.)':'Elapsed time'):'Time on this page';
 return <p className="generation-elapsed">{seconds===null?'Checking elapsed time…':<>{label}: <span role="timer" aria-live="off">{formatElapsed(seconds)}</span></>}</p>;
}
