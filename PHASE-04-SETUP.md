# PHASE 04 — Generator UI

Repository: https://github.com/wancupie-netizen/radas-v4
Required baseline: a365c551358d116c5b5fa40bf2e672936acbfb12
Current app: http://localhost:3000/
Future V4 domain: https://video.radas.my/
app.radas.my is unrelated to V4.

## Apply

Keep RADAS_PHASE_04_GENERATOR_UI.zip in Downloads; no manual extraction.
Stop the running dev server with Ctrl+C first. Run the supplied PowerShell loader in VS Code.
The apply script verifies origin fetch/push and baseline, backs up tracked source, checks/applies the patch and runs build, generator input tests and isolated auth/API tests. It can back up and restore only the known auto-generated next-env.d.ts dev-path change; all other dirty files stop the installation. No dependency installation, SQL, commit or push is performed.

Existing .env.local remains untouched. Local APP_URL should be http://localhost:3000. The future production APP_URL is https://video.radas.my when deployed there.

## Local acceptance

Run npm run dev and open localhost:3000 with your existing login.

1. Text to Video: enter a prompt; whitespace/empty input shows an error after leaving the field. Counter stops at 2000 characters.
2. Choose Portrait/Landscape and 720p/1080p; selected states and preview settings agree. Duration stays 10 seconds, with no editable duration selector. Both resolutions show 1 platform credit.
3. Image to Video: choose or drop one JPG/PNG/WEBP up to 10 MB. Source filename, dimensions, thumbnail and source preview appear. The preview fits the complete source image in the selected frame without editing/cropping the source.
4. Try Tukar gambar and Buang gambar. Try cancelling while decoding, choosing multiple files, an unsupported format, corrupt/spoofed image and an oversized image; invalid/stale selections must not remain in preview.
5. Enter separate text and motion prompts and switch modes: each draft is retained during this page session. Refresh clears prompts/source image/settings back to defaults. No localStorage/media history is created.
6. At mobile width the two panels stack with no horizontal overflow.
7. Credits, Profile, Top Up and Logout retain their prior behavior. Source selection/preview never uploads the file or spends credits.

Generate is deliberately disabled until provider integration/job flow. There is no fake video, processing progress, download output, API job or credit debit in this phase. Image preview represents source input only.

## Verification

- npm run build: production TypeScript/build.
- npm run check:generator: prompt bounds, image MIME/header match, zero/oversized/unsupported input. Header checks alone do not prove a decodable image; the UI additionally calls browser image.decode().
- npm run check:auth: isolated production build with fake Auth/RPC; real .env.local and main .next are untouched. Auth test selects server-action forms explicitly, ignoring the new local settings form.
- Local Chromium verification with simulated Auth/RPC: mode draft preservation, orientation/resolution/duration, real PNG/JPEG/WEBP decode, image replacement/removal/drop, corrupt/oversized/unsupported files, late decode cancellation, 2000-character boundary, refresh clearing, mobile width, no upload/provider/debit requests and no JavaScript errors. Desktop/mobile screenshots visually reviewed. This is local fixture verification, not access to your own Windows browser or live Supabase.

## Commit/push after local acceptance

```powershell
git add package.json scripts/check-auth.cjs scripts/check-generator.cjs src/components/video-workspace.tsx src/components/video-studio.tsx src/lib/video/input.ts src/app/globals.css PHASE-03-SETUP.md PHASE-03-STATUS.md PHASE-04-SETUP.md PHASE-04-STATUS.md
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'DIFF failed' }
git diff --cached --stat
git commit -m "feat(generator): complete text and image video settings UI"
if ($LASTEXITCODE -ne 0) { throw 'COMMIT failed' }
git push origin HEAD:main
if ($LASTEXITCODE -ne 0) { throw 'PUSH failed' }
```

PHASE 05 will wire server-side NexaBot integration; job processing and generation authorization follow the roadmap. No new Supabase schema or provider key is needed for PHASE 04.
