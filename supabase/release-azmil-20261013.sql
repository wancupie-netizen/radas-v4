-- Run manually in Supabase SQL Editor after the manual_unknown_release migration.
-- Exactly one known customer/request. No refund, deletion, expiry change or provider submission.
begin;
do $$
declare
  v_owner uuid;
  v_job radas_v4.generations%rowtype;
  v_reason constant text := 'Manual support release approved by owner: provider submit TIMEOUT; outcome remains unknown; no refund or resubmit.';
begin
  select id into v_owner from auth.users where lower(email)='azmilruzali09@gmail.com';
  if v_owner is distinct from 'd308b480-a4ae-4753-9d83-bfea0d0ae863'::uuid then
    raise exception 'Customer identity does not match; nothing released';
  end if;
  -- Match the generation operation lock order, so a concurrent submit cannot bypass its wallet lock.
  perform 1 from radas_v4.credit_wallets where user_id=v_owner for update;
  if not found then raise exception 'Customer wallet missing; nothing released'; end if;
  select * into v_job from radas_v4.generations
    where id='4e98ec44-e99b-41ff-9f89-1dfaf900e6d6'::uuid and user_id=v_owner for update;
  if not found or v_job.status<>'unknown' or v_job.provider_job_id is not null or v_job.refunded then
    raise exception 'Request no longer matches an unresolved submission; nothing released';
  end if;
  if v_job.unknown_released_at is not null then
    if v_job.unknown_release_reason=v_reason and v_job.unknown_release_by is not null then
      raise notice 'Already manually released; no changes';
      return;
    end if;
    raise exception 'Request already released by another path; nothing changed';
  end if;
  if v_job.updated_at>clock_timestamp()-interval '2 minutes' then
    raise exception 'Request too recent for manual release; nothing released';
  end if;
  update radas_v4.generations
    set unknown_released_at=clock_timestamp(),unknown_release_reason=v_reason,unknown_release_by=session_user
    where id=v_job.id and user_id=v_owner;
end;
$$;
commit;

select id,status,provider_job_id,refunded,expires_at,unknown_released_at,unknown_release_reason,unknown_release_by
from radas_v4.generations
where id='4e98ec44-e99b-41ff-9f89-1dfaf900e6d6'::uuid;
