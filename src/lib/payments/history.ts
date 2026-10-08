import { PACKAGES, type Payment } from './packages';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail():never { throw new Error('invalid_payment_history'); }
function payment(value:unknown,owner:string|null,admin=false):Payment {
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();
 const p=value as Record<string,unknown>;const pack=PACKAGES.find(x=>x.id===p.package_id);
 if(typeof p.id!=='string'||!uuid.test(p.id)||typeof p.user_id!=='string'||!uuid.test(p.user_id)||(owner&&p.user_id!==owner)||!pack||p.amount_sen!==pack.amountSen||p.credits!==pack.credits||!['pending','submitted','approved','rejected'].includes(String(p.status))||typeof p.created_at!=='string'||!Number.isFinite(Date.parse(p.created_at))||(p.customer_reference!==null&&(typeof p.customer_reference!=='string'||p.customer_reference.length<3||p.customer_reference.length>100))||(p.reason!==null&&(typeof p.reason!=='string'||p.reason.length>200)))return fail();
 if((p.status==='submitted'||p.status==='approved')&&p.customer_reference===null)return fail();
 if(p.status==='rejected'&&(typeof p.reason!=='string'||p.reason.length<3))return fail();
 if(p.whatsapp!==undefined&&p.whatsapp!==null&&(typeof p.whatsapp!=='string'||!/^[1-9][0-9]{7,14}$/.test(p.whatsapp)))return fail();
 if(admin&&p.customer_email!==null&&(typeof p.customer_email!=='string'||p.customer_email.length>254))return fail();
 // Explicit DTO: bank reference/reviewer and unexpected provider fields never leave server.
 return {id:p.id,user_id:p.user_id,package_id:pack.id,amount_sen:pack.amountSen,credits:pack.credits,status:p.status as Payment['status'],customer_reference:p.customer_reference as string|null,reason:p.reason as string|null,created_at:p.created_at,whatsapp:(p.whatsapp??null) as string|null,...(admin?{customer_email:p.customer_email as string|null}:{})};
}
export type PaymentRecord = Payment & { reviewed_at: string | null };
export type PaymentHistory = { payments: PaymentRecord[]; total: number; page: number; pageSize: 9 };
export function parsePaymentHistory(value: unknown): PaymentHistory {
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();
 const data=value as Record<string,unknown>;
 if(!Number.isSafeInteger(data.total)||(data.total as number)<0||(data.total as number)>2147483647||
   !Number.isSafeInteger(data.page)||(data.page as number)<1||(data.page as number)>Math.max(1,Math.ceil((data.total as number)/9))||
   data.pageSize!==9||!Array.isArray(data.payments)||data.payments.length!==Math.min(9,Math.max(0,(data.total as number)-((data.page as number)-1)*9)))return fail();
 const payments=data.payments.map(value=>{
   const p=payment(value,null,true);const reviewed=(value as Record<string,unknown>).reviewed_at;
   if(!['approved','rejected'].includes(p.status)||(reviewed!==null&&(typeof reviewed!=='string'||!Number.isFinite(Date.parse(reviewed))))||
     (p.status==='approved'&&reviewed===null))return fail();
   return {...p,reviewed_at:reviewed as string|null};
 });
 if(new Set(payments.map(p=>p.id)).size!==payments.length)return fail();
 return {payments,total:data.total as number,page:data.page as number,pageSize:9};
}
