# Admin API Stock

Reporting has been updated by `API-STOCK-GROUPS-SETUP.md`. Use that guide after the original installation below.

Repository: wancupie-netizen/radas-v4
Baseline: 28b9478b7e8a91c8f9a22e1f032662e086c97b0f

## Local setup

1. Stop `npm run dev` before applying the PowerShell patch.
2. The installer backs up touched files, runs build, `check:api-stock`, `check:payments` and `check:errors`. Tests use isolated SQL and provider fixtures only.
3. Open Supabase project **fyqvvkpzcwrmyozxlqkw**, SQL Editor. Run `supabase/migrations/20261003222746_api_stock_summary.sql` once. The installer copies it to the clipboard after local checks pass. This adds two read functions; it does not change balances, payments, generation state or existing tables.
4. Run `supabase/verify-api-stock.sql`; all 11 checks must be true.
5. Run `npm run dev`, log in as the existing payment admin, open `/admin/payments`.
6. Verify the Stok API card and Semak stok API button. Check mobile layout separately.

Existing environment only: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `NEXABOT_API_KEY`, `RADAS_PAYMENTS_ENABLED=true`. The NexaBot key remains server-only. No new variable, dependency or scheduler is required.

## Meaning of the numbers

- All remaining V4 wallet balances are included, including admin/test accounts and legacy balances. Zero-balance accounts do not add liability.
- Pending/submitted/rejected payments do not grant credits and therefore do not add to the balance total. Approved payments are counted through the actual current wallet, never by summing old package purchases.
- Main Required API = remaining customer credits × current NexaBot cost. Customer and internal groups follow API-STOCK-GROUPS-SETUP.md. All-wallet liability remains available under Keperluan semua akaun.
- Target = required API × 1.20, rounded upward to 0.01 API credit.
- Suggested top-up = max(0, target − current NexaBot balance).
- Available videos = floor(provider credit / provider cost), using integer hundredths to avoid floating point boundary errors.
- Cukup / Buffer rendah / Tidak cukup describe the current customer-credit requirement and its buffer.
- Values are snapshots, not an atomic transaction across NexaBot and Supabase, and are not a new sales/generation gate. Reserved job debits are already removed from wallet balances; the buffer is operational headroom, not proof of pending provider outcomes.
- Provider amounts outside supported nonnegative two-decimal precision, malformed SQL data or outages show Tidak dapat disemak. No invented balance or old green status is shown.

## Acceptance

- Admin sees actual provider balance and total wallets; compare the provider figure with `npm run check:nexabot:credit`.
- Semak status in the payment panel refreshes stock after a successful list read, including after approval. Manually refresh stock after a NexaBot top-up.
- Ordinary verified user requesting `/api/admin/api-stock` gets 403; anonymous gets 401. No provider request happens before SQL admin authorization.
- Offline/failed refresh removes the old status and displays Tidak dapat disemak. Reconnect and refresh.
- Payment approval and normal user Top Up remain unchanged.

After local acceptance, commit/push through VS Code. Railway web service should deploy the resulting commit. No change to the cleanup service is needed. The production database installation is shared with localhost if both use the confirmed project.
