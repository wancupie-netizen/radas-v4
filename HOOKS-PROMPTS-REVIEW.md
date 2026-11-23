# Hook & Prompt — local review

Production source baseline: 3ed4cd00a181a26eb389851a201c8cb71a0d5855. No production writes are part of this local package.

## Experience

- New desktop/mobile workspace tab at `/studio?tab=hooks-prompts`. Refresh, Back/Forward and catalogue URL state remain supported. Login still opens Dashboard.
- Hooks and Prompts collections with search over title/category/text, optional category filter, nine entries per page, empty/error states and long-text expansion.
- Copy preserves full multiline text. Success is announced only after clipboard confirmation. If browser permission/API is unavailable, a read-only selectable textarea is offered. Copy/read performs no financial writes.
- Existing verified signed-in users can read Published entries. Admin controls link to `/admin/hooks-prompts`; customers cannot create/edit/delete or read drafts.
- Admin form supports type, title, optional free-text category, multiline content, display order and Published/Draft. Draft requires a title and nonempty text. Content is saved manually through the website.
- New library starts empty. Preview samples exist only in memory and are never production seeds.

## Storage and authorization

One additive migration creates private `radas_v4.hook_prompts` and `radas_v4.hook_prompt_audit`, a private validator/operation and service-only public invoker RPC. RLS is enabled; direct browser and direct service-role table writes are revoked. Confirmed-user and existing payment_admins membership are checked within the operation; user_metadata never grants administration.

Eight validated entry fields: id, kind, title, category, text, sortOrder, published, revision. Limits: 500 entries, title 120 Unicode characters, category 60, text 12,000, display order 0–9999, bounded revision. API write body limit 64 KiB. Content is rendered as plain text, never HTML. No external links or embeds are executed by this library.

Each mutation is serialized and revision-checked. Same-ID response replay does not duplicate saves or audit rows. Delete tombstones block stale creates from resurrecting deleted entries. Audit and content mutation commit/roll back together. Financial, video, affiliate and existing gallery functions are not replaced.

## Validation

- Isolated actual PostgreSQL-compatible PGlite migration/RPC and actual authenticated TypeScript API: validation parity (including Unicode and trim), service/admin/confirmed-user gates, RLS/grants, Published filtering, ordering, lost-response replay, stale edits, delete replay/tombstones and audit failure rollback. Existing function definitions remain unchanged; zero wallet/ledger writes.
- Actual React component handlers/effects: kind/search/category/page/URL restoration, full-text copy, clipboard denial fallback, admin-only controls, retained-ID lost-save retry, edit/hide/delete, auth failures and listener/timer cleanup.
- Actual `next start` + Supabase SDK with loopback mock gateway: SSR title/tab/admin page, session cookies, Draft/Published visibility, mutations/replay, 401/403. External backend HTTPS denied.
- Existing Dashboard, affiliate sold, auth and English-boundary checks; TypeScript and production build.
- A real browser/clipboard and responsive visual review remains for the owner's Windows preview. No live migration or paid generation has been run. PGlite is one queued connection, not a multi-session hosted database test.

## Local review and production sequence

Apply-Local.ps1 verifies the approved baseline and patch checksums in the existing isolated Windows Dashboard worktree, creates a review branch and reuses its installed dependencies. No .env.local is copied, no SQL is executed, and no push/deploy is performed. Preserve any generated next-env.d.ts outside the feature commit.

After checks, run `node scripts/preview-hooks-prompts.cjs` and open PREVIEW_URL (admin) and CUSTOMER_PREVIEW_URL (customer). Samples and edits disappear when stopped. Other app panels intentionally remain unavailable in this focused preview.

After owner review: inspect the live SQL preflight names/admin prerequisite; obtain approval before installing the migration. Run it once and verify grants/RLS; if names already exist, stop and inspect instead of replacing. Then review/approve a feature commit/push and confirm the intended Railway deployment. Test adding/editing/drafting/publishing/copying/deleting using owner-chosen content and a normal user account. No price, ledger or provider-origin changes belong in this release.

Rollback: revert the feature app commit through reviewed deployment. Retain new library/audit data; the older app does not access it. Do not drop tables as an automatic rollback. Existing allowlist variables remain untouched.
