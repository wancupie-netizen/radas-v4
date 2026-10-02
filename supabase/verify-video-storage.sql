select 'video_metadata_table' as check_name,to_regclass('radas_v4.video_objects') is not null as passed
union all select 'video_metadata_rls',coalesce((select relrowsecurity from pg_class where oid=to_regclass('radas_v4.video_objects')),false)
union all select 'browser_metadata_denied',not has_table_privilege('authenticated','radas_v4.video_objects','SELECT,INSERT,UPDATE,DELETE')
union all select 'service_direct_metadata_write_denied',not has_table_privilege('service_role','radas_v4.video_objects','INSERT,UPDATE,DELETE')
union all select 'anonymous_rpc_denied',not has_function_privilege('anon','public.radas_v4_video_object_operation(text,uuid,uuid,bigint)','EXECUTE')
union all select 'browser_rpc_denied',not has_function_privilege('authenticated','public.radas_v4_video_object_operation(text,uuid,uuid,bigint)','EXECUTE')
union all select 'service_rpc_allowed',has_function_privilege('service_role','public.radas_v4_video_object_operation(text,uuid,uuid,bigint)','EXECUTE')
union all select 'public_wrapper_invoker',not (select prosecdef from pg_proc where oid='public.radas_v4_video_object_operation(text,uuid,uuid,bigint)'::regprocedure)
union all select 'private_bucket',exists(select 1 from storage.buckets where id='radas-v4-videos' and not public and file_size_limit=52428800 and allowed_mime_types=array['video/mp4'])
union all select 'restrictive_browser_policy',exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='radas_v4_video_objects_private' and not polpermissive and polcmd='*' and polroles @> array['anon'::regrole::oid,'authenticated'::regrole::oid] and pg_get_expr(polqual,polrelid) like '%radas-v4-videos%' and pg_get_expr(polwithcheck,polrelid) like '%radas-v4-videos%')
union all select 'metadata_matches_owner_path',not exists(select 1 from radas_v4.video_objects v join radas_v4.generations g on g.id=v.generation_id where v.object_path<>g.user_id::text||'/'||g.id::text||'.mp4')
union all select 'stored_jobs_done_without_refund',not exists(select 1 from radas_v4.video_objects v join radas_v4.generations g on g.id=v.generation_id where g.status<>'done' or g.refunded)
union all select 'wallet_matches_ledger',not exists(select 1 from radas_v4.credit_wallets w where w.balance<>(select coalesce(sum(amount),0) from radas_v4.credit_transactions t where t.user_id=w.user_id));
