# PHASE 14 — Basic Protection

## Install

Only wancupie-netizen/radas-v4, main at 93b9fe23f14fe77a69e29f045816e4d3f46dc771. The ZIP installer validates repo/baseline, backs up tracked source, applies Phase 14 and runs local checks. .env.local, pricing and bank QR are unchanged. No new npm package or environment variable required.

1. Apply the ZIP through the supplied PowerShell loader.
2. In Supabase project fyqvvkpzcwrmyozxlqkw, SQL Editor, paste the copied supabase/migrations/20261003081608_basic_protection.sql and Run once. It creates only V4 limiter state/functions; existing wallet/payment/video data is preserved.
3. Run supabase/verify-basic-protection.sql. All 12 checks must be true. If rerun reports basic_protection_already_installed, stop; do not drop/reset state.
4. Restart npm run dev and verify login, unchanged balance, Generate disabled at zero balance, packages and admin access. You may create/cancel an unpaid order; do not approve fake payments or grant test credits live.
5. Send SQL results and local acceptance before commit/push.

Until the new SQL is installed, generation/payment POST fail closed. GET credit/payment/status/video behavior remains unchanged.

## Limits

| Route | Limit per verified account |
| --- | --- |
| POST /api/generations | 12 attempts in a 60-second window |
| POST /api/payments | 20 attempts in a 60-second window |

The window starts with the first allowed attempt and resets after 60 seconds. Invalid bodies and repeated IDs count too, because the limiter runs after auth/origin/feature checks and before body parsing, provider or billing access. Accounts and scopes are independent. User-selected headers/IP/request IDs cannot choose the limiter identity or increase the threshold.

HTTP 429 includes Retry-After (1–60 seconds) and private no-store headers. Wait, then check/replay the same original generation request. Do not generate a new ID after an ambiguous response. Payment status checks remain available; do not pay again.

Limiter state is in Supabase, so it survives Node restarts and is shared across Vercel instances. At most two state rows per account; rows are reused and removed by the user foreign-key cascade if the account is deleted. No growing per-request event log, Redis or background cleanup is added.

Limits apply to the two authenticated write routes. This phase adds no IP/WAF limit, signup/login limit or GET quota. Existing server-side poll throttling, auth checks and storage ownership/expiry still apply. This is a basic application limit, not a claim of full DDoS protection.

## Existing protections verified

- Auth server getUser, rather than trusting browser-supplied IDs/session data.
- Wallet debit, generation reservation and private claim are atomic/idempotent.
- Provider paid POST is never automatically retried; unknown outcomes remain held.
- Supabase/NexaBot secrets stay in server-only modules; built browser JavaScript scanned for secret-variable identifiers/test secret markers.
- Privileged generation/storage/credit clients are bound to the exact V4 Supabase URL; secret-bearing redirects denied.
- Payments require admin bank verification, exact package amount, unique normalized bank reference and one atomic approval/ledger/wallet transaction.

## Tests and limits of verification

Run npm run build before npm run check:protection. Protection tests install all V4 migrations into isolated PGlite and exercise the actual limiter, route handlers and generation/payment SQL together. Twenty generation replays permit one provider fixture submit/debit, blocked attempts return 429, and same-ID replay after window reset creates no second paid submit. Payment attempts over the cap grant no credits. Provider/Auth/SDK transport are mocked; no live transaction or paid provider call occurs.

PGlite has one queued connection. These checks validate SQL transitions and burst behavior, not real PostgreSQL multi-session contention. Existing generation/payment regression fixtures mock the limiter to keep their billing scenarios independent; the integrated check:protection suite tests their combination.

Future V4 domain: video.radas.my. Development: http://localhost:3000/. app.radas.my is unrelated.
