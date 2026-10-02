# PHASE 06 — Generation Flow

Repo: https://github.com/wancupie-netizen/radas-v4
Required baseline: 3db47945e04641ac470fad7b4650ce75a9562354.
Local app: http://localhost:3000/. Future V4: video.radas.my.
app.radas.my is unrelated.

## What is built

Verified login → server validation → free provider-credit check → atomic RADAS reservation/debit
and generation record → one NexaBot POST → persist provider job ID → poll status → private preview/download.
Text uses t2v; image uses i2v with one image; portrait/landscape and 720p/1080p map to documented numbers.
No duration field is sent. The fixed 10-second UI setting still needs confirmation against a live output.

The generation table is private in radas_v4, with RLS and no direct browser/service table permissions.
Only a service-role RPC can mutate it; every operation checks the verified user's job ownership.
A stable UUID and request fingerprint prevent a retry from generating/debiting again.
One active generation per user is enforced by wallet locking and a unique partial index.
Job record, ledger debit, and wallet change share a database transaction.
Definitive submission rejection and confirmed provider failure refund once through the ledger.
Unknown submission outcomes never trigger an automatic refund or another provider POST.
A crashed submission becomes unknown after two minutes; it blocks new submissions for operator review.
This is essential baseline safety; Phase 07 will further review recovery/refund handling before public use.

## Apply locally

1. Stop npm run dev. Keep the patch ZIP in Downloads; run the provided PowerShell ZIP loader.
2. Installer verifies origin and push URLs, exact baseline, clean tree, and the recognized generated
   next-env.d.ts dev-path change. Tracked source is backed up before applying.
3. npm ci installs the locked dependency tree, including sharp for full server-side image decoding.
   Build, generation, provider, generator input, credit and isolated auth checks run without live API/DB calls.
4. Installer copies the migration SQL to the clipboard. Open **Supabase fyqvvkpzcwrmyozxlqkw**,
   SQL Editor, paste and Run once. Do not run it in a different project.
5. Run supabase/verify-generation-flow.sql in the same SQL Editor. Every passed value must be true.
   The migration aborts on existing names and does not overwrite legacy or existing wallet data.

## Configuration and local acceptance

Generation stays disabled by default. After SQL verification, add this to the existing .env.local:

```dotenv
RADAS_GENERATION_ENABLED=true
APP_URL=http://localhost:3000
```

Keep your existing Supabase public keys, SUPABASE_SECRET_KEY and NEXABOT_API_KEY server secrets.
Do not send or commit .env.local. Restart:

```powershell
npm run dev
```

Expected with a zero RADAS wallet: Generate stays disabled. No free credits are created.
With a real funded RADAS wallet but provider credit zero: submission is denied before any debit.
The existing read-only check:nexabot:credit remains available.
Mock checks fund **isolated test databases only**; no test credit is added to real accounts.
Actual paid video testing is pending both legitimate RADAS funding and NexaBot API funds.
Do not edit live wallet balances or fabricate a payment to test generation.
Payment integration remains Phase 11. Keep generation disabled in any public deployment until later safety/launch checks.

## UI and output

Preparing reflects submit/queue; Generating reflects the provider processing state.
Finalizing reflects fetching the finished MP4, with no fake percentage.
Preview/download are fetched through an authenticated same-origin route. API keys and provider job IDs
are never exposed to the browser. Provider progress/errors/prompt/telegram fields remain private.
Only the current result is kept in component memory; refresh/logout clears it, with no automatic history restore.
An uncertain transport response preserves the same request/form for a safe lookup/retry, not a new job.
Failed/rejected results display a refund only when the database confirms it.

This phase proxies MP4 from NexaBot; it does not yet implement temporary object storage (Phase 08),
session recent-history lists (Phase 09), or scheduled deletion (Phase 10).
Access to output expires 12 hours after creation. No output file is stored by RADAS in Phase 06.
Prompt/job/ledger records remain for accounting/reconciliation; deletion is a later phase.
Download stream is capped at 128 MiB and two minutes; external CDN redirects fail closed.
Image uploads are capped at 10 MiB, validated and fully decoded with a 40-million-pixel limit.
Local multipart uploads support this limit. Vercel's request-size limits need a direct-upload/storage design
before deploying the full 10 MiB image path; that is part of Phase 08 deployment preparation.
Polling is every four seconds in the UI and throttled to at least three seconds per job in the database.
After repeated errors/15 minutes the UI pauses and offers a read-only status check.
Phase 07 adds request-driven reconciliation of owned known jobs before a new submit, without restoring UI history.
There is no background worker yet. Unknown jobs require operator/provider evidence, even after output access expires.

## Commit only after acceptance

No automatic commit or push is performed. Send local test output and SQL verification first.
