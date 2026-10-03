# Top-up UI polish

Repository: wancupie-netizen/radas-v4. Baseline: 6c60bcc4c5549630a4da696edfd3c0b238174ac6.

- Four equal package cards with price, credit count, turquoise hover/focus and an active-order highlight.
- Package selection remains disabled while an order is pending/submitted. The highlighted package displays `Pesanan aktif`; no default package or new payment action is introduced.
- Existing admin-only link has a separate outline card. Status/balance refresh is a full-width turquoise outline button.
- Recent orders have separate cards, smaller references, readable package names, an order count and status badges: pending blue, submitted amber, approved turquoise, rejected soft red. Status text remains visible independently of colour.
- Top-up dialog is centred, wider on desktop and scrolls within the viewport on mobile. QR recipient, amount and submission/approval logic remain unchanged.
- No SQL, environment changes or new packages. No commit/push/deployment performed by the patch.

## Apply

Stop `npm run dev`, run the PowerShell patch, then restart `npm run dev` after `TOPUP_UI_LOCAL=PASS`. Patch validates the repo/baseline/file hashes and backs up only touched files. `.env.local` and generated `next-env.d.ts` remain untouched.

## Visual acceptance

Open Top Up on desktop and mobile. Check four distinct package cards, keyboard focus, centred dialog and scroll access to the close button. Verify active order highlight, status badges, references and reasons using existing orders. Confirm ordinary users do not see the admin link, while admin can open payment review. Check the refresh button and loading/disabled states. Do not create or approve a payment solely for visual testing.

Build and existing error/client handler checks passed during preparation. Owner visual acceptance remains separate. After acceptance, commit only `src/app/globals.css`, `src/components/payment-panel.tsx`, `src/components/video-workspace.tsx` and this document, then push to the V4 repository.
