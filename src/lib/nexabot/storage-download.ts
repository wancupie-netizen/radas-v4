import 'server-only';
import {lookup as resolveHost} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
import type {LookupFunction} from 'node:net';

// This transport is private to provider download redirects. It accepts no credentials.
export class StoragePolicyError extends Error {
 constructor(public readonly reason:'unsafe_address'|'invalid_storage_path'){super('Storage download policy rejected');}
}
export function isStorageUrl(url:URL):boolean {
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url.origin))return false;
 if(!/^\/storage\/v1\/object\/(sign|public)\/[^/]+\/.+/.test(url.pathname))return false;
 // Do not permit encoded separators/control characters to change endpoint boundaries.
 try {const decoded=decodeURIComponent(url.pathname);return !/[\x00-\x1f\x7f\\]/.test(decoded)&&!/%(?:25|2f|5c)/i.test(url.pathname)&&!decoded.split('/').some(s=>s==='.'||s==='..');}catch{return false;}
}
export function publicAddress(address:string):boolean {
 if(isIP(address)===4){
  const [a,b,c]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&(c===0||c===2)||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
 }
 if(isIP(address)!==6||address.includes('%'))return false;
 const canonical=new URL('http://['+address+']/').hostname.slice(1,-1);
 const [left,right]=canonical.split('::'),l=left?left.split(':'):[],r=right?right.split(':'):[];
 const words=[...l,...Array(right===undefined?0:8-l.length-r.length).fill('0'),...r].map(v=>parseInt(v,16));
 if(words.length!==8)return false;
 // Only global unicast. Excludes loopback, ULA, link-local, multicast, mapped IPv4,
 // NAT64, special-purpose 2001::/23, documentation and 6to4 transition networks.
 return words[0]>=0x2000&&words[0]<=0x3fff&&!(words[0]===0x2001&&(words[1]<0x200||words[1]===0xdb8))&&words[0]!==0x2002&&!(words[0]===0x3fff&&words[1]<0x1000);
}
type Address={address:string;family:number};
type Dependencies={resolve?:(host:string)=>Promise<Address[]>;request?:typeof httpsRequest;bodyTimeoutMs?:number};
async function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
export async function pinnedStorageGet(url:URL,signal:AbortSignal,deps:Dependencies={}):Promise<Response>{
 if(!isStorageUrl(url))throw new StoragePolicyError('invalid_storage_path');
 const answers=await abortable((deps.resolve??(host=>resolveHost(host,{all:true,verbatim:true})))(url.hostname),signal);
 if(!answers.length||answers.some(a=>!publicAddress(a.address)||isIP(a.address)!==a.family))throw new StoragePolicyError('unsafe_address');
 // One immutable DNS result, used by the socket lookup itself. No second DNS lookup,
 // connection reuse, environment proxy or automatic redirect can change the destination.
 const pinned=answers.find(a=>a.family===4)??answers[0];
 const lookup:LookupFunction=(_host,options,callback)=>{
  if(_host!==url.hostname)return callback(new StoragePolicyError('unsafe_address'),'',0);
  if(typeof options==='object'&&options.all)(callback as unknown as (e:Error|null,a:Address[])=>void)(null,[pinned]);
  else callback(null,pinned.address,pinned.family);
 };
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const req=(deps.request??httpsRequest)(url,{method:'GET',agent:false,lookup,servername:url.hostname,rejectUnauthorized:true,signal,maxHeaderSize:16384,headers:{Accept:'video/mp4','Accept-Encoding':'identity'}},res=>{
   res.on('error',()=>{ /* The body iterator reports sanitized stream errors. */ });
   try{
   const status=res.statusCode??0;
   if(status<200||status>599){res.destroy();reject(new Error('Invalid storage response'));return;}
   const headers=new Headers();
   for(const name of ['content-type','content-length','content-encoding','location']){const value=res.headers[name];if(typeof value==='string')headers.set(name,value);}
   if([204,205,304].includes(status)){res.destroy();resolve(new Response(null,{status,headers}));return;}
   const length=headers.get('content-length'),encoding=headers.get('content-encoding');
   if(length!==null&&(!/^\d+$/.test(length)||Number(length)>50*1024*1024)||encoding&&encoding!=='identity'){res.destroy();reject(new Error('Invalid storage headers'));return;}
   const timer=setTimeout(()=>res.destroy(new Error('Storage body timeout')),deps.bodyTimeoutMs??120000);
   res.once('close',()=>clearTimeout(timer));
   const iterator=res[Symbol.asyncIterator]();let bytes=0;
   const body=new ReadableStream<Uint8Array>({
    async pull(controller){try{const item=await iterator.next();if(item.done){controller.close();return;}bytes+=item.value.length;if(bytes>50*1024*1024)throw new Error('Storage body too large');controller.enqueue(new Uint8Array(item.value));}catch{res.destroy();controller.error(new Error('Storage body unavailable'));}},
    cancel(){res.destroy();},
   });
   resolve(new Response(body,{status,headers}));
   }catch{res.destroy();reject(new Error('Invalid storage response'));}
  });
  req.once('error',reject);
  req.end();
 });
}
