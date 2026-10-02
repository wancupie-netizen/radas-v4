# PHASE 09 — Recent History

Repo: https://github.com/wancupie-netizen/radas-v4
Baseline: 088515038a063fb9fa35d410b6919afde73d688e (accepted Phase 08).
Local: http://localhost:3000/. Future V4 domain: video.radas.my.
app.radas.my is unrelated.

## Behavior

- Recent History appears below Video settings / Preview.
- The last 20 successfully completed videos in the current page session are shown newest first, with original prompt, mode, orientation, resolution, completion time and the server's original expiry.
- Only `done`, non-refunded, unexpired results enter the list. Active, unknown, failed and rejected jobs do not.
- Request retries and repeat polling do not duplicate entries or change the original settings/time.
- Each row's Preview & download button opens the existing preview. Use Download Video in that preview to download the MP4. The row does not generate a new video or use another credit.
- Tutup preview history returns to the current result. Viewing an older result does not stop current job polling or bypass the active-generation form lock.
- History contains metadata only. Only the selected/current preview loads a video Blob. Switching or closing the preview revokes its object URL and cancels its request.
- Expired entries are removed and an expired preview loses its video/download link. Timer checks and visibility checks cover returning from a background tab; the server still independently enforces ownership and expiry.
- Refresh, logout/login or leaving the page clears the list. No localStorage, sessionStorage, IndexedDB, cookies, database history query or history API is added.
- An unviewed video may have no stored output yet: selecting it uses the existing Phase 08 private adapter to copy it on first preview. No provider paid POST retry is involved.
- History disappearing does not delete backend accounting or Storage files. Physical cleanup remains PHASE 10, required before launch. Already downloaded files are the user's copies.

## Apply

1. Stop `npm run dev`. Keep the ZIP in Downloads and run the supplied PowerShell loader.
2. Installer verifies `wancupie-netizen/radas-v4`, main, exact accepted Phase 08 baseline, and a clean working tree. Recognized generated `next-env.d.ts` development paths are backed up/restored; unexpected changes stop installation.
3. It backs up tracked source, applies the patch and runs build/history/input/provider/generation/storage/credit/auth checks.
4. Expected final result: `PHASE09_LOCAL=PASS`.
5. No SQL migration, bucket setup, new env variable or package installation is required. Existing `.env.local` is preserved.
6. Run `npm run dev` and verify at http://localhost:3000/:
   - Login works; credit 0 keeps Generate disabled.
   - Recent History shows 0 video and "Belum ada video siap dalam sesi ini."
   - Desktop/mobile layout remains usable.
7. Send local result for acceptance. No automatic commit/push.

## Verification

- `npm run check:history`: completed-only list, exact expiry boundary, newest first, stable duplicate behavior, immutable settings snapshot, 20-entry limit and pruning.
- Production build and existing isolated authentication checks.
- Actual browser against Next.js + actual Supabase SDK + a mock HTTP gateway and isolated SQL:
  - Text and image results append once with original settings.
  - Older preview/download uses existing private output and sends no new paid POST.
  - Viewing old history while a new job runs keeps polling and form lock intact.
  - A short expiry fixture removes the row/player/download and revokes the object URL; backend video read returns 410.
  - Object URLs do not accumulate when switching previews; no browser storage writes for history.
  - Refresh/logout/login clear history; failed/refunded/unknown jobs add nothing; mobile overflow and JS errors checked.
- Provider video, credits and Storage in these tests are fixtures. No live upload, paid request or free credit is performed by the patch/checks.
- Real funded generation and real video duration/output are still pending before launch. Zero-credit local acceptance checks the empty state, not populated live history.
- Existing server auth, owner/expiry checks and credit rules are unchanged. Multi-session PostgreSQL verification and PHASE 10 cleanup remain pre-launch work.
