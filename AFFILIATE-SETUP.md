# Produk Affiliate v1

Repository: https://github.com/wancupie-netizen/radas-v4
Baseline: 6b6bbace48616e63a82f2223cf4cd994eb19b31c.
Production: https://video.radas.my (Railway). Landing repository is unrelated.

## Install locally

1. Stop `npm run dev` with Ctrl+C before running the patch. The patch verifies the repository, file baselines and local changes, backs up touched files, then runs isolated tests and the production build. `.env.local` is not read, printed or changed by the patch.
2. In Supabase project `fyqvvkpzcwrmyozxlqkw`, SQL Editor, run `supabase/migrations/20261003203515_affiliate_catalog.sql` once. The patch copies it to the clipboard after local checks pass. It creates two private V4 tables and service-only functions. It does not change wallets, payment logic, generations or the legacy application. A second run aborts without overwriting data.
3. Run `supabase/verify-affiliate.sql`. All 11 checks should be true.
4. Run `npm run dev` and open http://localhost:3000/studio.
5. Open http://localhost:3000/admin/products using the existing payment administrator account. Add one real product as a draft, then edit and publish it. Use a stable public HTTPS image URL and product/affiliate URL. Image upload is not included.

## Acceptance

- Admin can add, edit, publish, unpublish, delete and search/filter products without credit. Existing payment administrator membership is used; no email or browser flag authorizes an operation.
- User without an approved payment: locked, including accounts with legacy/free credits. Pending/submitted payment: locked.
- User with at least one approved package and a positive balance: sees published products only. Viewing a catalogue does not spend credit.
- Zero credit: locked. A subsequent approved top-up restores access.
- Search name/category/content type; select category; open product in a new tab. Confirm mobile navigation and desktop layout.
- Required fields: name, image URL, category, price (RM), estimated commission (RM), product/affiliate URL, review date, one or more suggested content types. No prompt field.
- One credit remaining: generate using the existing flow, then open the catalogue; it must lock when credit refresh reports zero. Admin catalogue remains available.
- Two admin tabs editing the same product: stale save/delete returns conflict. Reopen the current product before editing. If a response is lost, use Semak semula to inspect the result; the original draft and ID remain for explicit replay.
- No products are preloaded. Importing the user's 100 products requires their actual dataset; fictional examples are not installed.

## Access and privacy

Every catalogue request rechecks verified identity, approved payment and current wallet balance in SQL. Anonymous/browser RPC and direct table access are denied. Admin mutation requires verified admin, same-origin JSON, bounded request size and strict fields. Responses are private/no-store; products are not saved in localStorage. Audit records preserve before/after changes.

The open tab rechecks on balance change, focus, return from a hidden tab and every 60 seconds. Data already viewed, copied or downloaded cannot be revoked. External product images and links remain accessible outside RADAS; this feature gates the catalogue, not third-party websites.

## Release after acceptance

Review `git diff --stat` and `git diff --check`, then commit/push only this feature to `wancupie-netizen/radas-v4` via VS Code. Railway deploys from that repository. No new packages, environment variables or bucket setup are required. Verify production with one eligible user, one locked user and the admin.

## Local checks

```
node scripts/check-affiliate.cjs
node scripts/check-affiliate-ui.cjs
npm run build
```

SQL/HTTP/client tests use isolated fixtures, not live Supabase or paid provider requests. Existing authentication regression checks also passed during preparation. Live schema installation and visual acceptance remain owner steps.
