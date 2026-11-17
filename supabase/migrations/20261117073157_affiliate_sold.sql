-- Optional manual sold snapshots on existing product documents. No data backfill or credit changes.
begin;
do $$
declare definition text;
begin
 if to_regprocedure('radas_v4.affiliate_valid_product(jsonb)') is null or to_regprocedure('radas_v4.affiliate_operation(uuid,text,jsonb)') is null then raise exception 'affiliate_required'; end if;
 if to_regprocedure('radas_v4.affiliate_valid_product_before_sold(jsonb)') is not null or to_regprocedure('radas_v4.affiliate_operation_before_sold(uuid,text,jsonb)') is not null then raise exception 'affiliate_sold_already_installed'; end if;
 -- Preserve the actual installed validation/order/access implementation, not an old migration copy.
 definition:=pg_get_functiondef('radas_v4.affiliate_valid_product(jsonb)'::regprocedure);
 if position('FUNCTION radas_v4.affiliate_valid_product(' in definition)=0 then raise exception 'unexpected_affiliate_validator_definition'; end if;
 execute replace(definition,'FUNCTION radas_v4.affiliate_valid_product(','FUNCTION radas_v4.affiliate_valid_product_before_sold(');
 definition:=pg_get_functiondef('radas_v4.affiliate_operation(uuid,text,jsonb)'::regprocedure);
 if position('FUNCTION radas_v4.affiliate_operation(' in definition)=0 then raise exception 'unexpected_affiliate_operation_definition'; end if;
 execute replace(definition,'FUNCTION radas_v4.affiliate_operation(','FUNCTION radas_v4.affiliate_operation_before_sold(');
end $$;
revoke all on function radas_v4.affiliate_valid_product_before_sold(jsonb),radas_v4.affiliate_operation_before_sold(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function radas_v4.affiliate_valid_sold_fields(p_product jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare v_text text; v_day text; v_date date;
begin
 if p_product is null or jsonb_typeof(p_product)<>'object' then return false; end if;
 if not (p_product ? 'soldText') and not (p_product ? 'soldCheckedOn') then return true; end if;
 if not (p_product ?& array['soldText','soldCheckedOn']) or jsonb_typeof(p_product->'soldText') is distinct from 'string' or jsonb_typeof(p_product->'soldCheckedOn') is distinct from 'string' then return false; end if;
 v_text:=p_product->>'soldText';v_day:=p_product->>'soldCheckedOn';
 if v_text='' and v_day='' then return true; end if;
 if length(v_text)>20 or v_text !~ '^(?:(?:0|[1-9][0-9]*)|[1-9][0-9]{0,2}(?:,[0-9]{3})+|(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?[KkMmBb])[+]?$' or v_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
 v_date:=v_day::date;
 return to_char(v_date,'YYYY-MM-DD')=v_day and v_date<=(current_timestamp at time zone 'Asia/Kuala_Lumpur')::date;
exception when others then return false;
end $$;
revoke all on function radas_v4.affiliate_valid_sold_fields(jsonb) from public,anon,authenticated,service_role;

create or replace function radas_v4.affiliate_valid_product(p_product jsonb) returns boolean
language plpgsql stable set search_path='' as $$
begin
 return radas_v4.affiliate_valid_sold_fields(p_product) and radas_v4.affiliate_valid_product_before_sold(p_product-'soldText'-'soldCheckedOn');
end $$;
revoke all on function radas_v4.affiliate_valid_product(jsonb) from public,anon,authenticated,service_role;

create or replace function radas_v4.affiliate_operation(p_actor uuid,p_action text,p_product jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_old jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_action='save' then
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
  if not exists(select 1 from radas_v4.payment_admins where user_id=p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('radas_v4_affiliate',0));
  -- Old browser/server versions omit the optional pair. Preserve existing sold information.
  if jsonb_typeof(p_product)='object' and not (p_product ? 'soldText') and not (p_product ? 'soldCheckedOn') and (p_product->>'id')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   select document into v_old from radas_v4.affiliate_products where id=(p_product->>'id')::uuid;
   if v_old ?& array['soldText','soldCheckedOn'] then p_product:=p_product||jsonb_build_object('soldText',v_old->>'soldText','soldCheckedOn',v_old->>'soldCheckedOn'); end if;
  end if;
 end if;
 return radas_v4.affiliate_operation_before_sold(p_actor,p_action,p_product);
end $$;
revoke all on function radas_v4.affiliate_operation(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function radas_v4.affiliate_operation(uuid,text,jsonb) to service_role;

create function radas_v4.affiliate_sold_operation(p_actor uuid,p_id uuid,p_revision integer,p_sold_text text,p_sold_checked_on text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_old jsonb; v_next jsonb; v_revision integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
 if not exists(select 1 from radas_v4.payment_admins where user_id=p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_id is null or p_revision is null or p_revision not between 0 and 2147483646 or not radas_v4.affiliate_valid_sold_fields(jsonb_build_object('soldText',p_sold_text,'soldCheckedOn',p_sold_checked_on)) then raise exception 'invalid_product'; end if;
 perform pg_advisory_xact_lock(hashtextextended('radas_v4_affiliate',0));
 select document into v_old from radas_v4.affiliate_products where id=p_id;
 if v_old is null then raise exception 'catalog_conflict'; end if;
 v_revision:=(v_old->>'revision')::integer;
 if v_revision<>p_revision then
  -- Retry only an identical committed update whose response was lost.
  if v_revision=p_revision+1 and v_old ?& array['soldText','soldCheckedOn'] and v_old->>'soldText'=p_sold_text and v_old->>'soldCheckedOn'=p_sold_checked_on then
   return radas_v4.affiliate_operation(p_actor,'admin_list',null);
  end if;
  raise exception 'catalog_conflict';
 end if;
 v_next:=v_old||jsonb_build_object('soldText',p_sold_text,'soldCheckedOn',p_sold_checked_on);
 -- Existing save path retains revision conflict checks and its atomic audit entry.
 return radas_v4.affiliate_operation(p_actor,'save',v_next);
end $$;
create function public.radas_v4_affiliate_sold_operation(p_actor uuid,p_id uuid,p_revision integer,p_sold_text text,p_sold_checked_on text) returns jsonb
language sql security invoker set search_path='' as $$select radas_v4.affiliate_sold_operation(p_actor,p_id,p_revision,p_sold_text,p_sold_checked_on)$$;
revoke all on function radas_v4.affiliate_sold_operation(uuid,uuid,integer,text,text),public.radas_v4_affiliate_sold_operation(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function radas_v4.affiliate_sold_operation(uuid,uuid,integer,text,text),public.radas_v4_affiliate_sold_operation(uuid,uuid,integer,text,text) to service_role;
notify pgrst,'reload schema';
commit;
