# RADAS — per-download provider Storage delegation

Baseline: production source `975140271b8aaf329b712e21bd46edc51c6c0a42`.
Status: local review only; production settings and data have not been changed.

## Problem and resulting behavior

NexaBot sometimes redirects an authenticated completed-job download to a new Supabase project. An exact origin list stops that download until the owner verifies and adds the project; the provider file can expire before recovery. The optional `provider-redirect` policy accepts a new project delegated by NexaBot for that one download, subject to the restrictions below. It does not add the project to a permanent shared allowlist.

The existing server finalization runner still fetches the original saved job, uploads the immutable RADAS object, records metadata and verifies the stored copy. Customers can close the page. Existing ownership, expiry, MP4/header/length checks, upload recovery and credit safeguards remain in place.

## Trust boundary

1. The starting URL is the fixed HTTPS NexaBot download endpoint constructed from the original provider job ID. The server obtains that ID from the guarded generation flow; customers cannot supply a download URL.
2. An HTTPS NexaBot response can delegate this download to exactly one `https://<20 lowercase alphanumeric characters>.supabase.co` origin. Only `/storage/v1/object/sign/<bucket>/<object>` or `/storage/v1/object/public/<bucket>/<object>` paths are accepted. Encoded separators, double-encoded escapes, control characters, userinfo, fragments and nondefault ports are rejected.
3. After crossing to Storage, every remaining redirect must stay on that exact project origin and satisfy the path checks. Returning to NexaBot or moving to another project, including an approved legacy project, is rejected. Three redirects maximum. NexaBot redirects before Storage must retain the original job download path.
4. Resolve all Storage DNS answers; reject an empty set, mixed public/private answers, invalid families and special/private addresses. Choose one checked public address and supply it through the HTTPS socket lookup. Each hop uses a fresh connection (`agent:false`), the original TLS hostname and certificate verification. There is no second DNS resolution, automatic redirect or environment-proxy hop in this transport.
5. Only the NexaBot origin receives its API key. Storage receives a GET with MP4 Accept and identity encoding, with no Authorization, API key or cookies. Limit headers to 16 KiB, body to 50 MiB and body time to 120 seconds. The existing outer provider-header deadline and downstream file validation also apply.
6. Diagnostics keep fixed reasons and hostnames only; signed paths, URLs, tokens, prompts and raw network errors are not logged.

This explicitly delegates Storage selection to NexaBot for the original request. A Supabase hostname or MP4 signature alone does not establish ownership or prove the video content. Compromise of the trusted provider remains a risk. New nonstandard provider domains, path formats or DNS addresses are deliberately rejected for owner review. Public-address filtering is conservative, including IPv4 transition ranges and IPv6 special-purpose ranges.

## Rollout and rollback

| Setting | Behavior |
| --- | --- |
| Missing `NEXABOT_DOWNLOAD_POLICY`, or `exact` | Existing four defaults plus the current `NEXABOT_DOWNLOAD_ORIGINS` array; unchanged transport policy. |
| `NEXABOT_DOWNLOAD_POLICY=provider-redirect` | Restricted per-download delegation and pinned HTTPS transport. |
| Any other value | Fail closed with sanitized invalid-policy diagnostic. |

No SQL migration, new queue/service, dependency install, ledger change, generation POST retry, automatic refund or price change is needed. Preserve the current `NEXABOT_DOWNLOAD_ORIGINS` value for rollback. A code deployment with the default policy alone does **not** activate delegation.

After owner review of the Windows checks, commit/push is a separate step. Verify the intended Railway deployment is successful, then separately approve activation of `NEXABOT_DOWNLOAD_POLICY=provider-redirect`. Existing jobs already in `needs_review` are not automatically reopened by this patch. Never reactivate refunded/terminal incidents. A still-recoverable unrefunded job requires an individually reviewed recovery.

After activation, owner acceptance should generate one new video, close its page before completion, reopen history, play and download the stored video, and check exactly one debit and no refund. Confirm logs contain no unsafe redirect for a standard new Storage project. A second generation is not a recovery mechanism for a failed request. Provider/network/storage outages can still happen; this patch removes the need to edit the origin list for standard project changes, not every possible interruption.

If the new transport has an operational problem, set `NEXABOT_DOWNLOAD_POLICY=exact` and redeploy/restart the service. Keep the current explicit origin list. This restores the old download policy without SQL rollback or deleting stored videos. Review unresolved jobs separately; do not automatically refund or resubmit them.

## Verification performed

- Policy tests: previously unknown project, signed/public paths, misleading hostnames, endpoint escape, credentials/ports/encoding, project hopping, return-to-provider and redirect limit; exact-mode rollback and invalid configuration.
- Native-transport fixtures: public IPv4/IPv6, private/mixed/special DNS rejection, checked address passed to the socket lookup, fresh connection/TLS options and no secret headers. DNS/body cancellation, interrupted body, body timeout, unsupported encoding and header/body size limits.
- Actual production `next start` in both modes: instrumentation claims the existing job with no browser HTTP request; SDK download/upload/metadata/readback succeeds, unknown Storage project uses the native transport, no provider POST and no credential forwarding. DNS/HTTPS/provider/Storage are intercepted by an isolated local gateway. TLS options are asserted, not a live certificate-handshake test.
- Existing NexaBot, generation-log redaction, Storage failure/recovery, finalization, credit safety, English UI boundaries, TypeScript and build checks passed. Credit SQL tests use a queued PGlite connection; this is not a new multi-session production concurrency test.
- All seven existing changed-file preimages matched the real GitHub baseline blob SHAs.

No live provider generation, Railway-container network test, Windows execution or production activation was performed here. Windows checks and live acceptance remain with the owner. The package installer reuses the existing isolated worktree/dependencies, preserves diagnostic worktrees and generated `next-env.d.ts`, verifies the baseline/patch/file checksums, and stops rather than overwriting unrelated changes.

Implementation references: [Node HTTPS request options](https://nodejs.org/download/release/v22.13.0/docs/api/https.html), [Node DNS lookup](https://nodejs.org/download/release/v22.15.0/docs/api/dns.html), [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
