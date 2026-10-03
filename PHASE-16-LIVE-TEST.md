# PHASE 16 — Live acceptance record

Status: owner reported four live video cases and refresh/logout passed. Actual 12-hour cleanup remains pending. See PHASE-16-STATUS.md for the current acceptance record; tables below remain the test-record template. Isolated automated tests do not prove a real bank payment or playable provider video.

## Preparation

1. Run `npm run check:all` with your development server stopped.
2. Run `npm run check:nexabot:credit`. Last known provider balance was zero; verify current balance first.
3. Start `npm run dev`, visit /, register a test account, confirm email where required, then login to /studio.
4. Use an actual received Maybank payment for a top-up. Admin must verify the bank record before approving. Do not approve fictitious payments or grant free test credits.

Locked packages: RM5/60, RM10/120, RM20/250, RM50/620. A real RM5 test should add exactly 60 platform credits once after admin confirmation. Refresh/review the same approved payment and confirm no additional credit. Duplicate-bank-reference rejection is covered by isolated tests; do not fabricate another payment to test it live.

Four sample videos require at least 0.60 NexaBot credits and four platform credits. All eight combinations require 1.20 NexaBot credits and eight platform credits. These are different balances. Provider cost is 0.15 per request for either resolution; application billing is one credit per video.

## Record genuine outcomes

| Case | Job ID | Balance before/after | Preview/download | Result |
| --- | --- | --- | --- | --- |
| Text, portrait, 720p | Pending | Pending | Pending | Pending |
| Text, landscape, 1080p | Pending | Pending | Pending | Pending |
| Image, portrait, 1080p | Pending | Pending | Pending | Pending |
| Image, landscape, 720p | Pending | Pending | Pending | Pending |

Check actual playback, downloaded file, orientation, resolution and expected duration. Verify each successful request debits once. If a submission outcome is unknown, retain its request ID and use the existing recovery flow; do not create a fresh request as a retry.

| Additional acceptance | Expected observation | Result |
| --- | --- | --- |
| Registration/login | Verified account enters protected studio | Pending |
| Real top-up | Approved received payment adds exact package credits once | Pending |
| Failed generation | Confirmed failure refunds exactly once; ambiguous outcome does not refund | Not observed live |
| Recent History | Completed video appears; refresh and logout clear session list | Pending |
| Logout | Protected studio denies anonymous access | Pending |
| Offline recovery | Safe message; no automatic repeated paid submission | Pending |
| 12-hour expiry | Output access expires; successful cleanup removes expired V4 object | Pending |

Do not alter live expiry timestamps or force SQL failure/refund states for testing. Observe natural failure if it occurs; otherwise keep live refund status unobserved while noting isolated coverage. For expiry, allow normal retention to elapse. Local cleanup requires the enabled development process to remain running; production scheduling is a deployment task. Downloaded personal files are unaffected.

Record timestamps and IDs locally. Never post passwords, server keys, full receipts or bank details in test output. No deployment is performed in this phase.
