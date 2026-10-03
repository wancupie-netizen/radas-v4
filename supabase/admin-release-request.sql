-- Execute only AFTER installation and verification. This releases ONE known request.
-- No refund, provider request, job-ID reassignment or ledger deletion.
select radas_v4.admin_release_unknown(
 (select user_id from radas_v4.payment_admins where user_id=(
   select id from auth.users where lower(email)='wancupie@gmail.com' and email_confirmed_at is not null
 )),
 'e9c61b97-dd9e-403d-a837-391990830c64'::uuid,
 'Owner approved release of unresolved submit after processing-response fix; keep debit pending provider investigation.'
) as release_result;
