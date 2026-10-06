-- Private delivery tracking; does not change payment approval or credit rules.
begin;
create table if not exists radas_v4.payment_notifications (
 payment_id uuid primary key references radas_v4.payments(id) on delete cascade,
 created_at timestamptz not null default now(),
 attempts integer not null default 0 check(attempts between 0 and 5),
 claim_id uuid, retry_at timestamptz not null default now(),
 sent_at timestamptz, last_error text check(last_error is null or last_error='telegram_delivery_failed')
);
alter table radas_v4.payment_notifications enable row level security;
revoke all on radas_v4.payment_notifications from public,anon,authenticated,service_role;
create or replace function radas_v4.enqueue_payment_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='pending' and new.status='submitted' then
  insert into radas_v4.payment_notifications(payment_id) values(new.id) on conflict(payment_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function radas_v4.enqueue_payment_notification() from public,anon,authenticated,service_role;
drop trigger if exists payment_notification_submitted on radas_v4.payments;
create trigger payment_notification_submitted after update of status on radas_v4.payments
 for each row execute function radas_v4.enqueue_payment_notification();

create or replace function radas_v4.payment_notification(p_actor uuid,p_action text,p_id uuid,p_claim uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_admin boolean;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or p_actor is null or
  not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then
  raise exception 'server_only' using errcode='42501';
 end if;
 v_admin:=exists(select 1 from radas_v4.payment_admins where user_id=p_actor);
 if p_id is null and not v_admin then raise exception 'forbidden' using errcode='42501';end if;
 if p_id is not null and not v_admin and not exists(select 1 from radas_v4.payments where id=p_id and user_id=p_actor) then
  raise exception 'forbidden' using errcode='42501';end if;
 if p_claim is null then raise exception 'invalid_request';end if;
 if p_action='claim' then
  select n.payment_id into v_id from radas_v4.payment_notifications n
   where (p_id is null or n.payment_id=p_id) and n.sent_at is null and n.attempts<5 and n.retry_at<=now()
   order by n.created_at,n.payment_id for update skip locked limit 1;
  if not found then return null;end if;
  update radas_v4.payment_notifications set claim_id=p_claim,attempts=attempts+1,retry_at=now()+interval '2 minutes' where payment_id=v_id;
  return (select jsonb_build_object('id',p.id,'package_id',p.package_id,'amount_sen',p.amount_sen,'credits',p.credits,
   'customer_email',u.email,'whatsapp',p.whatsapp,'customer_reference',p.customer_reference)
   from radas_v4.payments p left join auth.users u on u.id=p.user_id where p.id=v_id);
 elsif p_action in ('sent','failed') and p_id is not null then
  update radas_v4.payment_notifications set sent_at=case when p_action='sent' then now() else null end,
   last_error=case when p_action='failed' then 'telegram_delivery_failed' else null end,claim_id=null
   where payment_id=p_id and claim_id=p_claim and sent_at is null;
  return null;
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function radas_v4.payment_notification(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function radas_v4.payment_notification(uuid,text,uuid,uuid) to service_role;
create or replace function public.radas_v4_payment_notification(p_actor uuid,p_action text,p_id uuid,p_claim uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select radas_v4.payment_notification(p_actor,p_action,p_id,p_claim);
$$;
revoke all on function public.radas_v4_payment_notification(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.radas_v4_payment_notification(uuid,text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
