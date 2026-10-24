# Generation wait timer and repeat guidance

UI-only follow-up to automatic slot release. Requires the already-installed
`releasedAt` / `releaseAfter` API and SQL support. No new SQL, dependencies,
provider requests, billing changes or compression are introduced.

- First server-confirmed `unknown`: show the approved two-minute message,
  a mm:ss countdown to `releaseAfter`, stable internet / keep-page-open guidance,
  and the optional 500 KB image suggestion. No credit or refund text is shown
  in this unknown panel. Existing normal pricing and other state messages remain.
- The countdown recomputes absolute time each second and when the tab becomes
  visible. It does not restart on polling. Initial server rendering or a missing
  deadline shows “Sedang menyemak…”. Reaching zero never unlocks the form.
- Only server `releasedAt` opens the form, switching the message to “Anda boleh
  cuba generate semula” and the result button to “Cuba generation baharu”.
- Two distinct unknown IDs: show troubleshooting (stable internet, smaller or
  different image if this is an image mode, wait for the unlocked button).
- Third distinct unknown: advise stopping and contacting support, include the
  current request reference, and label the return button “Kembali ke tetapan”.
  This is advice, not a new server-side account block.
- Polling/recovery of an existing ID never increments the count. A successful
  generation resets the count. Observations are in page memory, not persisted;
  refresh/new tab starts fresh. Browser/network failures without a confirmed
  generation record do not count as unknown jobs.
- The original image(s), prompt and settings remain when returning to the form.
- Returning to a visible tab or reconnecting internet restarts existing status
  polling. No new generation/provider POST is triggered by these events.
  If reads still fail, the existing “Semak status semula” action remains available.

Validation: `npm run check:errors` executes real component handlers and timer
effects with controlled clock/event fixtures, plus React static rendering.
It covers same-ID deduplication, consecutive attempts/success reset, actual form
unlocking, retained prompt, first/second/third messages, absent/malformed/past
clock deadlines, background-tab recomputation, interval/listener cleanup and no
clock-only unlock. TypeScript and production build also pass. No live customer
or paid provider requests are made by these checks.

Install the companion patch on main, run the checks, then push main. No Supabase
SQL step is needed. After Railway deploys, load the updated studio to get the new
UI. Existing already-open pages still run the older bundle until refreshed.
