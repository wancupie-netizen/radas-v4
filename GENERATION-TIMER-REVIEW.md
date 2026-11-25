# RADAS generation timer and active-request recovery

Baseline: `6e4760bac9824dfca27a12f353a04db0b7bd283b`. Local review only.

## Customer behavior

- A validated Generate click immediately shows a provisional `Time on this page: mm:ss` while the request is being accepted. Retrying a lost response keeps the original request ID and provisional start.
- Once the owned database record is available, `Elapsed time: mm:ss` measures from its immutable `created_at`. It includes queueing, provider generation and RADAS finalization. The initial upload/pre-reservation period is represented by the provisional label, not added to the authoritative duration.
- The timer advances locally once a second. It uses the server time plus a monotonic browser clock, and refreshes its server anchor when the page becomes visible or reconnects. It does not make a request every second. Network transit can introduce a small display delay; this is not an ETA or a progress percentage.
- Timer duration freezes when RADAS confirms ready Storage metadata, or the request fails, is released, needs support or expires. Server-ready duration excludes the browser's subsequent preview download/media decoding. The existing `Video ready` playback gate remains unchanged.
- Refreshing or returning to Create Video reads the user's current request and restores the prompt, mode, orientation, resolution and canonical start. Original uploaded image files are not reconstructed or resubmitted. No prompt or request data is added to local/session storage.
- A pending active request takes priority over incomplete done requests. If no active request exists, a nonexpired done request still finalizing or awaiting support can be restored. Ready videos remain in existing history; selecting one shows its frozen duration.
- The Generate form waits for the current-request check. A failed check shows an explicit retry control; it does not guess that the account is free. Timing-only failures on an already displayed request preserve its last clock; a provisional/observed terminal fallback is explicitly labeled.

## Implementation and database

Five existing files change: package.json, the existing finalization UI fixture, generation-result.css, generation-result.tsx and video-studio.tsx. The new timer, timing parser, owner-authenticated GET route, SQL migration and offline checks are additive. Existing generation routes, status contracts, provider transport, worker, credit functions and active-slot rules are not replaced.

`GET /api/generations/timing` reads the current user's active/incomplete request. `?id=<uuid>` reads that user's nonexpired request timing. The server supplies the owner ID from verified authentication; arbitrary query keys, duplicate IDs and malformed IDs are rejected. Responses are private/no-store and rebuilt from validated fields. Provider IDs, claims, tokens and worker internals are omitted. Expired and foreign records are not returned.

Migration `20261125024500_generation_timing.sql` creates only `radas_v4.generation_timing(uuid,uuid)` and its public wrapper. Both are service-role-only; the private function checks the JWT role and uses an empty search path. Its STABLE SELECTs read existing generation, finalization and stored-object timestamps. No tables, indexes, rows, ledger entries, grants on existing tables or existing business functions are changed. Re-running an already installed migration aborts rather than overwriting an existing function; the transaction rolls back. Review existing names first.

The new read can expose an already existing request after refresh. The existing status endpoint resumes its usual reconciliation/polling, including existing abandoned-reservation and release rules. This patch introduces no new claim, provider POST, debit, refund or automatic resubmission path. It does not reopen terminal/refunded incidents.

## Local review

Run Apply-Local.ps1 from the extracted review package. It reuses the existing isolated Windows worktree/dependencies, verifies the exact production baseline and patch/checksums, preserves unrelated diagnostic worktrees, and stops on conflicting changes. No npm ci, file cleanup, .env.local copying, live SQL, Railway edits, commit or push is performed.

Then run `node scripts/preview-generation-timer.cjs` in that worktree. Open PREVIEW_URL first. The sample existing request starts about 84 seconds earlier so the timer is immediately visible. Refresh the page to check continuity. Open the phase URLs in a separate tab and return to the original preview; its next status check will show Finalizing, Ready or support. The ready fixture can play/download and is available in history after refresh. Ctrl+C stops. All users, cookies, timestamps and MP4 content in this preview are fixtures.

## Verification and limits

Passed: actual isolated SQL and authenticated timing route; browser RPC denial, forged-role guard, cross-owner isolation, strict query validation, malformed output rejection and no-store responses; ready marker without metadata remains finalizing; fixed stop timestamps; expired records hidden; migration replay and existing function/ledger snapshots preserved. SQL uses a queued PGlite connection, not new multi-session PostgreSQL verification.

Passed: real React component effects/handlers for monotonic clock behavior, refresh continuity, background resume, terminal freeze, fallback labels, authentication expiry, interval/listener cleanup, Studio restore settings, restore-error lock/retry, initial new-request clock and same-ID lost-response recovery without another POST. No browser screenshots or Windows browser rendering were verified here.

Passed: production Next build/runtime with fixture cookies and actual SDK timing RPC, active/finalizing/ready snapshots, owner isolation, 401/400/405; server external HTTPS denied. Existing finalization, Storage recovery, credit safety and English UI boundary checks passed. All five modified-file preimages match the real GitHub baseline. No live paid generation or production SQL/config was executed.

## Deployment and rollback for owner review

1. Complete Windows local checks and preview review first.
2. Run Preflight.sql in the existing Supabase project; verify required objects and both new names are available. With owner approval, run the migration, then Verify.sql. Install this read RPC **before** deploying the new UI: if it is absent, the initial request check deliberately blocks Generate with a retry message.
3. After separate owner approval, commit/push only the 13 reviewed files, excluding generated next-env.d.ts. Verify the intended Railway commit reaches SUCCESS. Keep `NEXABOT_DOWNLOAD_POLICY=provider-redirect` and all existing Railway settings.
4. With owner approval for a paid test, generate once, record the balance, refresh/close the page before completion, return to Create Video, verify the same request/timer continues through finalizing, then play/download and confirm one debit. Test another account's ID remains unavailable. Do not generate again to recover an uncertain request.
5. Roll back by redeploying the prior `6e4760b` application build. The additive read RPC can remain unused; no data rollback is needed. Only after older code is live, separately approve dropping the two new functions if desired. Never roll back the working provider-download setting or refund records as part of this UI change.
