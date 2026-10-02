# PHASE 03 — Credit Engine

Status: implementation and local verification complete; user SQL installation and live acceptance pending.

- Isolated radas_v4 wallet and transaction ledger; legacy Auth/data untouched.
- New wallet 0; RM5 package grants 60; generation debit 1; matched refund 1.
- Atomic wallet row lock + ledger; nonnegative balance; duplicate-safe operations.
- Public invoker RPC wrappers; private definer functions; authenticated own-wallet reads and server-only mutations.
- Real header balance, latest 20 ledger rows, manual refresh, explicit unavailable state.
- Future server-only balance/debit/refund/confirmed-topup helpers. No active payment or generation mutation endpoint.
- SQL migration + read-only verification supplied for project fyqvvkpzcwrmyozxlqkw.
- Production build, auth/API tests and isolated PostgreSQL credit tests passed.
- PGlite single-connection tests do not verify production multi-session concurrency; live DB and browser acceptance remain pending.
