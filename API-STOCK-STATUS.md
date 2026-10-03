# Admin API Stock status

- Implemented read-only admin aggregate RPC, verified HTTP endpoint and responsive stock summary above payment review.
- Main requirement uses current paid-customer balances, with two explicitly classified internal accounts separate; all-wallet totals remain available. Uses current NexaBot cost, 20% buffer and decimal-safe capacity.
- SQL admin membership is checked on every request before accessing provider balance. Aggregate only; no customer identities, provider account fields or secrets are returned.
- Isolated SQL/actual route/client handler checks cover access denial, pending vs approved payments, debit/refund, cost/buffer boundaries, stale responses, outage sanitization and rerun guard.
- Production build, `check:api-stock`, `check:payments` and `check:errors` passed locally.
- Live migration verification, admin/mobile visual acceptance and live snapshot are owner checks. No live provider call, credit mutation, commit, push or deployment performed during preparation.
- Follow-up classification SQL, 15 verification checks and CSS Module styling are documented in API-STOCK-GROUPS-SETUP.md.
