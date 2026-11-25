-- Additive read-only timing/recovery RPC. No existing functions, rows, indexes or ledger changes.
begin;
create function radas_v4.generation_timing(p_user_id uuid,p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g radas_v4.generations%rowtype; f radas_v4.video_finalizations%rowtype;
 v_stored timestamptz; v_stop timestamptz; v_state text; v_now timestamptz := statement_timestamp();
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
 if p_user_id is null then raise exception 'owner_required' using errcode='22023'; end if;
 select g0.* into g from radas_v4.generations g0 left join radas_v4.video_finalizations f0 on f0.generation_id=g0.id
 where g0.user_id=p_user_id and g0.expires_at>v_now and (p_id is not null and g0.id=p_id or p_id is null
  and g0.expires_at>v_now and not g0.refunded and g0.unknown_released_at is null
  and (to_jsonb(g0)->>'admin_released_at') is null and g0.slot_released_at is null
  and (g0.status in ('reserved','submitting','unknown','queued','processing')
   or g0.status='done' and (f0.state is distinct from 'ready' or not exists(select 1 from radas_v4.video_objects where generation_id=g0.id))))
 order by case when g0.status in ('reserved','submitting','unknown','queued','processing') then 0 else 1 end,g0.created_at desc,g0.id desc limit 1;
 if g.id is null then return jsonb_build_object('serverNow',v_now,'item',null); end if;
 select * into f from radas_v4.video_finalizations where generation_id=g.id;
 select stored_at into v_stored from radas_v4.video_objects where generation_id=g.id;
 v_state := case when g.expires_at<=v_now then 'expired' when g.status<>'done' then 'pending'
  when f.state='ready' and v_stored is not null then 'ready' when f.state='needs_review' then 'needs_review' else 'finalizing' end;
 v_stop := case when g.status in ('failed','rejected') then g.updated_at
  when g.unknown_released_at is not null then g.unknown_released_at
  when (to_jsonb(g)->>'admin_released_at') is not null then (to_jsonb(g)->>'admin_released_at')::timestamptz
  when g.slot_released_at is not null or g.expires_at<=v_now then g.expires_at
  when f.state='ready' and v_stored is not null and g.status='done' then greatest(f.updated_at,v_stored)
  when f.state='needs_review' then f.updated_at else null end;
 if v_stop is not null then v_stop := greatest(g.created_at,least(v_stop,g.expires_at,v_now)); end if;
 return jsonb_build_object('serverNow',v_now,'item',jsonb_build_object(
  'startedAt',g.created_at,'stoppedAt',v_stop,'prompt',g.prompt,'mode',g.mode,'orientation',g.orientation,'resolution',g.resolution::text,
  'generation',jsonb_build_object('id',g.id,'status',g.status,'expiresAt',g.expires_at,'refunded',g.refunded,'videoState',v_state,
   'slotReleasedAt',g.slot_released_at,
   'releasedAt',case when g.status='unknown' then coalesce(g.unknown_released_at,(to_jsonb(g)->>'admin_released_at')::timestamptz) else null end,
   'releaseAfter',case when g.status='unknown' and g.provider_job_id is null and not g.refunded and g.unknown_released_at is null and (to_jsonb(g)->>'admin_released_at') is null then g.updated_at+interval '2 minutes' else null end)));
end $$;
create function public.radas_v4_generation_timing(p_user_id uuid,p_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$select radas_v4.generation_timing(p_user_id,p_id)$$;
revoke all on function radas_v4.generation_timing(uuid,uuid),public.radas_v4_generation_timing(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function radas_v4.generation_timing(uuid,uuid),public.radas_v4_generation_timing(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
