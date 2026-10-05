-- Contact details only. Existing payment approval and credit engine stay intact.
begin;
alter table radas_v4.payments add column if not exists whatsapp text
 check (whatsapp is null or whatsapp ~ '^[1-9][0-9]{7,14}$');
create or replace function radas_v4.payment_contact_operation(
 p_actor uuid,p_action text,p_id uuid default null,p_package text default null,
 p_reference text default null,p_amount integer default null,p_reason text default null,p_whatsapp text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_row radas_v4.payments; v_phone text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unauthorized' using errcode='42501'; end if;
 if p_action in ('create','contact') then
  if p_whatsapp is null or length(p_whatsapp)>40 or btrim(p_whatsapp) !~ '^[+0-9 ()-]+$' then raise exception 'invalid_whatsapp'; end if;
  v_phone:=regexp_replace(btrim(p_whatsapp),'[ ()-]','','g');
  if left(v_phone,1)='+' then v_phone:=substr(v_phone,2); end if;
  if left(v_phone,2)='01' then v_phone:='6'||v_phone; end if;
  if v_phone !~ '^[1-9][0-9]{7,14}$' then raise exception 'invalid_whatsapp'; end if;
 end if;
 if p_action='contact' then
  select * into v_row from radas_v4.payments where id=p_id and user_id=p_actor for update;
  if not found then raise exception 'not_found'; end if;
  if v_row.status not in ('pending','submitted') then raise exception 'payment_locked'; end if;
  update radas_v4.payments set whatsapp=v_phone where id=p_id returning * into v_row;
  return jsonb_build_object('payment',to_jsonb(v_row)-'bank_reference'-'reviewed_by');
 end if;
 -- The original operation remains the sole authority for state changes and credit grants.
 v_result:=radas_v4.payment_operation(p_actor,p_action,p_id,p_package,p_reference,p_amount,p_reason);
 if p_action='admin_list' then
  -- Original operation has already verified payment administrator membership.
  return jsonb_build_object('payments',coalesce((select jsonb_agg(
   item || jsonb_build_object('customer_email',u.email,'whatsapp',p.whatsapp) order by ord
  ) from jsonb_array_elements(v_result->'payments') with ordinality entries(item,ord)
   join radas_v4.payments p on p.id=(item->>'id')::uuid
   left join auth.users u on u.id=p.user_id),'[]'::jsonb));
 elsif p_action='list' then
  return jsonb_set(v_result,'{payments}',coalesce((select jsonb_agg(
   item || jsonb_build_object('whatsapp',p.whatsapp) order by ord
  ) from jsonb_array_elements(v_result->'payments') with ordinality entries(item,ord)
   join radas_v4.payments p on p.id=(item->>'id')::uuid),'[]'::jsonb));
 elsif p_action='create' then
  -- Replayed requests never replace an existing contact number.
  update radas_v4.payments set whatsapp=v_phone
   where id=(v_result->'payment'->>'id')::uuid and user_id=p_actor
    and status in ('pending','submitted') and whatsapp is null;
  select * into v_row from radas_v4.payments where id=(v_result->'payment'->>'id')::uuid and user_id=p_actor;
  return jsonb_build_object('payment',to_jsonb(v_row)-'bank_reference'-'reviewed_by');
 end if;
 return v_result;
end $$;
revoke all on function radas_v4.payment_contact_operation(uuid,text,uuid,text,text,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function radas_v4.payment_contact_operation(uuid,text,uuid,text,text,integer,text,text) to service_role;
create or replace function public.radas_v4_payment_contact_operation(
 p_actor uuid,p_action text,p_id uuid default null,p_package text default null,
 p_reference text default null,p_amount integer default null,p_reason text default null,p_whatsapp text default null
) returns jsonb language sql security invoker set search_path='' as $$
 select radas_v4.payment_contact_operation(p_actor,p_action,p_id,p_package,p_reference,p_amount,p_reason,p_whatsapp);
$$;
revoke all on function public.radas_v4_payment_contact_operation(uuid,text,uuid,text,text,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.radas_v4_payment_contact_operation(uuid,text,uuid,text,text,integer,text,text) to service_role;
notify pgrst,'reload schema';
commit;
