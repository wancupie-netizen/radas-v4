# PHASE 05 — NexaBot Integration

Scope: server-only provider adapter. Local development remains http://localhost:3000/;
future V4 domain is video.radas.my. app.radas.my is unrelated.
Repository: https://github.com/wancupie-netizen/radas-v4
Baseline: e0372ae39a540e9b5db5d447bfa9f98a2acb2f55 (accepted Phase 04).

## Contract

Uses the reseller documentation supplied by the owner on 2 October 2026:
- POST https://nexabot.id/api/v1/api, x-api-key authentication.
- Text maps to t2v; image maps to i2v with one base64 image.
- Landscape ratio 1; portrait ratio 2; numeric resolution 720 or 1080.
- Provider cost 0.15 credits for either resolution. Unlimited does not cover API.
- GET /api/v1/api/credit is read-only and free.
- Submit returns HTTP 202, queued and job_id.
- GET /api/v1/jobs/:id supports queued, processing, done, failed.
- GET /api/v1/jobs/:id/download returns an MP4 stream.
- No duration field is documented. The UI's 10 seconds is not yet confirmed by a live output.

## Apply and check

Keep the ZIP in Downloads and run its APPLY.ps1 through the supplied PowerShell loader.
It checks origin/push URLs and the exact baseline, backs up tracked source, checks/applies
patch, runs build and mock provider tests. It does not commit, push or run SQL.
Only recognized generated next-env.d.ts development paths are restored after backup;
other local edits stop the patch.

Set the existing NEXABOT_API_KEY entry in .env.local to your own nxb_ API key.
Never paste the key into chat or commit .env.local. Restart the development server after changes.

Run:

```powershell
npm run check:nexabot:credit
```

Expected: NEXABOT_CONNECTION=PASS and PROVIDER_CREDIT=<balance>.
CREDIT_READY=false means the connection works but the API wallet needs at least 0.15 credit.
Your Unlimited plan is separate. This command never creates a video or debits platform credits.

## Boundaries

Generate remains disabled until Phase 06 adds persisted jobs, ownership, atomic debit and orchestration.
There are no public provider routes, no wallet mutations, no new SQL or dependencies.
Mock tests do not contact NexaBot. Actual submission/polling/download remain unverified live.
Paid POST is never retried automatically. Timeout, network/5xx or malformed accepted response
means unknown outcome; later orchestration must reconcile rather than blindly refund/resubmit.
Provider failures/refunds do not by themselves authorize a RADAS wallet refund.
Raw provider progress, errors, prompts, telegram_id and API credentials are not returned by the adapter.
Images get MIME/signature/size/base64 checks; these do not replace full image decoding in the future upload endpoint.
JSON requests have a 15-second timeout and 64 KiB response limit. Downloads return a stream;
the future storage consumer must set total transfer time and size limits, consume or cancel it.
Only same-origin HTTPS download redirects are followed (maximum three). External CDN redirects
fail closed pending confirmation of the provider's actual hosts and a safe storage integration.

After local acceptance and credit-check review, commit only the Phase 05 source/docs:

```powershell
git status --short
git diff --check
git add .env.example package.json src/lib/nexabot/client.ts scripts/check-nexabot.cjs scripts/check-nexabot-credit.cjs PHASE-05-SETUP.md PHASE-05-STATUS.md
git diff --cached --stat
git commit -m "feat(nexabot): add server-only reseller video adapter"
git push origin HEAD:main
```
