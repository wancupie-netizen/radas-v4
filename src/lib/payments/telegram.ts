import 'server-only';
import { after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { PACKAGES } from './packages';

function config() {
 const token=process.env.RADAS_TELEGRAM_BOT_TOKEN, chat=process.env.RADAS_TELEGRAM_ADMIN_CHAT_ID;
 const app=process.env.RADAS_APP_URL;
 if(process.env.RADAS_TELEGRAM_ENABLED!=='true'||!token||!/^\d+:[A-Za-z0-9_-]+$/.test(token)||!chat||!/^[1-9]\d+$/.test(chat)||!app)return null;
 try { const url=new URL(app);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')return null;return {token,chat,app:url.origin}; }catch{return null;}
}

export async function deliverPaymentNotifications(actor:string,id:string|null) {
 const c=config();if(!c)return;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(url!=='https://fyqvvkpzcwrmyozxlqkw.supabase.co'||!key)return;
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)})}});
 const rpc=async(action:string,payment:string|null,claim:string)=>{
  const {data,error}=await client.rpc('radas_v4_payment_notification',{p_actor:actor,p_action:action,p_id:payment,p_claim:claim});
  if(error)throw new Error('notification_storage');return data;
 };
 try {
  // One immediate order; admin reads recover at most three outstanding deliveries.
  for(let i=0;i<(id?1:3);i++) {
   const claim=randomUUID(),p=await rpc('claim',id,claim);if(!p)return;
   const pack=PACKAGES.find(x=>x.id===p.package_id);
   if(!pack||p.amount_sen!==pack.amountSen||p.credits!==pack.credits||typeof p.id!=='string'||!/^[0-9a-f-]{36}$/i.test(p.id))throw new Error('notification_payload');
   const clean=(v:unknown)=>typeof v==='string'?v.replace(/[\r\n\u0000-\u001f\u007f]/g,' ').slice(0,254):'Belum diisi';
   const text=['RADAS — Borang pengesahan baharu',`Pesanan: ${p.id}`,`Pakej: ${pack.name} (${pack.credits} kredit)`,`Amaun: RM${(pack.amountSen/100).toFixed(2)}`,`Email: ${clean(p.customer_email)}`,`WhatsApp: ${clean(p.whatsapp)}`,`Rujukan: ${clean(p.customer_reference)}`,`Semak: ${c.app}/admin/payments`].join('\n');
   let sent=false;
   try {
    const response=await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:c.chat,text,link_preview_options:{is_disabled:true}}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
    const result=await response.json();sent=response.ok&&result.ok===true;
   }catch{/* Never log URLs, tokens or customer data. */}
   await rpc(sent?'sent':'failed',p.id,claim);
  }
 }catch{console.warn('RADAS payment notification pending; retry on next admin payment read.');}
}

export function schedulePaymentNotifications(actor:string,id:string|null) {
 if(!config())return;
 try { after(()=>deliverPaymentNotifications(actor,id)); }
 catch{console.warn('RADAS payment notification deferred to next admin payment read.');}
}
