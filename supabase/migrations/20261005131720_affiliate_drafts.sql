-- Draft validation permits only explicit blanks; publish uses the original complete-field rules.
begin;
create or replace function radas_v4.affiliate_valid_product(p_product jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare v_id uuid; v_revision integer; v_date date; v_draft boolean;
begin
 if p_product is null or jsonb_typeof(p_product)<>'object' then return false; end if;
 if p_product ? 'sourceNotes' then
  if jsonb_typeof(p_product->'sourceNotes') is distinct from 'string' or length(p_product->>'sourceNotes')>4000 then return false; end if;
  p_product:=p_product-'sourceNotes';
 end if;
 -- Validate shape before substituting validation-only sentinels. They are never stored.
 if (select count(*) from jsonb_object_keys(p_product))<>11 or jsonb_typeof(p_product->'published') is distinct from 'boolean' then return false; end if;
 v_draft:=p_product->'published'='false'::jsonb;
 if v_draft then
  if p_product->'category'='""'::jsonb then p_product:=jsonb_set(p_product,'{category}','"Draft"'); end if;
  if p_product->'imageUrl'='""'::jsonb then p_product:=jsonb_set(p_product,'{imageUrl}','"https://example.invalid"'); end if;
  if p_product->'url'='""'::jsonb then p_product:=jsonb_set(p_product,'{url}','"https://example.invalid"'); end if;
  if p_product->'priceSen'='null'::jsonb then p_product:=jsonb_set(p_product,'{priceSen}','100000000'); end if;
  if p_product->'commissionSen'='null'::jsonb then p_product:=jsonb_set(p_product,'{commissionSen}','0'); end if;
  if p_product->'reviewedOn'='""'::jsonb then p_product:=jsonb_set(p_product,'{reviewedOn}','"2000-01-01"'); end if;
  if p_product->'contentTypes'='[]'::jsonb then p_product:=jsonb_set(p_product,'{contentTypes}','["POV"]'); end if;
 end if;
  begin
   if p_product is null or jsonb_typeof(p_product)<>'object' or (select count(*) from jsonb_object_keys(p_product))<>11 then raise exception 'invalid_product'; end if;
   if exists(select 1 from jsonb_object_keys(p_product) k where k not in ('id','name','imageUrl','category','priceSen','commissionSen','url','reviewedOn','contentTypes','published','revision')) then raise exception 'invalid_product'; end if;
   if jsonb_typeof(p_product->'id')<>'string' or (p_product->>'id')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'invalid_product'; end if;
   v_id:=(p_product->>'id')::uuid;
   if jsonb_typeof(p_product->'revision')<>'number' or (p_product->>'revision')!~'^[0-9]+$' then raise exception 'invalid_product'; end if;
   v_revision:=(p_product->>'revision')::integer;
   if jsonb_typeof(p_product->'name')<>'string' or length(p_product->>'name') not between 1 and 120 or p_product->>'name'<>btrim(p_product->>'name') or jsonb_typeof(p_product->'category')<>'string' or length(p_product->>'category') not between 1 and 60 or p_product->>'category'<>btrim(p_product->>'category') then raise exception 'invalid_product'; end if;
   if jsonb_typeof(p_product->'url')<>'string' or jsonb_typeof(p_product->'imageUrl')<>'string' or length(p_product->>'url')>2048 or length(p_product->>'imageUrl')>2048 or (p_product->>'url')!~'^https://[A-Za-z0-9.-]+(:[0-9]+)?([/?#][^[:space:]\\]*)?$' or (p_product->>'imageUrl')!~'^https://[A-Za-z0-9.-]+(:[0-9]+)?([/?#][^[:space:]\\]*)?$' then raise exception 'invalid_product'; end if;
   if jsonb_typeof(p_product->'priceSen')<>'number' or jsonb_typeof(p_product->'commissionSen')<>'number' or (p_product->>'priceSen')!~'^[0-9]+$' or (p_product->>'commissionSen')!~'^[0-9]+$' or (p_product->>'priceSen')::bigint>100000000 or (p_product->>'commissionSen')::bigint>(p_product->>'priceSen')::bigint then raise exception 'invalid_product'; end if;
   if jsonb_typeof(p_product->'published')<>'boolean' or jsonb_typeof(p_product->'reviewedOn')<>'string' or (p_product->>'reviewedOn')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_product'; end if;
   v_date:=(p_product->>'reviewedOn')::date;
   if v_date>current_date or to_char(v_date,'YYYY-MM-DD')<>p_product->>'reviewedOn' then raise exception 'invalid_product'; end if;
   if jsonb_typeof(p_product->'contentTypes')<>'array' or jsonb_array_length(p_product->'contentTypes') not between 1 and 7 then raise exception 'invalid_product'; end if;
   if exists(select 1 from jsonb_array_elements(p_product->'contentTypes') x where jsonb_typeof(x)<>'string' or x#>>'{}' not in ('POV','UGC','Demonstrasi','Unboxing','Review','Storytelling','Perbandingan')) or (select count(distinct x) from jsonb_array_elements(p_product->'contentTypes') x)<>jsonb_array_length(p_product->'contentTypes') then raise exception 'invalid_product'; end if;
  exception when others then return false; end;
 if v_revision>2147483646 then return false; end if;
 return true;
exception when others then return false;
end $$;
revoke all on function radas_v4.affiliate_valid_product(jsonb) from public,anon,authenticated,service_role;
create or replace function radas_v4.affiliate_operation(p_actor uuid,p_action text,p_product jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_admin boolean; v_access boolean; v_id uuid; v_old jsonb; v_next jsonb; v_revision integer; v_date date;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
 v_admin:=exists(select 1 from radas_v4.payment_admins where user_id=p_actor);
 if p_action is null or p_action not in ('list','admin_list','save','delete') then raise exception 'invalid_product'; end if;
 if p_action<>'list' and not v_admin then raise exception 'forbidden' using errcode='42501'; end if;
 v_access:=v_admin or (exists(select 1 from radas_v4.payments where user_id=p_actor and status='approved') and exists(select 1 from radas_v4.credit_wallets where user_id=p_actor and balance>=1));
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
 return jsonb_build_object('admin',v_admin,'access',case when v_access then 'allowed' else 'locked' end,'products',case when v_access then coalesce((select jsonb_agg(case when p_action='list' then document-'sourceNotes' else document end order by lower(document->>'name'),id) from radas_v4.affiliate_products where p_action<>'list' or (document->>'published')::boolean),'[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function radas_v4.affiliate_operation(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function radas_v4.affiliate_operation(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
