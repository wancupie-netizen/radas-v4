# API stock: customer and internal account groups

This is a follow-up to the uncommitted API stock patch on radas-v4 baseline 28b9478. Apply it after the original stock patch and SQL are installed. Do not rerun the original installation SQL.

## Apply

1. Stop `npm run dev`.
2. Run `RADAS_API_STOCK_GROUPS_PATCH.ps1`. It validates every original stock patch file, backs up touched files, clears generated `.next` cache, then runs build and stock/payment/error checks. It does not discard source changes or modify environment files.
3. After `API_STOCK_GROUPS_LOCAL=PASS`, the new SQL is copied to the clipboard. Open project **fyqvvkpzcwrmyozxlqkw**, paste into SQL Editor and run once.
4. The SQL file is `supabase/migrations/20261003224649_api_stock_account_groups.sql`. It resolves **wancupie@gmail.com** and **dekstop87@gmail.com** once to verified user IDs. If either verified account cannot be found, the entire transaction aborts. Report the error; do not substitute customer IDs.
5. Run `supabase/verify-api-stock.sql`. All **15** checks must be true.
6. Run `npm run dev`, open `/admin/payments`, hard refresh with Ctrl+F5. Verify the responsive card styling, two internal accounts and the correct paid customer count. Check mobile separately.

## Reporting rules

- Main status, API requirement, 20% buffer and suggested top-up cover **remaining customer credits**.
- Customers are accounts with at least one approved payment, excluding the two explicitly marked internal accounts. A customer remains counted even when their balance is zero. Repeat purchases do not double-count customers.
- Internal accounts are identified by stable user ID, not current email, auth user metadata or admin permissions. Classification grants no privileges and changes no balances.
- Current internal balances are separate. They still consume the same provider balance when generating videos.
- Other positive balances without approved payments/internal classification remain visible separately; they are included in all-account totals.
- Expand **Keperluan semua akaun** to see the total liability, buffered target and total shortfall. No balance is silently dropped from that total.
- Provider reads, SQL authorization, no-store headers, failed-refresh clearing and safe replay behavior are unchanged. No new environment variables, packages, API purchases or cron changes.
- CSS Modules provide the card styling directly with the component. Generated stylesheet inclusion is checked after the production build.
- Payment review's empty state now reads **Tiada bayaran menunggu pengesahan.** Ordinary-user copy is unchanged.

After local acceptance, commit **both original and follow-up stock work together** and push via VS Code. The GitHub main baseline remains 28b9478 until that commit. Railway web should deploy the new commit; the cleanup service needs no configuration change.
