-- Run only in project fyqvvkpzcwrmyozxlqkw after installing the migration.
select c.relname, c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_read,
  has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_read,
  has_table_privilege('service_role', c.oid, 'INSERT') as service_insert,
  has_table_privilege('service_role', c.oid, 'UPDATE') as service_update
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='radas_v4_command_center';

-- Verify persistence without displaying private content.
select version, updated_at,
  jsonb_array_length(coalesce(state->'isteriVideos', '[]'::jsonb)) as video_links
from public.radas_v4_command_center;
