# RADAS UI polish

Baseline: radas-v4/main 335fc4f484fb26c33e27df153f96441cf5713007.

## Changes

- Official logo from https://radas.my/radas-logo.png bundled unchanged as `public/radas-logo.png`.
- CSS viewport hides transparent padding and displays the original symbol next to a readable RADAS label in the sidebar and V4 landing. Full original logo sits on a light plate on login/register.
- Favicon uses an SVG viewport embedding the same original PNG symbol; no recolouring or replacement logo.
- Turquoise #00D2C8, hover #39E5DC, background #080F12, panels #111C21, borders #26363D, text #F2F7F8 and secondary text #9BAEB6. Existing error/warning messages keep distinct colours.
- Locally hosted Inter 400/500/600/700, with OFL licence. Font files are compressed WOFF2; browser and build require no Google font connection.
- Heading/button weight 600, menu/labels 500, body 400, compact brand 700. Top Up in the header has a quieter outline treatment.
- Existing landing navigation check now checks anchor elements, rather than treating React's image preload links as navigation.

## Apply and accept

1. Stop `npm run dev` before applying the PowerShell patch. It checks the exact repository, baseline and file hashes, then backs up touched files. It leaves `.env.local` and generated `next-env.d.ts` untouched.
2. Installer runs production build, landing SSR checks and existing affiliate UI handler checks. No SQL or new packages are needed.
3. Run `npm run dev`. Check desktop and mobile `/`, `/login`, `/register`, `/studio`, `/admin/products` and `/admin/payments`.
4. Confirm the official logo is legible and not stretched, the turquoise controls and focus rings are visible, and font/menu weights look comfortable. Check Generate, Top Up dialog, credit display and mobile tab switching. Owner visual acceptance is separate from automated checks.
5. After acceptance, commit/push the listed UI files to `wancupie-netizen/radas-v4`. This patch performs no commit, push or deployment. The separate `radas-landing` repository and `radas.my` site are outside this patch.

Build, existing authentication regression, landing SSR and affiliate client handler checks passed during preparation. No bank/provider requests or live credit changes were performed.

## Restore if needed

The backup directory printed by the installer contains originals and `touched-files.json`. Stop the dev server first. Copy originals back to their matching project paths and remove only files with `before: null` in that manifest. Do not restore or delete unrelated project files.
