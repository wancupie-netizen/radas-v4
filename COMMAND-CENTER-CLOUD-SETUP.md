# Command Center cloud storage

Target only: `https://fyqvvkpzcwrmyozxlqkw.supabase.co`.

The owner page and new `/api/command-center` endpoint verify the confirmed Auth
email `wancupie@gmail.com`. The private table is inaccessible to anon and
authenticated Data API clients; the endpoint uses the existing server-only
`SUPABASE_SECRET_KEY`. No new environment variables are required. `APP_URL`
must match the HTTPS origin used to open Command Center (`https://video.radas.my`).

## Install before deploying the code

1. Open the SQL editor for project `fyqvvkpzcwrmyozxlqkw`:
   https://supabase.com/dashboard/project/fyqvvkpzcwrmyozxlqkw/sql/new
2. Run **only** `supabase/migrations/20261021115532_command_center_cloud_state.sql`.
   It creates one new table; it does not edit credits, payments, or video data.
   Do not push the entire migration history to an unverified linked project.
3. Run `supabase/verify-command-center.sql` in the same editor. Expect RLS true,
   anon/authenticated privileges false, and service read/insert/update true.
4. Deploy the code through the existing main-branch Railway workflow.

The connected Supabase account used during development did not list this project.
The migration and security tests were verified in isolated PostgreSQL, not the
live RADAS database. Live installation and verification remain required.

## Preserve current browser data

Close other Command Center tabs, then open the new version in the browser/profile
containing the data you want to keep. If the cloud table has no record, that browser
state (including seeded content, tasks, product edits and saved video links) is
uploaded automatically. If a cloud record already exists it takes priority; data
from another browser is never silently merged over it.

The original localStorage key is retained. The exact pre-cloud value is also kept
once in `radasCommandCenterV2:before-cloud`. Unsaved cloud mutations are cached
separately for retry/reload recovery. Local backups remain vulnerable to a browser
reset; only the status **Berjaya disimpan dalam akaun** confirms cloud persistence.

Check add/edit/delete, refresh, and a second browser after the first successful save.
Download a JSON backup using **Muat turun backup**. The JSON contains the entire
current state; it can be used for manual recovery (there is no automatic import UI).

Failed account reads lock editing and preserve browser data. Failed writes show an
unsaved status and allow retry with an idempotency ID. Version conflicts lock the
stale view so it cannot overwrite newer cloud data; export a backup before reloading.
Concurrent edits require manual reconciliation from that backup.

## Checks

```powershell
npm ci
npm run typecheck
node scripts/check-command-center.cjs
node scripts/check-command-center-videos.cjs
node scripts/check-command-center-cloud.cjs
npm run build
```

Cloud checks execute the actual API handlers and browser sync code against an
isolated PGlite PostgreSQL table: RLS/grants, owner authorization, CSRF, payload
limits, project guard, first import, second-browser load, offline retry, lost
responses, stale-tab conflicts, reload recovery and legacy backups. They do not
write to live accounts or databases.
