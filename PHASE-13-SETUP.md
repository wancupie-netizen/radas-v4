# PHASE 13 — Error Handling

## Install

Run APPLY.ps1 from the ZIP through the supplied PowerShell loader. Required repo: wancupie-netizen/radas-v4, branch main, commit c3e67f4fb31314845ae4e89e7d1a2084a8b3d815. Installer backs up tracked source and applies only Phase 13.

No SQL, bucket setup, npm installation or new environment variables are required. .env.local and the bank QR are unchanged. No live payment approval or paid provider request is part of installation.

## Error behavior

| Case | Behavior |
| --- | --- |
| Insufficient credit | Show top-up/balance instruction; no new reservation is granted. |
| Provider not ready | Show sanitized message; preserve backend credit/refund rules. |
| Generation response timeout, malformed JSON or HTML | Keep original FormData and request ID; explicit same-request replay only. |
| Response ID mismatch | Reject response, keep original request. |
| Poll failure | Bounded existing polling then explicit status retry; never a new provider submit. |
| Invalid image / size / decode | Existing validation and readable image message. |
| Confirmed failed/refunded job | Display credit refund only when refunded=true. |
| Unknown job | Keep support reference and do not submit again. |
| Payment timeout | Keep original order ID and input; check status before paying again. |
| Payment status reload fails after accepted write | Preserve entered bank reference and display status unavailable. |
| Credit lookup fails | Display unavailable rather than inventing a zero balance. |
| Expired video | Existing 12-hour server denial and browser expiry; no download retry after expiry. |
| Unexpected page/layout error | Generic recovery UI; no raw error, provider secret or database text. |

Generation POST timeout is 45 seconds. Credit/payment JSON requests and generation polling are 20 seconds; video download retains its existing 150-second timeout. Client writes have no automatic retry. Existing backend atomic/idempotent database retries are unchanged; no paid provider POST retry is added.

## Local acceptance

1. Restart npm run dev and open http://localhost:3000/. app.radas.my is unrelated; future V4 domain is video.radas.my.
2. Verify login and unchanged balance. A zero balance keeps Generate disabled. Verify all four locked packages and admin access.
3. Open Credits, then use browser DevTools Network → Offline and click Semak baki. It should show unavailable, not a fabricated balance. Restore Online and click Semak baki to recover.
4. With Top Up open, use Offline and Semak status: show status unavailable. Restore Online and refresh to recover. Do not test by making another bank transfer or approving a fake transaction.
5. Send local acceptance. Commit/push only after acceptance.

Packages remain Try RM5/60; Starter RM10/120; Creator RM20/250; Power RM50/620.

## Tests

npm run check:errors exercises actual browser helper functions and component event handlers in a hook harness plus real React SSR. It checks timeout, malformed/HTML errors, hidden private text, original-ID replay, mismatched generation IDs, unavailable-vs-empty payment lists, input preservation after a failed reload, conditional refunds and generic Next fallbacks.

This is not browser visual verification. Existing isolated real SQL/route/auth/storage/provider tests cover billing, ownership, rollback, failed-job refunds, expiry and no paid repost. No live credit mutation, paid video or bank transaction was performed.
