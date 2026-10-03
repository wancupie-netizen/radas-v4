# RADAS AI Video Generator — Phase 02

Complete updated project for the supplied V1 roadmap. Independent of RADAS V3; no Atlas source imported.

Phase 01: Next.js App Router, TypeScript, Tailwind, UI shell and Supabase client setup.
Phase 02: register/login/logout, cookie sessions/refresh, verified workspace access and profile email.

Start with [PHASE-02-SETUP.md](PHASE-02-SETUP.md). Node.js 22+ required. Install `npm ci`, configure `.env.local`, then `npm run dev`.

Validate: `npm run build`, `npm run typecheck`, `npm run check:auth`. The auth check uses a simulated service, not real Supabase accounts.

Locked pricing: Try RM5/60, Starter RM10/120, Creator RM20/250, Power RM50/620 platform credits; 1 credit per generation. Provider cost 0.15 NexaBot credits/video for 720p and 1080p, based on the owner's direct confirmation. Duration target 10 seconds; temporary output maximum 12 hours.

Deferred: real wallet/ledger, payment, generation/jobs, temporary media/cleanup, landing page and deployment. No secret/service-role key is needed for authentication.
