# Affiliate sold — local review

Adds an admin-only **Update Sold** tab under Manage Products. Search/category/status filters and nine-row pagination use the existing catalogue. Each row edits only Sold and Date checked. Customers see the entered snapshot and its separate date on the existing product card.

- Manual platform-listing totals, not RADAS sales or affiliate-account orders. Examples: `250`, `1,200`, `1.2K`, `10K+`. Keep the platform's approximation; do not invent exact totals.
- Blank data stays hidden. Explicit `0` is allowed. Clearing removes both fields. Date checked is required for a nonblank count and cannot be in the future (Malaysia date).
- No automatic collection, sorting by sold, daily history, bulk import, or duplicated products in this patch.
- Existing price/commission/date fields, publication rules, customer access and private notes are preserved. No generation, finalization, pricing, wallet or payment changes.

## Persistence and safety

Optional `soldText` / `soldCheckedOn` live in the existing product JSON document. A migration is necessary because the installed validator rejects extra fields and sold-only writes need server-side authorization and concurrency checks.

The migration copies the actual installed validator and catalogue operation into restricted `*_before_sold` functions, then wraps the canonical functions. It preserves their existing publication/order/access/revision/audit behavior rather than replacing them with an old migration copy. Review these live definitions before installation. The migration is transactional and refuses an accidental second install; it does not backfill or edit product rows.

The new service-role RPC checks the verified actor's admin membership, uses the existing catalogue advisory lock, requires an existing ID and matching revision, and merges only the sold pair. Identical retries immediately after a lost response do not add another revision/audit. Other stale changes fail with a conflict. Existing audit and document updates remain one transaction. Older product forms that omit both sold fields retain the current snapshot.

The API retains session verification, same-origin checks and field allowlists. Browser roles cannot execute the new RPC or the copied functions. Unsaved row edits lock navigation; failed responses retain the draft for retry or explicit cancel/refresh.

## Validation completed

- PGlite actual SQL and API tests: permissions, input/date parity, legacy products, preservation, stale edits, replay, clear, authentication/origin, unchanged wallets/ledger.
- React handler/render tests: badge blank versus zero, formats, date, row editing/retry/cancel, admin-only view, paging and navigation guards.
- Disposable PostgreSQL 18.6: 24 identical writes through 12 independent sessions produce one revision/audit; competing edits serialize; forced audit failure rolls back document/revision.
- Existing affiliate and navigation regressions, English UI checks, TypeScript and Next production build pass.
- Actual `next start` with a local mock Supabase gateway: authenticated SSR and API save/readback/clear pass. External HTTPS is denied in that preview process.

Windows installer execution and visual desktop/mobile review are still pending the owner. The mock preview contains sample products, not a copy of customer data. No production SQL, variables, deployment, commit or push was performed for this feature.

## Review and rollout order

1. Apply the supplied patch in an isolated Windows worktree using Install-Local.ps1. No `.env.local` is copied. Run the mock preview and inspect Update Sold plus the product-card badge.
2. Review `sql/Inspect-Before-Install.sql` output against the migration. Separately approve and run the migration in Supabase SQL Editor; then run verification SQL. This is not needed for the mock preview.
3. After owner review/approval, commit and push only the feature files from an up-to-date production baseline. Confirm Railway success. Do not enable or alter unrelated variables.
4. Production acceptance: update one selected product, verify its card and refresh persistence, edit unrelated product fields, clear/restore the snapshot. Confirm non-admin access and unchanged price/commission.

Rollback application to the previous known-good commit if required. Keep the additive database wrappers during application rollback: they preserve sold values when old forms save. Do not drop backups or restore the strict old validator while sold keys exist. Any database rollback needs a separate reviewed plan that preserves snapshots and audits. Never remove sold data merely to satisfy the old validator.
