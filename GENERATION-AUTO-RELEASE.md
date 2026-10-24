# Automatic release of unresolved generations

Install `supabase/auto-release-install.sql` in the RADAS production SQL Editor
(project `fyqvvkpzcwrmyozxlqkw`) BEFORE deploying this app patch. Then run
`supabase/verify-auto-release.sql`; every row must say `true`.

The Supabase CLI is unavailable in the preparation environment, so this is an
explicit, rerunnable SQL Editor installer, following the existing support SQL
workflow. It is not an automatically applied CLI migration. Do not reapply older
generation migrations after this installer: they replace the same function.

## Behavior

- `unknown`, no provider job ID, unrefunded: the next owned status/read/reserve
  operation releases the account slot once `updated_at` is at least two minutes
  old. Browser status polling makes this automatic while the page is open.
  With a 60-second provider submit timeout this is approximately three minutes
  after submit, not two minutes after the original click.
- A crashed `submitting` request becomes `unknown` after its existing two-minute
  lease, then waits another two minutes before release. Live known provider jobs
  (`queued`/`processing`) remain locked, even when old.
- Released jobs remain `unknown`, charged, and immutable. They are never posted
  to NexaBot again. Replaying their original ID only returns its existing record.
- Manual `unknown_released_at` releases and the optional `admin_released_at`
  extension remain recognized by the database index, RPC and browser.
- The API exposes `releasedAt` and `releaseAfter`, without provider identifiers.
  Browser timers alone cannot unlock an account. The UI polls until server release,
  unlocks the settings, and explains that each new generation costs one credit.
- After an ambiguous browser response, an explicit retry first GETs the original
  request. Only an authenticated `not_found` response allows retrying the original
  POST with the SAME ID and retained FormData. This is not a new-ID reset: an
  original request may still be arriving. Atomic reservation/private claim prevent
  a second debit/provider POST. Other GET errors retain the pending request.
- A new generation after release requires an explicit customer click; no paid
  requests are submitted automatically.

## Scope and limits

No auto-refund, no compensation credit, no image compression, no provider timeout
change, no payment or pricing changes. Azman's two proposed credits are not
refunded by this installer. The underlying provider timeout is not fixed here.
A provider may still have accepted an unresolved job; a new customer-authorized
generation is separately charged. Browser reloads continue to clear local history
as before. An outage that prevents status reads cannot safely unlock the UI from
browser time alone.

The SQL installer does not bulk-release rows at install time. Eligible rows are
released when their owner next checks status or submits. No new cron is needed.

## Validation

- `npm run check:generation`: isolated PostgreSQL fixtures + real routes, adapter,
  recovery helper, permissions, ledger, missing-record race, replay, concurrent
  reservations, manual/admin releases, known-job locks and installer reruns.
- `npm run check:errors`: real component handlers with hook fixtures and React SSR;
  lost/wrong responses, GET-only recovery, released form/button state, fresh IDs,
  safe messages, refund display and existing payment error behavior.
- `npm run check:safety`, `npm run check:history`, `npm run typecheck`, `npm run build`.

These checks do not call production Supabase, send a paid provider POST or prove
live browser/provider behavior. After deployment, refresh the studio. Owner should
verify one controlled request and observe the release UI if a timeout occurs.
