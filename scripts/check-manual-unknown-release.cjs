// Real SQL in isolated PGlite. Never connects to live Supabase or provider.
const assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite'),{randomUUID}=require('node:crypto');
const owner='d308b480-a4ae-4753-9d83-bfea0d0ae863',other=randomUUID(),target='4e98ec44-e99b-41ff-9f89-1dfaf900e6d6',otherJob=randomUUID();
const migration=fs.readFileSync('supabase/migrations/20261013090226_manual_unknown_release.sql','utf8'),release=fs.readFileSync('supabase/release-azmil-20261013.sql','utf8');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.jwt(),auth.uid() to anon,authenticated,service_role;
 insert into auth.users values('${owner}','azmilruzali09@gmail.com'),('${other}','other@example.com');`);
 for(const suffix of ['202610020001_credit_engine.sql','_generation_flow.sql','_credit_safety.sql','_ingredients_mode.sql','_release_expired_unknown.sql']){const name=fs.readdirSync('supabase/migrations').find(n=>n.endsWith(suffix));await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));}
 const actor=async(role='service_role')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role})]);await db.exec('set role '+role);};
 const op=async(action,user,id,data={})=>(await db.query('select public.radas_v4_generation_operation($1,$2,$3,$4) as result',[action,user,id,JSON.stringify(data)])).rows[0].result;
 const spec={hash:'a'.repeat(64),mode:'ingredients',prompt:'Fixture',orientation:'portrait',resolution:720};
 await actor();
 for(const [user,id]of[[owner,target],[other,otherJob]]){await db.query('select public.radas_v4_credit_apply($1,$2,$3)',[user,'topup','fixture-'+user]);await op('reserve',user,id,spec);const token=randomUUID();await op('claim',user,id,{claimToken:token});await op('transition',user,id,{status:'unknown',claimToken:token});}
 await db.exec('reset role');await db.exec("update radas_v4.generations set created_at=clock_timestamp()-interval '1 hour',updated_at=clock_timestamp()-interval '3 minutes'");
 const snapshot=async(table)=>(await db.query('select * from radas_v4.'+table+' order by 1')).rows;
 const wallets=await snapshot('credit_wallets'),ledger=await snapshot('credit_transactions');
 await db.exec(migration);
 const before=await snapshot('generations');
 for(const role of ['anon','authenticated','service_role']){await actor(role);await assert.rejects(db.exec(release));await db.exec('rollback');}
 await db.exec('reset role');
 await db.exec("update auth.users set email='wrong@example.com' where id='"+owner+"'");await assert.rejects(db.exec(release),/identity does not match/);await db.exec('rollback');await db.exec("update auth.users set email='azmilruzali09@gmail.com' where id='"+owner+"'");
 await db.exec("update radas_v4.generations set provider_job_id='known_job' where id='"+target+"'");await assert.rejects(db.exec(release),/no longer matches/);await db.exec('rollback');await db.exec("update radas_v4.generations set provider_job_id=null where id='"+target+"'");
 await assert.rejects(db.exec("update radas_v4.generations set unknown_released_at=clock_timestamp() where id='"+target+"'"),/check constraint/);
 await db.exec(release);const after=await snapshot('generations');
 const t=after.find(r=>r.id===target),old=before.find(r=>r.id===target);
 assert.ok(t.unknown_released_at);assert.ok(t.unknown_release_reason);assert.ok(t.unknown_release_by);assert.ok(new Date(t.unknown_released_at)<new Date(t.expires_at));
 for(const key of Object.keys(old))if(!['unknown_released_at','unknown_release_reason','unknown_release_by'].includes(key))assert.deepEqual(t[key],old[key],key);
 assert.deepEqual(after.find(r=>r.id===otherJob),before.find(r=>r.id===otherJob));assert.deepEqual(await snapshot('credit_wallets'),wallets);assert.deepEqual(await snapshot('credit_transactions'),ledger);
 await db.exec(release);await db.exec(migration);assert.deepEqual(await snapshot('generations'),after);assert.deepEqual(await snapshot('credit_transactions'),ledger);
 await actor();assert.equal((await op('reserve',owner,target,spec)).status,'unknown');await assert.rejects(op('claim',owner,target,{claimToken:randomUUID()}),/expired_unknown_read_only/);await assert.rejects(op('cancel',owner,target),/expired_unknown_read_only/);
 const next=randomUUID();assert.equal((await op('reserve',owner,next,spec)).status,'reserved');assert.equal((await op('reserve',owner,next,spec)).created,false);assert.equal((await op('reserve',other,randomUUID(),spec)).error,'active_generation');
 await db.exec('reset role');const balance=(await db.query('select balance from radas_v4.credit_wallets where user_id=$1',[owner])).rows[0].balance;assert.equal(balance,58);assert.equal((await db.query("select count(*)::int as n from radas_v4.credit_transactions where type='refund'")).rows[0].n,0);
 console.log('PASS manual release: exact owner/request; public/service denial; changed identity/job rejected; early release requires audit; original expiry/status/debit preserved; other user unchanged; replay safe; old request cannot claim/cancel; one new request debits once');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
