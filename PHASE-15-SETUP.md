# PHASE 15 — Landing Page

## Install

Required repo wancupie-netizen/radas-v4, branch main, baseline 59ae3288a144810b8fd2b6e6eed424e1d2d5ef4a. Keep the ZIP in Downloads and run the supplied PowerShell loader.

Stop npm run dev (Ctrl+C) before installing. The installer checks port 3000, validates repo/baseline, backs up tracked source, applies the patch, clears only generated .next cache and runs build/tests. This avoids the generated dev-type conflict observed in Phase 14. Source and .env.local are preserved; no SQL, new package or environment variable is required.

## Routes

| Path | Purpose |
| --- | --- |
| / | Public landing page, no account data or auth dependency |
| /studio | Existing protected video workspace |
| /login, /register | Existing authentication pages |
| /auth/callback | Same callback URL; successful confirmation enters /studio |
| /admin/payments | Existing protected manual bank review |

APP_URL remains http://localhost:3000/ during development (existing setting need not be changed). No Supabase redirect URL change is required because /auth/callback is unchanged. app.radas.my is unrelated; future V4 host is video.radas.my. No deployment is performed.

## Content

Headline: Generate AI Video Serendah RM5. Entry: RM5 for 60 video credits. Full packages: Try RM5/60, Starter RM10/120, Creator RM20/250, Power RM50/620. One credit per 10-second generation, portrait/landscape, 720p/1080p.

Bayaran Maybank QR disahkan secara manual sebelum kredit masuk. Hasil video tersedia sementara sehingga 12 jam; download terus dan senarai sesi kosong selepas refresh/logout. No invented testimonials, output samples or speed guarantees.

Mula Sekarang and package CTAs lead to registration. They do not create a paid order or preselect a package; choose the package in Top Up after login. Buka Studio uses /studio and requests login when needed.

## Owner acceptance

1. Run npm run dev. Open http://localhost:3000/ and check headline, four exact packages, section links and FAQ.
2. Check Mula Sekarang → /register and Login → /login. Use an existing verified account to confirm successful login reaches /studio with unchanged balance, zero-credit Generate disabled and working Top Up/admin links.
3. Logout and open /studio directly: access must redirect to /login. Public / remains available.
4. Check layout at desktop and a narrow mobile width around 375px: navigation, buttons, pricing and FAQ must remain readable with no horizontal scrolling.
5. Send screenshots or local acceptance before commit/push. Do not grant fake credits or approve fake payments for this phase.

## Verification

npm run check:landing renders the actual landing with React SSR and verifies locked prices, public copy, anchors and real CTA routes. check:auth builds a separate production fixture and verifies public landing, anonymous studio denial, login/callback destination, refresh/revocation/logout, no private data in landing and safe missing configuration. check:protection and check:errors preserve prior safety checks.

SSR and HTTP checks are not browser visual verification. Chromium is unavailable here, so owner desktop/mobile visual acceptance remains required. No live provider or bank request is made.
