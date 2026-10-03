# PHASE 11 — Manual Maybank Top Up

Repository: https://github.com/wancupie-netizen/radas-v4
Baseline: 2fa0f5227a2598f1137f87e31f55a0143423f8d2.
Local: http://localhost:3000/. Future domain: video.radas.my. app.radas.my unrelated.
Supabase: fyqvvkpzcwrmyozxlqkw.

## Locked packages

| Package | MYR | Credits |
| --- | ---: | ---: |
| Try | 5 | 60 |
| Starter | 10 | 120 |
| Creator | 20 | 250 |
| Power | 50 | 620 |

1 credit = 1 generation. No free credits or subscription. Change pricing only after owner review.

## Manual payment scope

Original supplied QR displays Maybank / Tenaga Rezeki Enterprise. It is preserved byte-for-byte in public/maybank-payment-qr.jpeg. Customer must enter the exact package amount; this is not a generated per-order QR or automatic bank connection. Scan verification of the receiver is required before taking payment.

Customer login → Top Up → package → pending order with unique UUID → QR payment → submit bank reference → waiting for manual confirmation.
Admin login → /admin/payments → inspect actual Maybank transaction and match order/user, amount and reference → explicitly confirm funds received → atomic payment approval, ledger and wallet addition.

A receipt/customer reference is a claim only, not evidence of bank receipt. Admin must inspect the bank account. No bank password, PIN, TAC, statement scraping, webhook, bank API or automatic detection is used. No approval based on customer button alone.

Only the existing verified Supabase user wancupie@gmail.com is resolved to a private administrator UUID during SQL install. Runtime authorization uses that UUID, not user-editable metadata or an email string from the browser. If that verified account is missing, installation aborts atomically; log in/register/verify the intended account first. No new account or admin is created automatically.

One pending/submitted order per user. Unpaid pending order can be cancelled; submitted orders need admin review/rejection. Reload restores payment orders (persistent accounting), while existing video history remains session-only. Explicit 'Semak status dan baki' refreshes status and wallet; no promise of instant approval or automatic polling.

Payment list is latest 20 owned orders; admin queue is latest 100 pending/submitted orders. Review promptly. Bank reference is uppercased and stripped of separators to prevent reuse via case/spacing changes. Approvals require exact amount and submitted order. Duplicate approval cannot add credit again; a reference cannot credit multiple users/orders. Rejected payments grant zero; already approved payments cannot be rejected. Actual customer refund/dispute/reversals are outside this phase and require a separate reviewed flow.

All changes are isolated to radas_v4 and named public invoker wrappers. Private tables have RLS and no direct browser/service table access. Existing fixed debit/refund rules remain. The ledger amount check is extended to the four locked top-up amounts; existing rows are preserved. The existing trusted service-only legacy RM5 credit RPC remains internal, without any new browser mutation endpoint. New manual approval uses the atomic payment RPC.

## Install and verify

1. Stop npm run dev. Keep ZIP in Downloads; use supplied PowerShell loader. Exact repo/branch/baseline and clean working tree are required. Tracked files are backed up; known generated next-env dev paths may be restored after backup. No .env.local edits.
2. Installer applies patch and runs build/checks. It copies supabase/migrations/20261003061838_manual_payments.sql to clipboard.
3. Supabase SQL Editor in fyqvvkpzcwrmyozxlqkw: paste and Run once. SQL defines payment operations; it grants no credits and deletes no data. Supabase may flag DROP CONSTRAINT inside the migration: it replaces only the V4 top-up amount constraint, preserving ledger rows.
4. Run supabase/verify-payments.sql: all 12 checks must be true.
5. Scan the QR with your banking app and verify Tenaga Rezeki Enterprise is the intended account. No payment is required for this check.
6. Add RADAS_PAYMENTS_ENABLED=true to existing .env.local, preserving all current keys. Never enable before SQL and receiver verification. Restart npm run dev.
7. Login as wancupie@gmail.com. Top Up displays all four packages. /admin/payments displays the review queue. A normal user cannot access it.
8. Local non-payment checks: create an unpaid Try order, inspect QR/amount, cancel before paying. Balance stays unchanged. Do not approve fictitious orders or fake bank references on the live database. Positive approval is verified in isolated tests; a real paid acceptance can be performed only after an actual transfer is received.
9. Send build/test/SQL checks and local UI acceptance. No automatic commit or push.

## Validation and limits

check:payments runs isolated real SQL plus compiled actual TS service/HTTP routes. Four fixed packages, no credit on pending/submit, ownership/admin checks, exact amount, duplicate approval/reference, rollback, feature gate, CSRF, strict body, no cache, snapshot amounts, SQL verification and rerun protection.

PGlite uses one queued connection; real PostgreSQL multi-session acceptance remains separate. Browser visual verification remains pending: Chromium could not be downloaded in the execution environment. Owner must check desktop/mobile UI at localhost. No paid provider request, real bank transfer, live credit grant or live SQL execution is performed by the installer/tests. No new dependency.

Production manual payment activation and live end-to-end payment acceptance await deployment/configuration. Automatic QRPay integration remains future work once merchant/API confirmation is available. PHASE 12 will broaden payment safety validation; baseline duplicate protection is already present here.
