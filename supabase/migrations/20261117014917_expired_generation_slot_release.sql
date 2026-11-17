-- REVIEW REQUIRED: expiry releases the account slot only; status/ledger/refund stay unchanged.
-- Apply after owner accepts this policy. This changes the active-slot index and reserve/read behaviour.
begin;
alter table radas_v4.generations add column slot_released_at timestamptz, add column slot_release_reason text,
 add constraint generations_slot_release_consistent check (
  (slot_released_at is null and slot_release_reason is null) or
  (slot_released_at is not null and slot_released_at>=expires_at and provider_job_id is not null and length(slot_release_reason) between 10 and 300)
 );
do $$
declare definition text;
 lock_needle text := 'perform 1 from radas_v4.credit_wallets where user_id=p_user_id for update;';
 active_needle text := 'and unknown_released_at is null and (to_jsonb(generations)->>''admin_released_at'') is null';
 release_needle text := 'and g.unknown_released_at is null and (to_jsonb(g)->>''admin_released_at'') is null then return jsonb_build_object(''error'',''expired'');';
begin
 select pg_get_functiondef('radas_v4.generation_operation(text,uuid,uuid,jsonb)'::regprocedure) into definition;
 -- Abort atomically on a different live definition rather than replace unknown business logic.
 if position(lock_needle in definition)=0 or (length(definition)-length(replace(definition,active_needle,'')))/length(active_needle)<>2
  or position(release_needle in definition)=0 or position('if p_action=''cancel'' then' in definition)=0
  or position('''refunded'',g.refunded,' in definition)=0
  or position('and g.status in (''queued'',''processing'') and' in definition)=0 then raise exception 'unexpected_generation_definition_review_required'; end if;
 definition := replace(definition,lock_needle,lock_needle || E'\n  update radas_v4.generations set slot_released_at=clock_timestamp(),slot_release_reason=''Original 12-hour output lifetime expired; account slot released without refund or resubmission.''\n    where user_id=p_user_id and status in (''queued'',''processing'') and provider_job_id is not null and not refunded and expires_at<=clock_timestamp() and slot_released_at is null;');
 definition := replace(definition,active_needle,active_needle || ' and slot_released_at is null');
 definition := replace(definition,release_needle,'and g.slot_released_at is null ' || release_needle);
 definition := replace(definition,'if p_action=''cancel'' then',E'if g.slot_released_at is not null and p_action in (''claim'',''transition'',''cancel'') then raise exception ''expired_known_read_only''; end if;\n  if p_action=''cancel'' then');
 definition := replace(definition,'and g.status in (''queued'',''processing'') and','and g.slot_released_at is null and g.status in (''queued'',''processing'') and');
 definition := replace(definition,'''refunded'',g.refunded,','''refunded'',g.refunded,''slotReleasedAt'',g.slot_released_at,');
 execute definition;
end $$;
drop index radas_v4.generations_one_active;
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='radas_v4' and table_name='generations' and column_name='admin_released_at') then
  execute 'create unique index generations_one_active on radas_v4.generations(user_id) where status in (''reserved'',''submitting'',''unknown'',''queued'',''processing'') and unknown_released_at is null and admin_released_at is null and slot_released_at is null';
 else
  create unique index generations_one_active on radas_v4.generations(user_id) where status in ('reserved','submitting','unknown','queued','processing') and unknown_released_at is null and slot_released_at is null;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
