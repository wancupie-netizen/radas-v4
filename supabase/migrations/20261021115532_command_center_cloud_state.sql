-- RADAS only: fyqvvkpzcwrmyozxlqkw. Browser access is denied; the owner API
-- verifies Auth before using the existing server-only service credential.
create table public.radas_v4_command_center (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object' and state ? 'projects'),
  version integer not null check (version > 0),
  mutation_id uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.radas_v4_command_center enable row level security;
revoke all on public.radas_v4_command_center from public, anon, authenticated;
grant select, insert, update on public.radas_v4_command_center to service_role;
comment on table public.radas_v4_command_center is 'Private owner Command Center state; API uses version compare-and-swap to prevent stale overwrites.';
