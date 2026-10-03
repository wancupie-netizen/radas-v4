# PHASE 16 — Testing

Baseline: accepted Phase 15, main 6f280ab94e19f8cd7642ff7374c735a5e54ccc4c in wancupie-netizen/radas-v4.

Stop npm run dev before applying the patch or running the suite. The installer backs up tracked source, checks the exact repo and baseline, and clears only generated .next output.

Run `npm run check:all`. All checks run serially and stop on the first failure. The JSON summary is saved in ignored `reports/phase16-local.json`. A failed run is not acceptance; send the failing output. The runtime cleanup fixture starts and stops its own development server and can regenerate next-env.d.ts dev type paths.

The suite covers production build, public landing, errors, input, provider adapter, credits, generation matrix, credit safety, private storage, session history, cleanup, payments, protection, auth routing and cleanup runtime. No new SQL, environment variables or packages are required. No real bank transaction, provider generation, storage deletion or credit mutation is performed.

The eight matrix cases use real application input, routes, adapter and isolated SQL, with simulated provider and Storage responses. The MP4 fixture validates transport, not actual playback, dimensions or duration. PGlite concurrency checks use one queued connection; they do not establish real PostgreSQL multi-session behavior. Browser visual acceptance and real account/provider/bank verification remain separate.

After local tests pass, run `npm run check:nexabot:credit` and send only its connection/balance output. Do not share API keys or .env.local. This command reads the real provider balance without generating video. Follow PHASE-16-LIVE-TEST.md for genuine funded tests.

Development remains http://localhost:3000/; studio is /studio. Future V4 domain is video.radas.my. app.radas.my is unrelated. Landing upgrades are deferred until after deployment.

Do not commit reports, secrets or generated build output. Commit/push instructions follow owner acceptance; the installer does neither.
