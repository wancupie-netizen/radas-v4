# PHASE 08 — Temporary Video Storage

Repo: https://github.com/wancupie-netizen/radas-v4
Baseline: 0b3f71d61dbd24bb6f1dd2a51806838e945c42f6 (accepted Phase 07).
Local: http://localhost:3000/. Future V4 domain: video.radas.my.
app.radas.my is unrelated. Supabase project: fyqvvkpzcwrmyozxlqkw.

## Behavior

- When the UI receives `done`, its existing automatic preview request copies the provider MP4 to private Supabase Storage before serving the result. A result never viewed is not copied by a background worker.
- Dedicated bucket `radas-v4-videos`, private, MP4 only, maximum 50 MiB per video. The project's global Storage limit may impose a lower limit; do not change unrelated project limits automatically.
- Fixed key `<verified-user-uuid>/<generation-uuid>.mp4`, insert only (`upsert: false`). Browser never receives Storage paths, provider IDs, keys or signed URLs.
- Each preview/download validates the current authenticated user, ownership, successful generation state, and the existing generation expiry. No new lifetime is added when saving or retrying.
- Cached output can be served during provider outages. A marked file that has disappeared fails closed instead of being recreated.
- Storage/upload/metadata failures do not change generation billing, refund successful jobs or resubmit paid provider requests. Retry preview for the same ID.
- Upload committed but metadata response lost: recover the immutable file and mark it on a later request. Competing requests may repeat free provider downloads but cannot overwrite output or duplicate the metadata row.
- Expiry may occur while saving: metadata mark/access fails, potentially leaving an orphan file. PHASE 10 must delete expired objects, including orphans, through the Storage API.
- PHASE 08 enforces the 12-hour server access deadline. It does not physically delete files automatically; scheduled deletion is PHASE 10 and required before launch. Already downloaded copies are the user's files.
- Refresh/logout clears UI output as before. No history endpoint or permanent library is added.

## Apply

1. Stop `npm run dev`. Keep the downloaded ZIP in Downloads; run the supplied PowerShell loader.
2. Installer verifies the exact repo and Phase 07 baseline, backs up source, applies the patch and runs isolated local checks. It does not edit `.env.local`, run SQL, upload a real video, grant credits, commit or push.
3. The migration is copied to the clipboard: `supabase/migrations/20261002150147_temporary_video_storage.sql`.
4. In Supabase project **fyqvvkpzcwrmyozxlqkw**, SQL Editor, paste and Run once. It creates only V4 metadata, RPCs and a bucket-specific restrictive policy. No record deletion, no existing bucket modification. Do not rerun after success.
5. In the VS Code project terminal run:

```powershell
npm run setup:storage
```

This uses the existing server secret from `.env.local`, creates **only** `radas-v4-videos` using the Storage API, or validates an already matching bucket. It refuses an existing mismatched configuration without changing it. It never prints the key. Expected: `STORAGE_BUCKET=PASS`.

6. Run `supabase/verify-video-storage.sql` in the same project's SQL Editor. All **13** checks must be true. Run it after the bucket setup.
7. Restart `npm run dev`, verify login, zero-credit disabled Generate and normal settings at localhost. Send results for acceptance.

Missing key/config: use the previously configured `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SECRET_KEY`. Do not send real keys in chat. No new env variables are required.

## Tests and limits

- `npm run build`
- `npm run check:storage`: actual isolated SQL and TypeScript route/storage code, restrictive RLS tested against an existing permissive fixture policy; auth/ownership/expiry, immutable retry/concurrency, upload and metadata outages, invalid MP4 container header, MIME/length/size and cancellation, ledger unchanged.
- `npm run check:generation`: Phase 03/06/07/08 SQL and existing full generation flow regressions.
- `npm run check:safety`, `check:credits`, `check:auth`, `check:nexabot`, `check:generator`.
- Browser validation uses actual Next.js, actual Supabase SDK with a local mock HTTP gateway, isolated PostgreSQL fixtures and an actual sample MP4. This is not proof of live Supabase Storage or a live NexaBot video.
- Container header checks are not a full media decoding guarantee. Browser decoding is separately exercised with the sample fixture.
- PGlite checks use one queued connection; real multi-session PostgreSQL safety verification remains a pre-launch check.
- Real paid generation, actual ten-second provider output and live object upload/download remain pending funded acceptance. No free credits are granted.
- Bucket costs and physical retention must be reviewed once PHASE 10 cleanup is installed. No public launch from this phase alone.

## Acceptance / commit

After SQL, bucket setup, local acceptance and explicit instruction, stage only PHASE 08 files and commit to main in `wancupie-netizen/radas-v4`. No automatic commit/push in this patch.
