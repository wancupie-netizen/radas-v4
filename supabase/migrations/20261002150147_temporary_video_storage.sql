-- PHASE 08: V4 metadata and restrictive bucket policies only. No Storage object SQL writes.
begin;
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='radas_v4' and table_name='generations' and column_name='claim_token') then raise exception 'phase07_required'; end if;
 if to_regclass('radas_v4.video_objects') is not null then raise exception 'phase08_already_installed'; end if;
end $$;
create table radas_v4.video_objects (
 generation_id uuid primary key references radas_v4.generations(id),
 object_path text not null unique,
 size_bytes bigint not null check(size_bytes between 12 and 52428800),
 stored_at timestamptz not null default clock_timestamp()
);
alter table radas_v4.video_objects enable row level security;
revoke all on radas_v4.video_objects from public,anon,authenticated,service_role;
-- Restrictive policies also block legacy permissive policies from exposing this bucket.
-- For every other bucket the predicate is true: existing application policies are preserved.
create policy radas_v4_video_objects_private on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id <> 'radas-v4-videos') with check(bucket_id <> 'radas-v4-videos');
create function radas_v4.video_object_operation(p_action text,p_user_id uuid,p_id uuid,p_size bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g radas_v4.generations%rowtype; v radas_v4.video_objects%rowtype; v_path text;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_action is null or p_action not in ('read','mark') or p_user_id is null or p_id is null then raise exception 'invalid_storage_request'; end if;
 select * into g from radas_v4.generations where id=p_id and user_id=p_user_id for update;
 if g.id is null then return jsonb_build_object('error','not_found'); end if;
 if g.expires_at <= clock_timestamp() then return jsonb_build_object('error','expired'); end if;
 if g.status <> 'done' or g.provider_job_id is null or g.refunded then return jsonb_build_object('error','not_ready'); end if;
 v_path := p_user_id::text || '/' || p_id::text || '.mp4';
 if p_action='mark' then
  if p_size is null or p_size not between 12 and 52428800 then raise exception 'invalid_video_size'; end if;
  insert into radas_v4.video_objects(generation_id,object_path,size_bytes) values(p_id,v_path,p_size) on conflict(generation_id) do nothing;
 end if;
 select * into v from radas_v4.video_objects where generation_id=p_id;
 return jsonb_build_object('objectPath',v_path,'stored',v.generation_id is not null,'sizeBytes',v.size_bytes,'expiresAt',g.expires_at);
end $$;
create function public.radas_v4_video_object_operation(p_action text,p_user_id uuid,p_id uuid,p_size bigint default null) returns jsonb
language sql security invoker set search_path='' as $$select radas_v4.video_object_operation(p_action,p_user_id,p_id,p_size)$$;
revoke all on function radas_v4.video_object_operation(text,uuid,uuid,bigint),public.radas_v4_video_object_operation(text,uuid,uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function radas_v4.video_object_operation(text,uuid,uuid,bigint),public.radas_v4_video_object_operation(text,uuid,uuid,bigint) to service_role;
notify pgrst,'reload schema';
commit;
