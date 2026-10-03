# RADAS V4 AI Video Generator

Existing Next.js App Router project for the supplied V1 roadmap. Repo: wancupie-netizen/radas-v4. Development: http://localhost:3000/. Future host: video.radas.my; app.radas.my is unrelated.

Public landing: `/`. Verified-account workspace: `/studio`. Login and successful email confirmation enter the studio. Manual bank review remains `/admin/payments`.

Completed through Phase 14: authentication, isolated wallet/ledger, generation UI, server-only NexaBot adapter, atomic jobs/claims/refunds, private temporary outputs, session history, cleanup, manual Maybank top-ups, payment safety, error handling and shared account write limits. Phase 15 adds the public landing and studio routing; see [PHASE-15-SETUP.md](PHASE-15-SETUP.md).

Locked pricing: Try RM5/60, Starter RM10/120, Creator RM20/250, Power RM50/620 platform credits. One credit per 10-second generation. Provider cost 0.15 NexaBot credits/video for 720p and 1080p, based on the owner's confirmation. Temporary output maximum 12 hours; download promptly. Maybank payments require manual admin confirmation before credits are granted.

Node.js 22+ required. Install npm ci, configure local environment using the phase setup documents, then npm run dev. Stop dev before production build. Authentication setup starts in [PHASE-02-SETUP.md](PHASE-02-SETUP.md); existing database/storage setup follows the later phase documents in order.

Validate: npm run build, npm run check:landing, npm run check:auth, npm run check:protection. Isolated checks use simulated Auth/provider/Storage transport and private fixture databases; no live bank or paid provider request. Desktop/mobile owner acceptance remains separate. End-to-end funded testing and launch are later roadmap phases; no deployment performed.
