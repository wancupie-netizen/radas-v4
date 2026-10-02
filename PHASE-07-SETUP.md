# PHASE 07 — Credit Safety

Repo: https://github.com/wancupie-netizen/radas-v4
Required baseline: 440b9ee5ac5c1cb99c0c3f109f010e6520ecb0d0 (accepted Phase 06, including Windows test-path fix).
Local app: http://localhost:3000/. Future V4: video.radas.my. app.radas.my is unrelated.

## Safety changes

Reservation and submit permission are separate:

1. Atomically reserve one RADAS credit and create a `reserved` job.
2. Acquire an exclusive server-generated claim token; move to `submitting`.
3. Only the winner calls NexaBot POST, once.
4. Save the accepted provider job and poll as before.

A lost database reserve/claim response can be retried safely with the same ID/private token before POST.
A different HTTP request generates a different claim token and cannot submit an already claimed job.
The private token never comes from or goes to the browser. Request fingerprint conflicts remain rejected.
Wallet row locking and a unique index covering all active states prevent concurrent overspend/active duplicates.
No client-supplied balance, price, cost, user ID or claim token is accepted.

Refund rules:

| State/evidence | Action |
| --- | --- |
| Provider credit unavailable before new reservation | Deny; no RADAS debit |
| Existing reserved job, provider unavailable before claim | Cancel/refund only if it is still unclaimed |
| Reserved job abandoned for over two minutes | Refund/release when an owned job operation next runs |
| Definitive provider rejection or authenticated failed job | One atomic ledger refund |
| Claimed submit timeout/network/5xx/malformed acceptance | Hold as unknown; no automatic refund/resubmit |
| Legacy Phase 06 submitting/unknown | Preserve; never reinterpret as unsubmitted |
| Completed job | Keep debit; no refund |

The credit function independently rejects refunds of reserved/submitting/unknown/queued/processing/done
jobs and prevents another user's generation reference from being used. Internal generation transitions
authorize failed/rejected state and apply the refund in one transaction. If the wallet/ledger write fails,
job state and refund flags roll back too. Terminal states do not regress.

After refresh, the UI still clears its current result. A new submit may reconcile an owned active job
that already has a provider ID through authenticated GET status. Completed/failed jobs release the slot;
expired output stays inaccessible. Unknown submissions remain blocked for operator/provider evidence.
This adds no history page, browser persistence, or automatic provider POST retry.

## Install locally

1. Stop npm run dev. Keep the ZIP in Downloads; use the supplied PowerShell loader without extracting it.
2. Installer checks exact repo/baseline, backs up tracked source, handles only recognized generated
   next-env.d.ts development paths, and applies the patch. The known test-only backup
   scripts/check-generation.cjs.before-windows-fix is moved to the temporary backup before the dirty-tree
   check; every other untracked or modified file stops installation. .env.local is untouched.
3. Build, input/provider/generation/safety/credit/auth tests run against mocks and isolated databases.
   No real account, credit, payment, or video is created.
4. The new SQL is copied to the clipboard. In Supabase project **fyqvvkpzcwrmyozxlqkw**, SQL Editor,
   paste and Run once: supabase/migrations/20261002140324_credit_safety.sql.
5. Run supabase/verify-credit-safety.sql in the same project. All fourteen checks must be true.

The migration requires Phase 06, adds the private claim column/state constraint, updates the active index
and replaces only the V4 internal credit/job functions. Existing jobs, wallets and ledgers are preserved.
An already installed Phase 07 aborts rather than silently overwriting it.
Stop the app during installation and install this SQL before restarting; new code fails closed if the old RPC
response has no claim permission field. Public rollout remains pending later phases and launch verification.

Keep the existing .env.local credentials and RADAS_GENERATION_ENABLED setting. After SQL passes:

```powershell
npm run dev
```

With zero RADAS credits, Generate remains disabled. Zero NexaBot API funds cannot create a new debit.
Real funded generation testing remains pending; mock test credit is never added to a real wallet.
There is no new package/dependency, operator refund endpoint, or payment bypass.
No automatic commit/push is performed; send test and SQL verification output before acceptance.

## Verification evidence and limits

- Build and isolated auth regression passed, including real Next routes denying anonymous calls.
- Actual SQL functions tested for same/different request IDs, twenty competing claims, one-credit exhaustion,
  duplicate failure notifications, stale reservations, refund rollback and ledger reconciliation.
- Route/flow tests cover twenty HTTP retries issuing one provider POST, lost committed reserve/claim responses,
  provider-zero denial, full image validation, owner-only access and expired known-job reconciliation.
- Actual browser tested with Next + isolated PostgreSQL functions + mock provider: double click, lost submit
  response, forged balance/cost, text/image, preview/download, refund, unknown outcome, refresh/logout and mobile.
- PGlite serializes calls on one connection. Multi-session PostgreSQL execution is NOT claimed: the runtime
  prevented launching PostgreSQL as a non-root user. A multi-session/load check is still required before launch.
  scripts/check-credit-safety.cjs exports runSafetyChecks(adapter) for a disposable empty PostgreSQL test driver;
  its empty-schema guard rejects an existing app database. Never aim this suite at live Supabase.
- Unknown outcomes still require provider evidence/reconciliation. No provider idempotency/search guarantee
  has been supplied. Automatic refunds or resubmits for these jobs would be unsafe.
- Recovery is request-driven; background cleanup/storage/history/payments remain later roadmap phases.
- Live NexaBot output/download and fixed 10-second duration remain unverified; no paid request made here.
