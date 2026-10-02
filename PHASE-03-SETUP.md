# PHASE 03 — Credit Engine

Target repo: https://github.com/wancupie-netizen/radas-v4
Baseline: 8a540629a63c254957ade1ff37057b3ee4621b4e
Supabase project: fyqvvkpzcwrmyozxlqkw
App: https://app.radas.my/

## Apply code

Keep RADAS_PHASE_03_CREDIT_ENGINE.zip in Downloads. The supplied PowerShell reads the ZIP directly, checks origin fetch/push URLs, baseline and clean working tree, saves a tracked-source backup, checks/applies the patch and runs npm ci, build, auth tests and credit tests. It does not commit or push. No need to extract ZIP into Downloads.

Local folder: C:\Users\Sufi\Documents\RADAS_AI_VIDEO_PHASE_01\radas-ai-video

## Install SQL once

1. Open Supabase Dashboard and select project **fyqvvkpzcwrmyozxlqkw**. Check the project reference before running SQL.
2. In SQL Editor, paste `supabase/migrations/202610020001_credit_engine.sql` (the apply script copies it to clipboard after passing checks). Click Run once.
3. Run `supabase/verify-credit-engine.sql`. Every `passed` value must be true. This is read-only; it does not award test credits or modify old accounts.
4. Keep `radas_v4` private; do not add it to Data API exposed schemas. Public RPC wrappers provide the required access.

The migration creates only schema radas_v4 and two uniquely prefixed public functions. Existing Auth users, old wallets, tables and triggers remain untouched. Wallets initialize lazily at 0 on the first authenticated read. Old project credit balances are **not imported**. There is no free credit or legacy balance assumption.

All DDL is inside one transaction. A name conflict aborts the install; do not drop or overwrite existing objects. If a previous failed manual session remains aborted, run ROLLBACK before investigating. A successful install must not be rerun.

## Environment

Existing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are sufficient for wallet reads. No new key is required for PHASE 03 UI.

SUPABASE_SECRET_KEY is reserved for trusted server-only debit/refund/topup callers in later phases. Use a Supabase secret key or legacy service_role key when those callers are wired. Never use the publishable/anon key for mutations; never prefix a secret with NEXT_PUBLIC_; never commit .env.local. Payment/generation endpoints are not created in this phase.

## Commit and publish after SQL installation

Run from the project folder after SQL verification succeeds:

```powershell
git add package.json package-lock.json scripts/check-auth.cjs scripts/check-credits.cjs src/app/globals.css src/app/page.tsx src/app/api/credits src/components/video-workspace.tsx src/lib/credits supabase PHASE-03-SETUP.md PHASE-03-STATUS.md
git diff --cached --stat
git commit -m "feat(credits): add isolated wallet and transaction ledger"
if ($LASTEXITCODE -ne 0) { throw 'COMMIT failed' }
git push origin HEAD:main
if ($LASTEXITCODE -ne 0) { throw 'PUSH failed' }
```

## Live acceptance

Log in with an existing email at app.radas.my after deployment. Header should show 0 for a new RADAS V4 wallet. Credits opens real ledger and Semak baki refreshes it. Refresh/logout/login retains wallet balance, while video session behavior stays unchanged. If SQL/config is missing or unreachable, UI shows — / Baki belum tersedia; it never substitutes zero for a failed read.

QRPay, provider generation, automatic failure refunds and payment confirmation are later phases. Generate remains disabled, and Top Up takes no payment. Do not manually award production test credits.

## Future callers

- debitCredit(verifiedUserId, stableGenerationId): reserves exactly 1 credit atomically. Only `applied` permits starting a new provider request. `already_applied` means load the existing job. `refunded=true` means that debit was already reversed; never restart it.
- refundCredit(ownerUserId, sameGenerationId): refunds exactly 1, only if a debit exists, at most once. Generation failure eligibility must be checked by the future job handler.
- creditConfirmedTopUp(paymentOwnerUserId, confirmedPaymentReference): adds exactly 60 only after the future payment handler verifies RM5 payment. Reference is globally unique for topups.
- Transport timeout/error has unknown outcome: retry the same operation with the same reference. Never invent a new reference after a timeout.
- checkCreditBalance is an advisory read. Only successful atomic debit authorizes generation; browser balance cannot authorize it.

Database row lock serializes each wallet; nonnegative constraints and unique references enforce accounting. RPC writes ledger and balance in one transaction. No direct DML grants, anonymous mutation or customer credit-setting route.

## Verification scope

npm run check:credits runs actual PostgreSQL SQL/functions in isolated PGlite with mocked auth roles/users. It covers zero wallets, private table denial, cross-user separation, fixed amounts, duplicates, orphan refund rejection, reused payment references, transaction rollback, ledger reconciliation and burst exhaustion. PGlite uses one queued connection; it does **not** prove multi-connection production lock behavior. The SQL uses SELECT FOR UPDATE for that protection.

npm run check:auth runs production Next.js against simulated Supabase Auth/RPC: login/callback/session/logout, anonymous/revoked API denial, unsupported mutation method, ignored user ID query, private no-store headers and safe database outage.

Live Supabase SQL execution, deployment, browser layout and live payment/generation flows are not covered by these local tests. Live PHASE 03 acceptance remains pending your verification.
