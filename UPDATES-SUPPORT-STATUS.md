# Updates & Support status

- Implemented: protected user page, studio navigation and Telegram support.
- Implemented: existing-admin draft/publish/edit/delete with private audit and revision/replay safeguards.
- Private service-only RPC, browser table/RPC access denied. Published updates are independent of wallet balance/top-up status.
- No package/environment/credit/payment/storage changes.
- Local build, check:updates, check:auth and check:errors: PASS. SQL tests use isolated PGlite; UI tests exercise actual React handlers/markup.
- Pending owner acceptance: SQL installation/11 verification rows, local admin/user/mobile review, commit/push and Railway deployment.
