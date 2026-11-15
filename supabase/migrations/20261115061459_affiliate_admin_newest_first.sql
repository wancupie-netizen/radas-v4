-- Admin-only newest-created order; no product, audit, credit or payment data updates.
begin;
create or replace function radas_v4.affiliate_operation(p_actor uuid,p_action text,p_product jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_admin boolean; v_id uuid; v_old jsonb; v_next jsonb; v_revision integer; v_date date;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
 v_admin:=exists(select 1 from radas_v4.payment_admins where user_id=p_actor);
 if p_action is null or p_action not in ('list','admin_list','save','delete') then raise exception 'invalid_product'; end if;
 if p_action<>'list' and not v_admin then raise exception 'forbidden' using errcode='42501'; end if;
 if p_action in ('save','delete') then
  -- Serialize catalogue mutations and bound total catalogue size. Revision prevents stale admin overwrites.
  perform pg_advisory_xact_lock(hashtextextended('radas_v4_affiliate',0));
  if not radas_v4.affiliate_valid_product(p_product) then raise exception 'invalid_product'; end if;
  v_id:=(p_product->>'id')::uuid;
  v_revision:=(p_product->>'revision')::integer;
  select document into v_old from radas_v4.affiliate_products where id=v_id;
  if p_action='save' then
   if v_old is null then
    if v_revision<>0 then raise exception 'catalog_conflict'; end if;
    if (select count(*) from radas_v4.affiliate_products)>=500 then raise exception 'catalog_conflict'; end if;
   elsif (v_old->>'revision')::integer<>v_revision then
    if (v_old->>'revision')::integer=v_revision+1 and v_old-'revision'=p_product-'revision' then
     return radas_v4.affiliate_operation(p_actor,'admin_list',null);
    end if;
    raise exception 'catalog_conflict';
   end if;
   v_next:=jsonb_set(p_product,'{revision}',to_jsonb(v_revision+1));
   insert into radas_v4.affiliate_products(id,document,updated_by) values(v_id,v_next,p_actor) on conflict(id) do update set document=excluded.document,updated_by=p_actor,updated_at=clock_timestamp();
  else
   if v_old is null then return radas_v4.affiliate_operation(p_actor,'admin_list',null); end if;
   if (v_old->>'revision')::integer<>v_revision then raise exception 'catalog_conflict'; end if;
   delete from radas_v4.affiliate_products where id=v_id;
  end if;
  insert into radas_v4.affiliate_audit(product_id,actor,action,previous_document,next_document) values(v_id,p_actor,p_action,v_old,v_next);
 end if;
 -- Creation audit entries distinguish new products from edits. Legacy rows without
 -- a creation audit sort last, by name; no creation time is invented or backfilled.
 return jsonb_build_object('admin',v_admin,'access','allowed','products',coalesce((
  select jsonb_agg(case when p_action='list' then p.document-'sourceNotes' else p.document end
   order by case when p_action<>'list' then born.created_at end desc nulls last,
            case when p_action<>'list' then born.creation_id end desc nulls last,
            lower(p.document->>'name'),p.id)
  from radas_v4.affiliate_products p
  left join (
   select product_id,max(created_at) as created_at,max(id) as creation_id
   from radas_v4.affiliate_audit
   where p_action<>'list' and action='save' and previous_document is null
   group by product_id
  ) born on born.product_id=p.id
  where p_action<>'list' or (p.document->>'published')::boolean
 ),'[]'::jsonb));
end $$;
revoke all on function radas_v4.affiliate_operation(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function radas_v4.affiliate_operation(uuid,text,jsonb) to service_role;
commit;
