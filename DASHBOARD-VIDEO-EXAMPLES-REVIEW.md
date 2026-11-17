# RADAS Dashboard and manual YouTube examples

Review baseline: production `9adc8c20b7036078bbd15c7eff4b186724d151c9`. Local work is isolated. No production SQL, Railway settings, push or deploy has been performed for this feature.

## Result

- Dashboard appears before Create Video in desktop and mobile workspace navigation. Its bookmark is `/studio?tab=dashboard`; refresh/back/forward retain the tab. `/studio` remains the generation page, including the existing login destination.
- Gallery has three columns on larger desktops, two at intermediate widths, and one on phones. Every video frame uses `aspect-ratio: 9/16`; captions sit below the frame. No video is stretched or cropped by the iframe itself. YouTube controls its displayed video content, so owners should upload actual portrait videos.
- Each card uses a lazy YouTube thumbnail until Play is clicked. Only one iframe is mounted at a time; Close video or leaving Dashboard removes it. Player origin is fixed to `www.youtube-nocookie.com`, with a title, fullscreen support and origin referrer. Watch on YouTube is available if embedding cannot play. Thumbnail failures retain the title and Play control.
- Create Video is an actual link to `/studio`, with no provider POST, paid generation or prompt prefill. Empty/error states still offer this link.
- Admins see Manage Video Examples on Dashboard, opening `/admin/video-examples`. Add/edit/delete, display order and Draft/Published are managed in the browser. No PowerShell is needed for routine video entry after deployment.
- Production starts with no examples. No mock results are seeded. An owner must provide their own videos, enable embedding on YouTube, and publish each entry after checking it.

## Design and data flow

The new API `/api/video-examples` verifies the session and passes the actor to a service-only RPC. Admin membership comes from the existing `radas_v4.payment_admins`, never editable user metadata. Dashboard returns only Published examples, even for admins. Admin list returns drafts too.

YouTube watch/Shorts/youtu.be links are normalized to an eleven-character video ID. Arbitrary iframe markup, user credentials, HTTP and other origins are rejected. Only the ID is stored; embed URLs are built from fixed origins. Public/Unlisted availability, actual 9:16 orientation and embed permission need owner playback verification; a syntactically valid link does not establish those properties.

The additive migration creates `radas_v4.video_examples`, `radas_v4.video_example_audit`, a private validator/operation and a public security-invoker RPC wrapper. Existing catalogue, generation, finalization, wallet, pricing and payment functions/data are untouched. Both new tables have RLS and no browser or direct service-role table grants. Only the guarded RPC has service-role EXECUTE.

Writes use a separate advisory lock and revision check, with atomic audit entries. Identical lost-response retries return the saved result without another revision/audit. Other stale edits fail. Deleted IDs have audit tombstones, preventing an old create retry from resurrecting them. There is a hard bound of 100 examples and deterministic order: lower display order, then newer creation time, then ID. Save errors retain the original command/ID and lock the editor until explicit retry or discard/refresh. No automatic POST retry occurs.

## Completed validation

- Actual PGlite migration and API: strict shapes/links, service/admin/confirmed-user gates, RLS and grants, Draft filtering, ordering, stale changes, replay, deletion, audit-write rollback, body/origin/query guards, zero wallet/ledger writes and unchanged existing function definitions.
- Actual React effects/handlers: one click-only player, fallback, target URL, empty/error states, admin form normalization, order/publication, retained command on failure, retry/edit/delete, session expiry, cleanup and mobile/desktop tab history.
- Disposable PostgreSQL 18.6, 12 independent sessions: 24 identical creates produce one row/revision/audit; competing edits reject stale versions; audit failure rolls back; repeated deletes are idempotent; 12 competing IDs cannot exceed the 100-example limit.
- Existing authentication integration suite, English UI checks, affiliate sold SQL/UI, affiliate navigation and finalization UI regressions pass. TypeScript and Next production build pass.
- Actual `next start` with mock authentication and SDK gateway: Dashboard SSR/title, admin page, anonymous redirects, non-admin denial, SDK save/replay, visibility/order/delete and 401/403 pass. Backend external HTTPS is blocked in the preview process.
- Modified existing-file preimages match GitHub production baseline. Patch application is verified with LF and CRLF text.

Visual browser review on the owner's Windows computer and playback with the owner's real YouTube links remain pending. Local automated checks do not prove YouTube availability or permissions.

## Review, release and rollback

1. Run the supplied Install-Local.ps1; it creates or resumes one isolated Windows worktree, preserves diagnostics and uses no `.env.local`. Free at least 5 GB on the worktree drive before dependencies/build. If interrupted, rerun that same installer; it remembers the worktree and checks its baseline/files instead of creating duplicates.
2. Run `node scripts/preview-dashboard.cjs` in the printed worktree. Open PREVIEW_URL for admin, CUSTOMER_PREVIEW_URL for a regular user. Add your own YouTube link and check preview/play/close, order, draft/publish/hide, edit/delete and mobile layout. All preview data is temporary. The six preview cards use YouTube's official player demonstration ID and are not RADAS examples. Backend data stays mocked; browser thumbnails/players load from YouTube.
3. After visual review, inspect the supplied SQL and approve live installation separately. Run the migration once in Supabase SQL Editor, then Verify-After-Install.sql. No old function replacement is required.
4. After owner approval, fetch current main and commit/push only this feature's explicit files. Stop and review/rebase if main moved. Confirm Railway SUCCESS on the exact new commit before testing live.
5. Live acceptance: admin creates an owned video as Draft, confirms it is hidden from a regular account, publishes, refreshes both views, plays/ closes it, follows Create Video, changes order, edits, hides and deletes a test entry. Confirm existing affiliate sold data and video generation remain normal. Do not generate a paid video merely to test navigation.

Application rollback target is `9adc8c2` if it remains the previous release. Keep new tables/audit/RPC during an application rollback to preserve entered examples. A database teardown is unnecessary and needs a separate reviewed backup/removal plan. No credits or refunds are involved.

References checked during implementation: installed Next 16.4.5 App Router pages/client components/route handlers; Supabase database function privileges and current changelog (CLI pinned to v2.81.3); Google YouTube player parameters and iframe reference. No new app dependencies.
