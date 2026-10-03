-- RADAS V4 only: per verified account, fixed one-minute windows, no credit mutation.
begin;
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='radas_v4.credit_transactions'::regclass and tgname='credit_payment_guard') then raise exception 'phase12_required'; end if;
 if to_regclass('radas_v4.request_limits') is not null or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='radas_v4_request_limit') then raise exception 'basic_protection_already_installed'; end if;
end $$;
create table radas_v4.request_limits (
 user_id uuid not null references auth.users(id) on delete cascade,
 scope text not null check(scope in ('generation','payment')),
 window_start timestamptz not null,
 used integer not null check(used between 1 and 20),
 primary key(user_id,scope)
);
alter table radas_v4.request_limits enable row level security;
revoke all on radas_v4.request_limits from public,anon,authenticated,service_role;
create function radas_v4.request_limit(p_user_id uuid,p_scope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp();v_limit integer;v_row radas_v4.request_limits;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
 v_limit:=case p_scope when 'generation' then 12 when 'payment' then 20 end;
 if v_limit is null then raise exception 'invalid_scope'; end if;
 insert into radas_v4.request_limits as limits(user_id,scope,window_start,used) values(p_user_id,p_scope,v_now,1)
 on conflict(user_id,scope) do update set
  window_start=case when limits.window_start<=v_now-interval '1 minute' then v_now else limits.window_start end,
  used=case when limits.window_start<=v_now-interval '1 minute' then 1 else limits.used+1 end
 where limits.window_start<=v_now-interval '1 minute' or limits.used<v_limit
 returning * into v_row;
 if found then return jsonb_build_object('allowed',true,'retryAfter',0); end if;
 select * into v_row from radas_v4.request_limits where user_id=p_user_id and scope=p_scope;
 return jsonb_build_object('allowed',false,'retryAfter',greatest(1,least(60,ceil(extract(epoch from v_row.window_start+interval '1 minute'-v_now))::integer)));
end $$;
revoke all on function radas_v4.request_limit(uuid,text) from public,anon,authenticated;
grant execute on function radas_v4.request_limit(uuid,text) to service_role;
create function public.radas_v4_request_limit(p_user_id uuid,p_scope text) returns jsonb
language sql security invoker set search_path='' as $$select radas_v4.request_limit(p_user_id,p_scope)$$;
revoke all on function public.radas_v4_request_limit(uuid,text) from public,anon,authenticated;
grant execute on function public.radas_v4_request_limit(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
