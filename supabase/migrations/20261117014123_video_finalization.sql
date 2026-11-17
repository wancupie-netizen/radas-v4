-- Additive only. Does not replace generation_operation, credit_apply or video_object_operation.
begin;
do $$ begin
 if to_regprocedure('radas_v4.video_object_operation(text,uuid,uuid,bigint)') is null then raise exception 'video_storage_required'; end if;
end $$;
create table radas_v4.video_finalizations (
 generation_id uuid primary key references radas_v4.generations(id),
 last_outcome text not null default 'claimed' check(last_outcome in ('claimed','stored_verified','provider_pending','generation_terminal','retryable_failure','unsafe_redirect','retry_exhausted','expired')),
 state text not null check(state in ('working','pending','retry','ready','needs_review','terminal')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_token uuid,
 lease_until timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 check ((lease_token is null) = (lease_until is null))
);
alter table radas_v4.video_finalizations enable row level security;
revoke all on radas_v4.video_finalizations from public,anon,authenticated,service_role;
create index video_finalizations_due on radas_v4.video_finalizations(next_attempt_at) where state in ('working','pending','retry');

create function radas_v4.finalization_operation(p_action text,p_user_id uuid default null,p_id uuid default null,p_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g radas_v4.generations%rowtype; t radas_v4.video_finalizations%rowtype; v_state text; v_items jsonb;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_action is null or p_action not in ('claim','guard','wait','retry','review','ready','terminal','state','history') then raise exception 'invalid_finalization_action'; end if;
 if p_action='history' then
  if p_user_id is null then raise exception 'owner_required'; end if;
  select coalesce(jsonb_agg(row_item order by created_at desc,id desc),'[]'::jsonb) into v_items from (
   select h.created_at,h.id,jsonb_build_object('id',h.id,'prompt',h.prompt,'mode',h.mode,'orientation',h.orientation,'resolution',h.resolution::text,
    'completedAt',coalesce(v.stored_at,h.updated_at),'generation',jsonb_build_object('id',h.id,'status',h.status,'expiresAt',h.expires_at,'refunded',h.refunded,
     'videoState',case when f.state='ready' and v.generation_id is not null then 'ready' when f.state='needs_review' then 'needs_review' else 'finalizing' end)) as row_item
   from radas_v4.generations h left join radas_v4.video_finalizations f on f.generation_id=h.id left join radas_v4.video_objects v on v.generation_id=h.id
   where h.user_id=p_user_id and h.status='done' and not h.refunded and h.expires_at>clock_timestamp()
   order by h.created_at desc,h.id desc limit 20
  ) recent;
  return jsonb_build_object('items',v_items);
 end if;
 if p_action='claim' then
  if p_token is null then raise exception 'token_required'; end if;
  -- One bounded transfer globally; serializes claim decisions even across replicas.
  perform pg_advisory_xact_lock(174251117);
  if exists(select 1 from radas_v4.video_finalizations where lease_until>clock_timestamp()) then return jsonb_build_object('claimed',false); end if;
  update radas_v4.video_finalizations set state='needs_review',last_outcome='retry_exhausted',lease_token=null,lease_until=null,updated_at=clock_timestamp()
   where state in ('working','pending','retry') and attempts>=5 and (lease_until is null or lease_until<=clock_timestamp());
  select g0.* into g from radas_v4.generations g0 left join radas_v4.video_finalizations t0 on t0.generation_id=g0.id
   where g0.status in ('queued','processing','done') and g0.provider_job_id is not null and not g0.refunded and g0.expires_at>clock_timestamp()
    and (t0.generation_id is null or (t0.state in ('pending','retry','working') and t0.attempts<5 and t0.next_attempt_at<=clock_timestamp() and (t0.lease_until is null or t0.lease_until<=clock_timestamp())))
   order by case when g0.status='done' and not exists(select 1 from radas_v4.video_objects where generation_id=g0.id) then 0 else 1 end,coalesce(t0.next_attempt_at,g0.created_at),g0.id limit 1;
  if g.id is null then return jsonb_build_object('claimed',false); end if;
  insert into radas_v4.video_finalizations(generation_id,state,attempts,lease_token,lease_until)
   values(g.id,'working',1,p_token,clock_timestamp()+interval '10 minutes')
   on conflict(generation_id) do update set state='working',last_outcome='claimed',attempts=video_finalizations.attempts+1,lease_token=p_token,lease_until=clock_timestamp()+interval '10 minutes',updated_at=clock_timestamp();
  return jsonb_build_object('claimed',true,'id',g.id,'userId',g.user_id,'providerJobId',g.provider_job_id,'status',g.status);
 end if;
 if p_user_id is null or p_id is null then raise exception 'owner_required'; end if;
 select * into g from radas_v4.generations where id=p_id and user_id=p_user_id;
 if g.id is null then return jsonb_build_object('error','not_found'); end if;
 select * into t from radas_v4.video_finalizations where generation_id=p_id for update;
 if p_action='state' then
  v_state := case when g.expires_at<=clock_timestamp() then 'expired'
   when g.status<>'done' then 'pending'
   when t.state='ready' and exists(select 1 from radas_v4.video_objects where generation_id=p_id) then 'ready'
   when t.state='needs_review' then 'needs_review' else 'finalizing' end;
  return jsonb_build_object('videoState',v_state);
 end if;
 if t.generation_id is null or p_token is null or t.lease_token is distinct from p_token or t.lease_until<=clock_timestamp() then
  return jsonb_build_object('valid',false,'applied',false);
 end if;
 if p_action='guard' then return jsonb_build_object('valid',g.expires_at>clock_timestamp() and not g.refunded and g.status in ('queued','processing','done')); end if;
 if g.expires_at<=clock_timestamp() then
  update radas_v4.video_finalizations set state='needs_review',last_outcome='expired',lease_token=null,lease_until=null,updated_at=clock_timestamp() where generation_id=p_id;
  return jsonb_build_object('applied',false);
 end if;
 if p_action='ready' then
  if g.status<>'done' or g.refunded or not exists(select 1 from radas_v4.video_objects where generation_id=p_id and object_path=p_user_id::text||'/'||p_id::text||'.mp4') then raise exception 'video_not_stored'; end if;
  v_state := 'ready';
 elsif p_action='wait' then v_state := 'pending';
 elsif p_action='terminal' then
  if g.status not in ('failed','rejected') then raise exception 'generation_not_terminal'; end if;
  v_state := 'terminal';
 elsif p_action='review' or t.attempts>=5 then v_state := 'needs_review';
 else v_state := 'retry'; end if;
 update radas_v4.video_finalizations set state=v_state,lease_token=null,lease_until=null,
  last_outcome=case when p_action='ready' then 'stored_verified' when p_action='wait' then 'provider_pending' when p_action='terminal' then 'generation_terminal' when p_action='review' then 'unsafe_redirect' when t.attempts>=5 then 'retry_exhausted' else 'retryable_failure' end,
  attempts=case when p_action='wait' then 0 else attempts end,
  next_attempt_at=clock_timestamp()+case when p_action='wait' then interval '4 seconds' else interval '5 seconds' * power(3,least(attempts-1,4)) end,
  updated_at=clock_timestamp() where generation_id=p_id;
 return jsonb_build_object('applied',true,'videoState',v_state);
end $$;
create function public.radas_v4_finalization_operation(p_action text,p_user_id uuid default null,p_id uuid default null,p_token uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select radas_v4.finalization_operation(p_action,p_user_id,p_id,p_token)$$;
revoke all on function radas_v4.finalization_operation(text,uuid,uuid,uuid),public.radas_v4_finalization_operation(text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function radas_v4.finalization_operation(text,uuid,uuid,uuid),public.radas_v4_finalization_operation(text,uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
