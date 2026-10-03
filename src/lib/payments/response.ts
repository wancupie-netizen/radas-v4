import { GenerationError } from '@/lib/generations/input';
import { PACKAGES, type Payment } from './packages';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail():never { throw new GenerationError('unavailable',503); }
function payment(value:unknown,owner:string|null):Payment {
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();
 const p=value as Record<string,unknown>;const pack=PACKAGES.find(x=>x.id===p.package_id);
 if(typeof p.id!=='string'||!uuid.test(p.id)||typeof p.user_id!=='string'||!uuid.test(p.user_id)||(owner&&p.user_id!==owner)||!pack||p.amount_sen!==pack.amountSen||p.credits!==pack.credits||!['pending','submitted','approved','rejected'].includes(String(p.status))||typeof p.created_at!=='string'||!Number.isFinite(Date.parse(p.created_at))||(p.customer_reference!==null&&(typeof p.customer_reference!=='string'||p.customer_reference.length<3||p.customer_reference.length>100))||(p.reason!==null&&(typeof p.reason!=='string'||p.reason.length>200)))return fail();
 if((p.status==='submitted'||p.status==='approved')&&p.customer_reference===null)return fail();
 if(p.status==='rejected'&&(typeof p.reason!=='string'||p.reason.length<3))return fail();
 // Explicit DTO: bank reference/reviewer and unexpected provider fields never leave server.
 return {id:p.id,user_id:p.user_id,package_id:pack.id,amount_sen:pack.amountSen,credits:pack.credits,status:p.status as Payment['status'],customer_reference:p.customer_reference as string|null,reason:p.reason as string|null,created_at:p.created_at};
}
export function parsePaymentResponse(value:unknown,actor:string,action:string) {
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();const data=value as Record<string,unknown>;
 if(action==='list'||action==='admin_list') {
  if(!Array.isArray(data.payments)||data.payments.length>(action==='list'?20:100)||(action==='list'&&typeof data.admin!=='boolean'))return fail();
  const payments=data.payments.map(p=>payment(p,action==='list'?actor:null));
  if(new Set(payments.map(p=>p.id)).size!==payments.length)return fail();
  if(action==='admin_list'&&payments.some(p=>!['pending','submitted'].includes(p.status)))return fail();
  return action==='list'?{admin:data.admin,payments}:{payments};
 }
 const repeated:Record<string,string>={approve:'already_approved',reject:'already_rejected',cancel:'already_cancelled'};
 if(repeated[action]&&data.status===repeated[action])return {status:data.status};
 const p=payment(data.payment,['create','submit','cancel'].includes(action)?actor:null);
 if((action==='approve'&&p.status!=='approved')||(action==='reject'&&p.status!=='rejected')||(action==='submit'&&!['submitted','approved','rejected'].includes(p.status))||(action==='cancel'&&p.status!=='rejected'))return fail();
 return {payment:p};
}
