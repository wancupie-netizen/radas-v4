# PHASE 10 — Auto Cleanup

Repo: https://github.com/wancupie-netizen/radas-v4
Baseline: 532fdd29910a20f8df9e75229265e979d7703b5a (accepted Phase 09).
Local: http://localhost:3000/. Future V4 domain: video.radas.my.
Supabase project: fyqvvkpzcwrmyozxlqkw. app.radas.my remains unrelated.

## Scope and timing

- Private V4 files are deleted through Supabase Storage API `.remove()` after their original generation expiry (12 hours from creation).
- Access is denied exactly at expiry by existing routes. Physical deletion occurs on the next successful cleanup cycle, normally within about 5 minutes plus execution time. Downtime, failures or backlog can extend physical retention; this is not a hard 12-hour physical deletion guarantee.
- In development, Next instrumentation starts one local timer when `RADAS_CLEANUP_ENABLED=true`: first run after startup, then every 5 minutes after the previous run completes. It runs only while `npm run dev` is alive. Stopping/sleeping the computer stops local cleanup until the next startup.
- Build and production server instances never start a background timer. Production must have an external scheduler before launch. This patch does not deploy or activate a cloud schedule.
- Canonical keys only: `<user-uuid>/<generation-uuid>.mp4`, bucket `radas-v4-videos`. Owned generation keys are eligible only after original expiry. Orphans with no generation are eligible after the Storage object's creation time is 12 hours old.
- Other buckets, unknown/noncanonical filenames, another owner's generation path and unexpired files are preserved.
- Generation rows, wallets and credit ledger are never deleted or refunded by cleanup. Only expired video metadata is pruned, after the Storage object is confirmed absent.
- A 5-minute database lease blocks competing workers. Crashed workers recover after the lease expires. Repeating a cleanup is safe.
- Up to 50 keys per Storage call, 500 files per run, bounded operation time. Backlogs continue on later runs.
- API deletion errors leave metadata for retry. If deletion succeeded but its response/ack was lost, the next claim prunes metadata for expired objects confirmed absent.
- Upload begun before expiry but committed late is caught by a later sweep. No expired generation can gain a new access lifetime.

## Apply

1. Stop `npm run dev`. Keep the ZIP in Downloads; run the supplied PowerShell loader.
2. Installer validates repo, main and exact Phase 09 baseline; backs up tracked files; applies patch; runs local build and isolated checks. It does not edit `.env.local`, run live cleanup, execute SQL, commit or push.
3. Migration SQL is copied to clipboard: `supabase/migrations/20261002175717_auto_cleanup.sql`.
4. Supabase **fyqvvkpzcwrmyozxlqkw**, SQL Editor: paste and Run once. Installation creates V4 state and functions only. SQL Editor may flag DELETE inside function definitions; defining these functions does not execute deletion. No Storage object/credit/ledger data is deleted during installation.
5. Run `supabase/verify-auto-cleanup.sql` in the same SQL Editor; all **12** checks must be true.
6. In the project terminal run the read-only check:

```powershell
npm run cleanup:check
```

Expected: `CLEANUP_CHECK=PASS`, with eligible/busy/last-run counters. Empty current bucket normally has eligible 0. This command does not claim a lease or delete anything.

7. After verification, add this line to existing `.env.local` (keep all current keys):

```dotenv
RADAS_CLEANUP_ENABLED=true
```

8. Run `npm run dev`. Expected console after startup: `RADAS_CLEANUP=OK removed=0 metadataPruned=0` for an empty bucket. It will continue automatically every 5 minutes. Verify login, credits and Recent History normally. Send local output for acceptance.

For an operator-triggered cleanup after activation, use `npm run cleanup:once`. This permanently removes eligible expired V4 output only. Do not use it as a dry run; `cleanup:check` is the dry run.

## Production scheduling (activation at deployment)

- Protected endpoint: GET `/api/internal/cleanup`, with `Authorization: Bearer <CRON_SECRET>` and cleanup enabled. No browser cookie/user login authorizes it.
- Generate a 32+ character random `CRON_SECRET`, store only in server environment and the chosen scheduler. Never send it in chat, put it in NEXT_PUBLIC variables or commit it.
- `?dryRun=1` returns sanitized read-only counts. Other query fields are rejected; callers cannot supply deletion paths.
- Example `deployment/vercel-cron.pro.example.json` is a template only, not active `vercel.json`. Vercel Hobby only permits daily cron; it cannot meet a 5-minute cleanup schedule. Vercel Pro can use the template. Confirm plan before activating.
- Alternatively configure an authenticated 5-minute external scheduler (e.g. Supabase Cron + pg_net with credential kept in Vault) against the deployed HTTPS V4 endpoint. Prepare/verify this at deployment; no project extensions or existing cron jobs are changed by this patch.
- Do not publicly launch until the cloud scheduler has run successfully, live deletion has been verified and backlog/error monitoring is agreed. Local console success is not proof of production scheduling.
- Scheduler errors return 503 and retain retry state. Monitor lastStatus/lastRunAt/eligible from `cleanup:check` or the protected dry run. No user/private path/key details are returned.

## Verification

- `npm run check:cleanup`: real isolated SQL + TS runner/route with mocked Storage API. Eligibility/ownership/bucket/expiry, lease, retries, partial removal confirmation, lost deletion response, multi-batch limit, secret/flag/query protection, ledger preservation and migration guard.
- `npm run check:cleanup:runtime`: actual Next development server + actual SDK through a mock HTTP gateway. Automatic instrumentation deletion, preserving fresh/legacy files, protected HTTP route and read-only CLI. External HTTPS is blocked in the test process.
- Build and authentication regression checks. Existing generation/storage/credit/history/provider/input checks run by installer.
- Tests do not contact live Supabase/NexaBot, upload real files, grant free credits or make paid requests. Isolated fixture SQL deletes its mock storage rows to simulate the Storage API only; production cleanup code never writes storage.objects directly.
- Real multi-session PostgreSQL verification, real funded provider output and live object-deletion acceptance remain pending before public launch.
