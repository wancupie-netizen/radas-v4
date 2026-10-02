-- PHASE 10: V4 cleanup lease and read-only Storage discovery. Installation deletes no records.
begin;
do $$ begin
 if to_regclass('radas_v4.video_objects') is null then raise exception 'phase08_required'; end if;
 if to_regclass('radas_v4.cleanup_state') is not null then raise exception 'phase10_already_installed'; end if;
end $$;
create table radas_v4.cleanup_state (
 singleton boolean primary key default true check(singleton),
 lease_token uuid,
 lease_until timestamptz,
 last_run_at timestamptz,
 last_status text check(last_status in ('ok','failed','partial')),
 last_removed integer not null default 0 check(last_removed>=0)
);
insert into radas_v4.cleanup_state(singleton) values(true);
alter table radas_v4.cleanup_state enable row level security;
revoke all on radas_v4.cleanup_state from public,anon,authenticated,service_role;
-- Canonical V4 keys only. Unknown names and another owner's generation key are preserved.
create function radas_v4.cleanup_candidates() returns table(object_path text) language sql security invoker set search_path='' as $$
 select s.name from storage.objects s
 left join radas_v4.generations g on g.id::text=split_part(split_part(s.name,'/',2),'.',1)
 where s.bucket_id='radas-v4-videos'
 and s.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]mp4$'
 and ((g.id is not null and g.user_id::text=split_part(s.name,'/',1) and g.expires_at<=clock_timestamp())
 or (g.id is null and s.created_at<=clock_timestamp()-interval '12 hours'))
 order by s.created_at,s.name
$$;
revoke all on function radas_v4.cleanup_candidates() from public,anon,authenticated,service_role;
create function radas_v4.cleanup_operation(p_action text,p_token uuid default null,p_paths jsonb default '[]',p_removed integer default 0,p_status text default 'ok') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c radas_v4.cleanup_state%rowtype; v_paths jsonb; v_pruned integer:=0; v_remaining integer; v_count bigint;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_action is null or p_action not in ('inspect','claim','batch','ack','finish') then raise exception 'invalid_cleanup_request'; end if;
 if p_action='inspect' then
  select count(*) into v_count from radas_v4.cleanup_candidates();
  select * into c from radas_v4.cleanup_state where singleton;
  return jsonb_build_object('eligible',v_count,'busy',coalesce(c.lease_until>clock_timestamp(),false),'lastRunAt',c.last_run_at,'lastStatus',c.last_status,'lastRemoved',c.last_removed);
 end if;
 if p_token is null then raise exception 'cleanup_token_required'; end if;
 select * into c from radas_v4.cleanup_state where singleton for update;
 if p_action='claim' then
  if c.lease_until>clock_timestamp() and c.lease_token is distinct from p_token then return jsonb_build_object('claimed',false); end if;
  update radas_v4.cleanup_state set lease_token=p_token,lease_until=clock_timestamp()+interval '5 minutes' where singleton;
  -- Recover metadata after a successful Storage deletion whose HTTP/ack response was lost.
  delete from radas_v4.video_objects v using radas_v4.generations g where g.id=v.generation_id and g.expires_at<=clock_timestamp()
   and not exists(select 1 from storage.objects s where s.bucket_id='radas-v4-videos' and s.name=v.object_path);
  get diagnostics v_pruned=row_count;
  return jsonb_build_object('claimed',true,'metadataPruned',v_pruned);
 end if;
 if c.lease_token is distinct from p_token or c.lease_until is null or c.lease_until<=clock_timestamp() then raise exception 'cleanup_lease_lost'; end if;
 if p_action='batch' then
  select coalesce(jsonb_agg(object_path),'[]') into v_paths from (select object_path from radas_v4.cleanup_candidates() limit 50) batch;
  return jsonb_build_object('paths',v_paths);
 elsif p_action='ack' then
  if p_paths is null or jsonb_typeof(p_paths)<>'array' or jsonb_array_length(p_paths)>50 or
   exists(select 1 from jsonb_array_elements(p_paths) path where jsonb_typeof(path)<>'string') then raise exception 'invalid_cleanup_paths'; end if;
  delete from radas_v4.video_objects v using radas_v4.generations g where g.id=v.generation_id and g.expires_at<=clock_timestamp()
   and v.object_path in (select jsonb_array_elements_text(p_paths))
   and not exists(select 1 from storage.objects s where s.bucket_id='radas-v4-videos' and s.name=v.object_path);
  get diagnostics v_pruned=row_count;
  select count(*) into v_remaining from storage.objects s where s.bucket_id='radas-v4-videos' and s.name in (select jsonb_array_elements_text(p_paths));
  return jsonb_build_object('remaining',v_remaining,'metadataPruned',v_pruned);
 else
  if p_removed is null or p_removed not between 0 and 500 or p_status is null or p_status not in ('ok','failed','partial') then raise exception 'invalid_cleanup_result'; end if;
  update radas_v4.cleanup_state set lease_token=null,lease_until=null,last_run_at=clock_timestamp(),last_status=p_status,last_removed=p_removed where singleton;
  return jsonb_build_object('finished',true);
 end if;
end $$;
create function public.radas_v4_cleanup_operation(p_action text,p_token uuid default null,p_paths jsonb default '[]',p_removed integer default 0,p_status text default 'ok') returns jsonb
language sql security invoker set search_path='' as $$select radas_v4.cleanup_operation(p_action,p_token,p_paths,p_removed,p_status)$$;
revoke all on function radas_v4.cleanup_operation(text,uuid,jsonb,integer,text),public.radas_v4_cleanup_operation(text,uuid,jsonb,integer,text) from public,anon,authenticated,service_role;
grant execute on function radas_v4.cleanup_operation(text,uuid,jsonb,integer,text),public.radas_v4_cleanup_operation(text,uuid,jsonb,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
