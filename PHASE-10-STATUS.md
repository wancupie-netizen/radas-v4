# PHASE 10 status

- Service-only SQL lease/candidate/ack state and private wrapper implemented.
- Original expiry and canonical V4 bucket/owner keys enforced; old untracked orphans included; other buckets/unexpired/unknown paths preserved.
- Physical deletion via Storage API only; expired metadata acknowledged/pruned afterward. Wallet, ledger and generation records preserved.
- Local development timer and protected production endpoint implemented. Production external scheduler not activated; required at deployment.
- Build, isolated cleanup SQL/runner/route checks, actual Next development instrumentation + SDK mock HTTP deletion, and authentication regression passed.
- Owner SQL verification (12 checks), read-only inspection and local cleanup startup passed. Accepted and pushed main: 2fa0f5227a2598f1137f87e31f55a0143423f8d2. Live expired-file deletion remains separate.
- Physical deletion normally follows expiry by one successful 5-minute cycle; downtime/errors/backlog can extend retention. Server access still expires at 12 hours.
