-- Additive inspiration gallery. No existing product, generation or credit writes.
begin;
do $$ begin
 if to_regclass('radas_v4.payment_admins') is null then raise exception 'payment_admins_required'; end if;
end $$;
create function radas_v4.video_example_valid(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if p is null or jsonb_typeof(p)<>'object' or (select count(*) from jsonb_object_keys(p))<>7 then return false; end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in ('id','title','videoId','description','sortOrder','published','revision')) then return false; end if;
 if jsonb_typeof(p->'id') is distinct from 'string' or p->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 if jsonb_typeof(p->'title') is distinct from 'string' or length(p->>'title') not between 1 and 120 or p->>'title'<>btrim(p->>'title') then return false; end if;
 if jsonb_typeof(p->'description') is distinct from 'string' or length(p->>'description')>240 or p->>'description'<>btrim(p->>'description') then return false; end if;
 if jsonb_typeof(p->'published') is distinct from 'boolean' or jsonb_typeof(p->'videoId') is distinct from 'string' then return false; end if;
 if p->>'videoId' !~ '^[A-Za-z0-9_-]{11}$' and not(p->'published'='false'::jsonb and p->>'videoId'='') then return false; end if;
 if jsonb_typeof(p->'sortOrder') is distinct from 'number' or p->>'sortOrder' !~ '^[0-9]+$' or (p->>'sortOrder')::bigint not between 0 and 9999 then return false; end if;
 if jsonb_typeof(p->'revision') is distinct from 'number' or p->>'revision' !~ '^[0-9]+$' or (p->>'revision')::bigint not between 0 and 2147483646 then return false; end if;
 return true;
exception when others then return false;
end $$;
revoke all on function radas_v4.video_example_valid(jsonb) from public,anon,authenticated,service_role;

create table radas_v4.video_examples (
 id uuid primary key,
 document jsonb not null check(radas_v4.video_example_valid(document)),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid references auth.users(id) on delete set null,
 check(id=(document->>'id')::uuid and (document->>'revision')::integer>=1)
);
create table radas_v4.video_example_audit (
 id bigint generated always as identity primary key,
 example_id uuid not null,
 actor uuid references auth.users(id) on delete set null,
 action text not null check(action in ('save','delete')),
 previous_document jsonb,
 next_document jsonb,
 created_at timestamptz not null default clock_timestamp()
);
create index video_example_audit_example on radas_v4.video_example_audit(example_id);
alter table radas_v4.video_examples enable row level security;
alter table radas_v4.video_example_audit enable row level security;
revoke all on table radas_v4.video_examples,radas_v4.video_example_audit from public,anon,authenticated,service_role;
revoke all on sequence radas_v4.video_example_audit_id_seq from public,anon,authenticated,service_role;

create function radas_v4.video_examples_operation(p_actor uuid,p_action text,p_example jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_admin boolean; v_old jsonb; v_next jsonb; v_id uuid; v_revision integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
 v_admin:=exists(select 1 from radas_v4.payment_admins where user_id=p_actor);
 if p_action is null or p_action not in ('list','admin_list','save','delete') then raise exception 'invalid_example'; end if;
 if p_action<>'list' and not v_admin then raise exception 'forbidden' using errcode='42501'; end if;
 if p_action in ('save','delete') then
  if not radas_v4.video_example_valid(p_example) then raise exception 'invalid_example'; end if;
  perform pg_advisory_xact_lock(hashtextextended('radas_v4_video_examples',0));
  v_id:=(p_example->>'id')::uuid;v_revision:=(p_example->>'revision')::integer;
  select document into v_old from radas_v4.video_examples where id=v_id;
  if p_action='save' then
   if v_old is null then
    -- Never resurrect an earlier deleted reference when an old create response was lost.
    if v_revision<>0 or exists(select 1 from radas_v4.video_example_audit where example_id=v_id) or (select count(*) from radas_v4.video_examples)>=100 then raise exception 'example_conflict'; end if;
   elsif (v_old->>'revision')::integer<>v_revision then
    if (v_old->>'revision')::integer=v_revision+1 and v_old-'revision'=p_example-'revision' then return radas_v4.video_examples_operation(p_actor,'admin_list',null); end if;
    raise exception 'example_conflict';
   end if;
   v_next:=jsonb_set(p_example,'{revision}',to_jsonb(v_revision+1));
   insert into radas_v4.video_examples(id,document,updated_by) values(v_id,v_next,p_actor)
    on conflict(id) do update set document=excluded.document,updated_by=p_actor,updated_at=clock_timestamp();
  else
   if v_old is null then return radas_v4.video_examples_operation(p_actor,'admin_list',null); end if;
   if (v_old->>'revision')::integer<>v_revision then raise exception 'example_conflict'; end if;
   delete from radas_v4.video_examples where id=v_id;
  end if;
  insert into radas_v4.video_example_audit(example_id,actor,action,previous_document,next_document) values(v_id,p_actor,p_action,v_old,v_next);
 end if;
 return jsonb_build_object('admin',v_admin,'examples',coalesce((select jsonb_agg(document order by (document->>'sortOrder')::integer,created_at desc,id) from radas_v4.video_examples where p_action<>'list' or (document->>'published')::boolean),'[]'::jsonb));
end $$;
create function public.radas_v4_video_examples_operation(p_actor uuid,p_action text,p_example jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$select radas_v4.video_examples_operation(p_actor,p_action,p_example)$$;
revoke all on function radas_v4.video_examples_operation(uuid,text,jsonb),public.radas_v4_video_examples_operation(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function radas_v4.video_examples_operation(uuid,text,jsonb),public.radas_v4_video_examples_operation(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
