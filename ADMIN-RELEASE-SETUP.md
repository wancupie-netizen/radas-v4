# Admin release of unresolved RADAS V4 generation

Scope: SQL Editor support action only. No user UI, payment UI, client code, API permissions, provider calls or automatic refund changes.

Installation adds nullable release audit fields to radas_v4.generations, a consistency constraint, a postgres-only SECURITY INVOKER support function, and excludes explicitly released rows from the two active-job lookups and one-active index. Every existing row remains unreleased by default. The generation function definition must match the expected two lookups exactly or the entire installation rolls back. A second installation aborts without rewriting data.

1. Apply the ZIP through APPLY.ps1 in the correct radas-v4 folder. It adds only this document, scripts/check-admin-release.cjs and three SQL files. It runs isolated SQL tests and copies installation SQL to clipboard. No live database mutation is performed by PowerShell.
2. Open Supabase project fyqvvkpzcwrmyozxlqkw, SQL Editor, role postgres. Paste and Run supabase/admin-release-install.sql once. The editor may warn about destructive operations because the active index is replaced; the transaction does not delete records or alter balances.
3. Run supabase/verify-admin-release.sql. Every check must be true before releasing anything.
4. Run supabase/admin-release-request.sql. This targets ONLY e9c61b97-dd9e-403d-a837-391990830c64 and resolves the approved admin from verified wancupie@gmail.com. Expect result released, status unknown, refunded false. Repeat invocation returns already_released and preserves the original audit fields.
5. Confirm original wallet balance is still 59 if no other account activity occurred. Run npm run dev, log in with the original account, and make one NEW request. Normal charge is one RADAS credit plus 0.15 NexaBot credit. A fresh successful request would leave RADAS 58 if it began at 59. Verify preview and download.

Release is an operator acceptance of uncertainty, not a provider failure/completion determination. The old request remains unresolved, retains its debit and claim, and cannot be resubmitted by ordinary flow. Its provider job may still exist. Do not reuse the independent direct API job 4e588a0dab23b95b for this record. Provider investigation and any eventual refund/recovery remain separate support work. Do not falsify status or manually alter the ledger.

The release function is unavailable to anon, authenticated and service_role and has no public RPC wrapper. It requires SQL Editor postgres privileges AND an existing approved administrator UUID. A UUID supplied to this operator-only function is an audit attribution; it does not authenticate a browser. The database operator is trusted.

Validation: ADMIN_RELEASE_LOCAL=PASS using all existing migrations and isolated PGlite SQL. Tests cover denied API roles/non-admin attribution, reason validation, exact unresolved state, unchanged ledger/wallet, idempotent audit, original-ID no reclaim/no refund, fresh debit, active-job guard, normal completion, consistency constraint, schema verification and rerun rollback. PGlite uses a queued connection; true PostgreSQL multi-session testing and operator live release remain separate.

Repo: wancupie-netizen/radas-v4. Local localhost:3000/studio. app.radas.my is unrelated. No commit, push or deployment is performed.
