# PHASE 04 — Generator UI

Status: implemented and locally verified; user localhost acceptance pending.

- Existing RADAS shell retained; generator state split into VideoStudio.
- Text/Motion prompt drafts stay separate; 2000-character counter and whitespace validation.
- Source selection/drop, MIME/header/size checks plus browser decode; thumbnail/metadata/preview, replace/remove/cancel, stale decode guard and object URL cleanup.
- Portrait/Landscape, 720p/1080p, fixed 10 seconds; 1 platform credit for either resolution.
- Source preview is explicitly labeled; Generate disabled pending provider/job phases. No fake generation/upload/payment/debit.
- Session-only draft, image and settings; refresh clears them. Existing account/auth/credit flows retained.
- Production build and generator/auth tests passed. Real local Chromium interactions and desktop/mobile screenshots checked with simulated Auth/RPC.
- No database migration or dependency change. Current target localhost:3000; future domain video.radas.my.
