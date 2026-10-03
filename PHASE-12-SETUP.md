# PHASE 12 — Payment Safety

## Scope

Only RADAS V4: wancupie-netizen/radas-v4, localhost:3000, future video.radas.my. app.radas.my is unrelated. Existing Maybank QR, packages and .env.local remain unchanged.

Packages: Try RM5/60, Starter RM10/120, Creator RM20/250, Power RM50/620.

## Install

1. Apply the ZIP with APPLY.ps1. Required main commit: f3d9091a8b487f9c979b6f0289e37e9058a8fa76. The installer validates repo and baseline, creates a source backup and runs local checks.
2. In Supabase project fyqvvkpzcwrmyozxlqkw SQL Editor, run supabase/migrations/20261003064719_payment_safety.sql once. The installer copies this SQL to clipboard. This replaces the private payment function and creates a ledger guard; it does not delete data or grant credits.
3. Run supabase/verify-payment-safety.sql. All 12 checks must be true. If a migration rerun reports payment_safety_already_installed, stop; do not drop the guard to rerun.
4. Restart npm run dev. Verify existing login, unchanged balance and packages, admin access at /admin/payments, and cancellation of an unpaid order. No fake payment approval on the live database.
5. Send SQL results and local acceptance. Commit and push after acceptance.

## Safety behavior

An administrator must check the real bank transaction and exact amount before approving. Approval and its ledger/wallet writes form one transaction. A normalized bank reference funds one payment globally. Repeating the same confirmed request grants no extra credits; a changed reference conflicts. Pending, submitted, rejected and cancelled orders do not grant credits.

New top-ups through the older credit RPC are denied unless linked to an approved payment. Existing ledger rows and idempotent repeats remain unchanged. Debit/refund operations continue normally. No automatic bank reconciliation, transfer or webhook is added.

Unknown database failures return unavailable rather than a fabricated balance or successful payment. The server does not automatically retry payment writes; repeating the original request is protected by database idempotency.

## Verification limits

Local tests run real isolated SQL, TypeScript service parsing and HTTP handlers with mocked Supabase transport. They cover fixed packages, ownership, permissions, reference reuse, rollback and replay. PGlite has one queued connection; these checks do not prove live multi-session concurrency. No real bank transaction or live credit approval was performed.
