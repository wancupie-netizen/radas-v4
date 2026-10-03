# PHASE 14 status

- Existing verified auth, server-side wallet validation, private API keys, atomic generation claims and payment idempotency preserved.
- Added server-only Supabase-backed per-account limits: generation POST 12 / 60 seconds; payment POST 20 / 60 seconds. Fixed two scopes, bounded rows/counters, RLS and no direct table access.
- Excess requests return private no-store HTTP 429 + Retry-After; original generation ID remains held for safe replay. Limit/config/database failure stops writes before provider or billing access.
- Privileged credit/generation/storage clients now require the exact V4 project; secret-bearing RPC redirects denied and requests bounded.
- Build, integrated real SQL/routes/limit/replay tests, browser JS secret-boundary scan, errors, generation, payments, storage and auth passed.
- PGlite uses a queued single connection; real PostgreSQL multi-session concurrency is a separate verification. Regression billing fixtures mock the limiter; check:protection combines real limiter and billing SQL/routes.
- Owner SQL installation (12 checks) and localhost acceptance pending. No live credit mutation, bank/provider calls, commit or push performed.
