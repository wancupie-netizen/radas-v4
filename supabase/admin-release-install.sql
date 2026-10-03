-- Admin support extension, RADAS V4 only. Run once in SQL Editor as postgres.
-- Installation does not release a request or change any balance.
begin;
do $$ begin
 if current_user <> 'postgres' then raise exception 'postgres_sql_editor_required' using errcode='42501'; end if;
 if to_regclass('radas_v4.payment_admins') is null then raise exception 'phase11_required'; end if;
 if exists(select 1 from information_schema.columns where table_schema='radas_v4' and table_name='generations' and column_name='admin_released_at') then raise exception 'admin_release_already_installed'; end if;
end $$;
lock table radas_v4.generations in access exclusive mode;
alter table radas_v4.generations
 add column admin_released_at timestamptz,
 add column admin_released_by uuid references radas_v4.payment_admins(user_id),
 add column admin_release_reason text,
 add constraint admin_release_consistent check (
  (admin_released_at is null and admin_released_by is null and admin_release_reason is null) or
  (admin_released_at is not null and admin_released_by is not null and admin_release_reason is not null
   and length(admin_release_reason) between 10 and 200 and status='unknown' and provider_job_id is null and not refunded)
 );
-- Patch only the two existing active-job lookups; abort on any unexpected definition.
do $$ declare definition text; needle text := 'where user_id=p_user_id and status in (''reserved'',''submitting'',''unknown'',''queued'',''processing'')'; begin
 definition := pg_get_functiondef('radas_v4.generation_operation(text,uuid,uuid,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 2 then raise exception 'generation_definition_mismatch'; end if;
 definition := replace(definition,needle,'where user_id=p_user_id and admin_released_at is null and status in (''reserved'',''submitting'',''unknown'',''queued'',''processing'')');
 execute definition;
end $$;
drop index radas_v4.generations_one_active;
create unique index generations_one_active on radas_v4.generations(user_id)
 where admin_released_at is null and status in ('reserved','submitting','unknown','queued','processing');
create function radas_v4.admin_release_unknown(p_actor uuid,p_id uuid,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare g radas_v4.generations%rowtype; owner_id uuid;
begin
 if current_user <> 'postgres' then raise exception 'postgres_sql_editor_required' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from radas_v4.payment_admins where user_id=p_actor) then raise exception 'approved_admin_required' using errcode='42501'; end if;
 if p_id is null or p_reason is null or length(btrim(p_reason)) not between 10 and 200 then raise exception 'release_reason_required'; end if;
 select user_id into owner_id from radas_v4.generations where id=p_id;
 if owner_id is null then raise exception 'generation_not_found'; end if;
 -- Same wallet-before-generation lock order as normal billing.
 perform 1 from radas_v4.credit_wallets where user_id=owner_id for update;
 select * into g from radas_v4.generations where id=p_id for update;
 if g.status <> 'unknown' or g.provider_job_id is not null or g.refunded then raise exception 'only_unknown_unresolved_allowed'; end if;
 if not exists(select 1 from radas_v4.credit_transactions where user_id=g.user_id and type='debit' and reference=p_id::text)
  or exists(select 1 from radas_v4.credit_transactions where user_id=g.user_id and type='refund' and reference=p_id::text) then raise exception 'generation_ledger_mismatch'; end if;
 if g.admin_released_at is not null then return jsonb_build_object('id',g.id,'result','already_released','status',g.status,'refunded',false,'releasedAt',g.admin_released_at); end if;
 update radas_v4.generations set admin_released_at=clock_timestamp(),admin_released_by=p_actor,admin_release_reason=btrim(p_reason) where id=p_id returning * into g;
 return jsonb_build_object('id',g.id,'result','released','status',g.status,'refunded',false,'releasedAt',g.admin_released_at);
end $$;
revoke all on function radas_v4.admin_release_unknown(uuid,uuid,text) from public,anon,authenticated,service_role;
-- No public RPC wrapper and no API-role grant. SQL Editor support operation only.
notify pgrst,'reload schema';
commit;
