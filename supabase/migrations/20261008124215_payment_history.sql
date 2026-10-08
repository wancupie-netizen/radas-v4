-- Admin-only read access to completed payment records. No payment/credit mutations.
begin;
create index if not exists payments_history_recent on radas_v4.payments
  (coalesce(reviewed_at,created_at) desc,id) where status in ('approved','rejected');
create or replace function radas_v4.payment_history(p_actor uuid,p_page integer default 1,p_query text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null)
   or not exists(select 1 from radas_v4.payment_admins where user_id=p_actor) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if p_page is null or p_page not between 1 and 100000 or p_query is null or length(p_query)>254 then
   raise exception 'invalid_request' using errcode='22023';
 end if;
 with matching as materialized (
   select p.id,p.user_id,p.package_id,p.amount_sen,p.credits,p.status,p.customer_reference,p.reason,
     p.created_at,p.reviewed_at,p.whatsapp,u.email as customer_email,coalesce(p.reviewed_at,p.created_at) as sort_at
   from radas_v4.payments p join auth.users u on u.id=p.user_id
   where p.status in ('approved','rejected') and
     (btrim(p_query)='' or strpos(lower(coalesce(u.email,'')),lower(btrim(p_query)))>0
       or (btrim(p_query) ~ '^[+0-9 ()-]+$' and regexp_replace(p_query,'[^0-9]','','g')<>''
         and strpos(coalesce(p.whatsapp,''),regexp_replace(p_query,'[^0-9]','','g'))>0))
 ), summary as (select count(*)::integer as total from matching),
 paging as (select total,least(p_page,greatest(1,(total+8)/9)) as page from summary)
 select jsonb_build_object('total',paging.total,'page',paging.page,'pageSize',9,'payments',
   coalesce((select jsonb_agg(to_jsonb(rows)-'sort_at' order by rows.sort_at desc,rows.id)
     from (select * from matching order by sort_at desc,id limit 9 offset (paging.page-1)*9) rows),'[]'::jsonb))
 into v_result from paging;
 return v_result;
end;
$$;
revoke all on function radas_v4.payment_history(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function radas_v4.payment_history(uuid,integer,text) to service_role;
create or replace function public.radas_v4_payment_history(p_actor uuid,p_page integer default 1,p_query text default '') returns jsonb
language sql security invoker set search_path='' as $$ select radas_v4.payment_history(p_actor,p_page,p_query); $$;
revoke all on function public.radas_v4_payment_history(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.radas_v4_payment_history(uuid,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
