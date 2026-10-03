// Additional isolated SQL and real service-response safety checks. Never mutates live credits.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),path=require('node:path'),{randomUUID}=require('node:crypto');
module.exports=async function({db,op,as,admin,user,other,load,route,req,setActor}) {
 const ledgerBefore=(await db.query('select count(*)::int n from radas_v4.credit_transactions')).rows[0].n;
 await assert.rejects(as('service_role',user,'select public.radas_v4_credit_apply($1,$2,$3)',[user,'topup','unverified-credit']),/verified_payment_required/);
 assert.equal((await db.query('select count(*)::int n from radas_v4.credit_transactions')).rows[0].n,ledgerBefore);
 const legacy=await db.query("select reference from radas_v4.credit_transactions where type='topup' and user_id=$1 limit 1",[user]);
 const balance=(await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[user])).rows[0].balance;
 const repeat=(await as('service_role',user,'select public.radas_v4_credit_apply($1,$2,$3) result',[user,'topup',legacy.rows[0].reference])).rows[0].result;assert.equal(repeat.status,'already_applied');assert.equal(repeat.balance,balance);
 // Failed post-approval ledger insert must roll back the pre-marked approved payment too.
 const pending=(await op(user,'list')).payments.find(p=>p.status==='pending');const id=pending.id;
 await op(user,'submit',{id,reference:'BANK-SAFETY-001'});
 await db.exec(`create function radas_v4.fixture_ledger_failure() returns trigger language plpgsql as $$begin raise exception 'fixture_ledger_failure';end$$;create trigger fixture_ledger_failure before insert on radas_v4.credit_transactions for each row execute function radas_v4.fixture_ledger_failure();`);
 await assert.rejects(op(admin,'approve',{id,reference:'BANK-SAFETY-001',amountSen:500}),/fixture_ledger_failure/);
 assert.equal((await db.query('select status from radas_v4.payments where id=$1',[id])).rows[0].status,'submitted');
 assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[user])).rows[0].balance,balance);
 await db.exec('drop trigger fixture_ledger_failure on radas_v4.credit_transactions;drop function radas_v4.fixture_ledger_failure();');
 // Lost committed submit/approve responses: repeat exactly the same request, never a new payment reference.
 await op(admin,'approve',{id,reference:'BANK-SAFETY-001',amountSen:500});
 assert.equal((await op(admin,'approve',{id,reference:'bank safety 001',amountSen:500})).status,'already_approved');
 await assert.rejects(op(admin,'approve',{id,reference:'BANK-SAFETY-CHANGED',amountSen:500}),/request_conflict/);
 assert.equal((await db.query("select count(*)::int n from radas_v4.credit_transactions where reference='maybank:BANKSAFETY001'")).rows[0].n,1);
 const creditBefore=(await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[user])).rows[0].balance;
 for(const kind of ['debit','refund']) assert.equal((await as('service_role',user,'select public.radas_v4_credit_apply($1,$2,$3) result',[user,kind,'phase12-debit-refund'])).rows[0].result.status,'applied');
 assert.equal((await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[user])).rows[0].balance,creditBefore);
 const cancel=randomUUID();await op(user,'create',{id:cancel,packageId:'try'});await op(user,'cancel',{id:cancel});assert.equal((await op(user,'cancel',{id:cancel})).status,'already_cancelled');
 const parser=load(path.resolve('src/lib/payments/response.ts')).parsePaymentResponse;
 const p=(await op(user,'list')).payments[0];const valid={admin:false,payments:[{...p,bank_reference:'private',reviewed_by:admin,private_secret:'fixture'}]};
 const parsed=parser(valid,user,'list');assert.equal(parsed.payments[0].bank_reference,undefined);assert.equal(parsed.payments[0].private_secret,undefined);
 for(const invalid of [null,[],{admin:false,payments:[{...p,user_id:other}]},{admin:false,payments:[{...p,credits:999}]},{admin:false,payments:[{...p,amount_sen:1}]},{admin:false,payments:[{...p,status:'invented'}]},{admin:false,payments:[p,p]},{admin:false,payments:[{...p,created_at:'bad'}]}])assert.throws(()=>parser(invalid,user,'list'),/unavailable/);
 console.log('PASS verified-payment ledger guard; old idempotent references preserved; approval/ledger/wallet rollback; lost response replay and normalized reference protection');
 console.log('PASS repeat cancellation; strict payment snapshots reject spoofed ownership/amounts/status/dates/duplicates and strip private fields');
 const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_payment_safety.sql'));await assert.rejects(db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8')),/payment_safety_already_installed/);await db.exec('rollback');
};
