# Provider redirect diagnostics — local review

Baseline: production source at 9b696e3312919ba894c2ae9b73b92a2ea3d7858a.

## Evidence and scope

Generation 022a5ca2-ea9e-4333-81d6-74ab693f0124 reached provider done, but RADAS blocked a download redirect. Its original destination was not recorded. Later GET inspection returned HTTP 410, so that inspection cannot establish which origin was blocked. The owner has confirmed this generation is failed/refunded/terminal, with exactly one credit returned (28 to 29). Leave it closed; do not refund, requeue or submit it again.

NexaBot documentation (https://nexabot.id/developers, checked 20 November 2026) says generated files are removed 30 minutes after completion; HTTP 410 means expired/deleted. This provider retention window differs from RADAS's 12-hour record/storage expiry. Neither proves the exact time the original file disappeared.

This patch improves evidence for future redirect failures. It does not discover or approve a fifth origin, recover an expired video, guarantee future downloads, or change credit/refund rules.

## Changes

- Record only validated source/target hostnames, redirect hop and a fixed reason on UNSAFE_DOWNLOAD_REDIRECT. Never record Location, URL path/query, credentials or signed tokens.
- Distinguish invalid configuration, missing/invalid Location, URL credentials, non-HTTPS, custom port, unapproved origin and exhausted redirect budget.
- Report the HTTP status of the actual failing hop. At most three redirects are followed; a further redirect is blocked and sent for review.
- Preserve the original sanitized error in runner startup logs, including invalid origin configuration.
- Keep the same four default approved origins and existing NEXABOT_DOWNLOAD_ORIGINS JSON-array configuration. Keep exact-origin checks at every hop and API-key isolation to NexaBot. No wildcard trust.
- No migration, UI, bucket, price, paid POST retry, wallet, refund or finalization lease changes.

## Validation

Provider and logging tests cover all reason values, rejected destinations never fetched, approved-to-unapproved redirect escape, three-hop limit, cross-origin credential isolation, invalid configuration and malicious diagnostic values. Existing finalization/storage tests cover retry/recovery and unchanged billing. Typecheck, English UI boundaries, production build and actual Next startup finalization fixture are included. Runtime fixtures use mock gateways and block live external HTTPS. They do not establish a newly generated production video's end-to-end success.

## Owner review and deployment

1. Apply the package locally in the existing isolated Dashboard/login worktree; inspect the seven changed files and test output. Preserve generated next-env.d.ts changes outside the feature commit.
2. After owner approval, commit/push only these seven files. Verify Railway deploys the intended commit successfully. No SQL or Railway variable change is part of this patch.
3. Ask NexaBot for its complete approved exact HTTPS storage origins. Validate each origin independently before considering NEXABOT_DOWNLOAD_ORIGINS. That existing variable accepts a JSON array of at most 20 extra exact `https://<20 lowercase letters/digits>.supabase.co` origins. Never copy an unknown logged host straight into configuration.
4. If an unrefunded job fails in future while still available, inspect its existing download GET promptly. After origin verification and separate approval, review a guarded recovery of that same job respecting ownership, expiry and leases. Never repeat the paid provider POST or debit. No generic requeue SQL is supplied here.
5. Any approved live acceptance test must confirm provider completion, saved object, metadata, playback and download before the provider's retention window ends. Do not generate a paid test without owner authorization.

Rollback: revert this feature commit through the normal reviewed deployment process. No database rollback is needed. The existing four-origin allowlist and finalization behavior remain in place; reverting loses the new diagnostic fields. If main has moved, review its changes before applying or reverting.

## Message for owner to send to NexaBot

For job c001b9b2e16c148e, our server received a 307 download redirect at approximately 20 November 2026, 12:01 MYT. Our exact-origin security allowlist blocked the destination; a later GET returned 410. Please provide your current complete list of approved exact HTTPS download/storage origins, how origin changes are announced, and confirm the download retention window. Please do not send API credentials or signed download URLs. We will validate origins before approving them.

This draft has not been sent.
