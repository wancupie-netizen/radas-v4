-- Updates & Support only. No changes to wallets, payments, jobs or storage.
begin;
do $$ begin
 if to_regclass('radas_v4.platform_updates') is not null then raise exception 'updates_already_installed'; end if;
 if to_regclass('radas_v4.payment_admins') is null then raise exception 'payments_required'; end if;
end $$;
create table radas_v4.platform_updates (
 id uuid primary key, document jsonb not null, deleted boolean not null default false,
 published_at timestamptz, updated_at timestamptz not null default clock_timestamp()
);
create table radas_v4.updates_audit (
 id bigint generated always as identity primary key, update_id uuid not null,
 actor uuid not null references auth.users(id), action text not null check(action in ('save','delete')),
 previous_document jsonb, next_document jsonb, created_at timestamptz not null default clock_timestamp()
);
alter table radas_v4.platform_updates enable row level security;
alter table radas_v4.updates_audit enable row level security;
revoke all on radas_v4.platform_updates,radas_v4.updates_audit from public,anon,authenticated,service_role;
revoke all on sequence radas_v4.updates_audit_id_seq from public,anon,authenticated,service_role;
create index platform_updates_published on radas_v4.platform_updates(published_at desc,id) where not deleted and document->>'published'='true';
create function radas_v4.updates_operation(p_actor uuid,p_action text,p_update jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_admin boolean; v_id uuid; v_old jsonb; v_next jsonb; v_revision integer; v_deleted boolean; v_list jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
 v_admin:=exists(select 1 from radas_v4.payment_admins where user_id=p_actor);
 if p_action is null or p_action not in ('list','admin_list','save','delete') then raise exception 'invalid_update'; end if;
 if p_action<>'list' and not v_admin then raise exception 'forbidden' using errcode='42501'; end if;
 if p_action in ('save','delete') then
  perform pg_advisory_xact_lock(hashtextextended('radas_v4_updates',0));
  begin
   if p_update is null or jsonb_typeof(p_update)<>'object' or (select count(*) from jsonb_object_keys(p_update))<>5 or exists(select 1 from jsonb_object_keys(p_update) k where k not in ('id','title','body','published','revision')) then raise exception 'invalid_update'; end if;
   if jsonb_typeof(p_update->'id')<>'string' or (p_update->>'id')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_update'; end if;
   v_id:=(p_update->>'id')::uuid;
   if jsonb_typeof(p_update->'title')<>'string' or length(p_update->>'title') not between 1 and 120 or btrim(p_update->>'title',E' \t\r\n')<>p_update->>'title' or jsonb_typeof(p_update->'body')<>'string' or length(p_update->>'body') not between 1 and 5000 or btrim(p_update->>'body',E' \t\r\n')<>p_update->>'body' then raise exception 'invalid_update'; end if;
   if jsonb_typeof(p_update->'published')<>'boolean' or jsonb_typeof(p_update->'revision')<>'number' or (p_update->>'revision')!~'^[0-9]+$' then raise exception 'invalid_update'; end if;
   v_revision:=(p_update->>'revision')::integer;
   if v_revision<0 or v_revision>1000000 then raise exception 'invalid_update'; end if;
  exception when others then raise exception 'invalid_update'; end;
  select document,deleted into v_old,v_deleted from radas_v4.platform_updates where id=v_id;
  if p_action='save' then
   if v_revision=1000000 then raise exception 'updates_conflict'; end if;
   if v_deleted then raise exception 'updates_conflict'; end if;
   if v_old is null then
    if v_revision<>0 or (select count(*) from radas_v4.platform_updates where not deleted)>=200 then raise exception 'updates_conflict'; end if;
   elsif (v_old->>'revision')::integer<>v_revision then
    if (v_old->>'revision')::integer=v_revision+1 and v_old-'revision'=p_update-'revision' then return radas_v4.updates_operation(p_actor,'admin_list',null); end if;
    raise exception 'updates_conflict';
   end if;
   v_next:=jsonb_set(p_update,'{revision}',to_jsonb(v_revision+1));
   insert into radas_v4.platform_updates(id,document,published_at) values(v_id,v_next,case when (p_update->>'published')::boolean then clock_timestamp() end)
    on conflict(id) do update set document=excluded.document,published_at=coalesce(radas_v4.platform_updates.published_at,excluded.published_at),updated_at=clock_timestamp();
  else
   if v_old is null then raise exception 'updates_conflict'; end if;
   if v_deleted and (v_old->>'revision')::integer=v_revision+1 and v_old-'revision'=p_update-'revision' then return radas_v4.updates_operation(p_actor,'admin_list',null); end if;
   if v_deleted or v_old<>p_update then raise exception 'updates_conflict'; end if;
   v_next:=jsonb_set(v_old,'{revision}',to_jsonb(v_revision+1));
   update radas_v4.platform_updates set document=v_next,deleted=true,updated_at=clock_timestamp() where id=v_id;
  end if;
  insert into radas_v4.updates_audit(update_id,actor,action,previous_document,next_document) values(v_id,p_actor,p_action,v_old,v_next);
 end if;
 select coalesce(jsonb_agg(x.entry order by x.sort_date desc,x.id),'[]'::jsonb) into v_list from (
  select id,document||jsonb_build_object('publishedAt',published_at,'updatedAt',updated_at) entry,
   case when p_action='list' then published_at else updated_at end sort_date
  from radas_v4.platform_updates where not deleted and (p_action<>'list' or document->>'published'='true')
  order by case when p_action='list' then published_at else updated_at end desc,id limit 200
 ) x;
 return jsonb_build_object('admin',v_admin,'updates',v_list);
end $$;
revoke all on function radas_v4.updates_operation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function radas_v4.updates_operation(uuid,text,jsonb) to service_role;
create function public.radas_v4_updates_operation(p_actor uuid,p_action text,p_update jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$select radas_v4.updates_operation(p_actor,p_action,p_update)$$;
revoke all on function public.radas_v4_updates_operation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radas_v4_updates_operation(uuid,text,jsonb) to service_role;
commit;
