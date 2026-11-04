# Stage 12A: persistent session infrastructure

Baseline: `b85a439`. Implemented 4 November 2026. This is the **local part of Stage 12**, not completed live authentication. No Supabase project configuration or connector was available. The user was asked whether a development project exists; work proceeded on the independent local infrastructure without assuming an answer.

Continuation: [Stage 12B](STAGE_12_ONBOARDING.md) adds private invitation/account-linking services and lifecycle tests. The provider projection now includes a verified canonical email. Live authentication/recovery remain incomplete.

## Current behavior

The existing demo remains at port 4173. The normal API CLI still leaves session routes disabled: login and other protected API requests return 503 `AUTH_NOT_CONFIGURED`. Adding provider values to `.env` alone does not enable them. No browser credentials, provider password, email, invitation, real account or real provider request was used in this stage.

An explicitly composed session router is exercised by integration tests with **real PostgreSQL and a synthetic provider**. The provider adapter itself is tested against synthetic HTTP responses. These are useful integration checks, not evidence that an actual Supabase deployment behaves correctly.

| File | Responsibility |
| --- | --- |
| `server/migrations/002_sessions.sql` | Persistent hashed session identity, encrypted provider credentials, expiry and revocation records; private/default-deny RLS. |
| `server/auth/crypto.js` | Random browser tokens, SHA-256 lookup hashes, AES-256-GCM encryption bound to a session row, and CSRF proofs. |
| `server/auth/provider.js` | Strict optional configuration and stateless Supabase Auth password/user/refresh/local-logout requests. |
| `server/auth/sessions.js` | Explicit account linking, session creation/rotation, expiry, provider checks, serialized refresh and persistent local logout. |
| `server/auth/routes.js` | HTTP composition, cookie handling, origin/CSRF checks, bounded JSON, input allowlist and development attempt limits. |
| `server/tests/auth.test.js` | Crypto, configuration, provider adapter and cookie ambiguity checks without external requests. |
| `server/tests/auth.integration.js` | Session service and HTTP boundary tests using isolated PostgreSQL and a synthetic provider. |
| `server/tests/helpers/database.js` | Shared disposable-database lifecycle for both database suites; never resets development records. |

No new package was needed. Native crypto/fetch and the existing Express/pg dependencies cover this slice. The existing 001 migration remains unchanged; 002 adds the ninth domain table. Migration-history expectations and schema inspection tests now account for both migrations. Both suites use the same test-database helper instead of duplicating creation/cleanup logic.

## How data moves

1. The composed login route accepts only email/password, with an exact application Origin, JSON media type and size limit. Passwords are not trimmed, saved or logged. Extra fields such as role/plaza/tenant are rejected.
2. The provider adapter exchanges credentials at the fixed HTTPS Auth endpoint and verifies the resulting user through `/user`. Only a confirmed, nonanonymous provider UUID is returned; user metadata never grants a PlazaHub role.
3. The service looks up an **already provisioned** active `users.provider_subject`. A matching email/name does not create or link an account. Unknown/suspended accounts receive the same generic denial; an unused successful provider grant is discarded with best-effort local provider logout.
4. A transaction saves a fresh session-token hash and encrypted provider tokens. The browser receives a random token in an HttpOnly cookie; it never receives provider access/refresh tokens. A successful login revokes the previous browser token in that transaction. Failed login preserves an existing session.
5. Session reads lock the matching database row, check account/expiry, decrypt credentials, and verify the provider user. Near expiry, refresh and encryption updates happen while that same PostgreSQL lock is held. Different tabs/processes therefore use the newly committed token instead of racing on an old refresh token.
6. Logout checks a cookie-bound CSRF proof and commits local revocation/removal of encrypted credentials before attempting provider logout. A provider outage cannot restore local access.

AES-GCM detects ciphertext changes and binds credentials to the session hash, so copying ciphertext to another row fails. The encryption key lives outside the database. Hashing the browser token allows lookup without storing a replayable cookie value. These serve different purposes: encryption must be reversible for refresh; the browser token's lookup hash need not be reversible.

The service's local defaults are **30 minutes idle and 8 hours absolute**, not a contractual product policy. Reads can extend idle expiry up to the original absolute deadline. Expiry is checked again after provider I/O. Revoked/expired/unreadable sessions retain their metadata while encrypted credentials are removed. Revocation/retention cleanup policy still needs a release decision.

## HTTP contract in composed tests

| Method/path | Behavior |
| --- | --- |
| POST `/api/session/login` | Exact Origin and bounded email/password JSON; returns safe user ID/display name, CSRF proof and absolute expiry; sets a fresh cookie. |
| GET/HEAD `/api/session` | Reads the cookie and returns the safe session projection, or 401 and a cookie clear. No memberships/capabilities are supplied yet. |
| DELETE `/api/session` | Exact Origin plus `X-CSRF-Token` for an existing cookie; commits local logout and clears the cookie. Repeating it is safe. |

The loopback-only HTTP test cookie is named `plazahub_local_session`, scoped to `/api`, HttpOnly and SameSite=Strict. It lacks Secure because local HTTP cannot provide TLS. HTTPS composition uses `__Host-plazahub_session`, Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain. HTTPS configuration rejects plain HTTP and spoofed forwarded-protocol headers with the current untrusted-proxy setup. A real TLS/proxy/browser rollout is still untested.

Host/Origin checks use a configured origin, not a client-selected redirect or forwarded host. Mutation requests require Origin. Cross-site reads, ambiguous duplicate cookies, query parameters, malformed/oversized JSON and role fields are rejected. No permissive CORS is added. The frontend demo has no API session wiring yet; a port-4173 page is not the same origin as port 4174.

Login limits are bounded, process-local development buckets by socket IP and hashed normalized email: ten attempts per ten-minute bucket by default. Spoofing X-Forwarded-For does not change the socket IP. Counters reset on process restart and are not distributed; shared deployment limits, accurate proxy configuration and recovery/invitation limits remain release gates. These are not claims of complete brute-force protection.

Logout is **local application/current provider session** only. It is not a global logout. Provider cleanup is best-effort; an outage, expiration or replaced application cookie does not guarantee all upstream sessions were terminated. Global logout, privilege-change invalidation, recovery, invitations, MFA and session cleanup remain incomplete. Provider HTTP/database transactions cannot commit atomically: a crash after remote refresh but before local commit may require sign-in again. No fake success or unbounded refresh retry hides that failure.

## Prepare provider configuration locally

Use the commented variables in [server/.env.example](../server/.env.example) when a Supabase **development** project is available. Keep actual values in ignored `server/.env`. The adapter accepts the hosted project's HTTPS URL and new publishable key; it intentionally rejects service-role/secret keys, legacy JWT keys and arbitrary hosts. No admin provider key is needed for these requests. Account provisioning/invitation administration needs a separate reviewed path.

Generate a random 32-byte encryption key in your own terminal when ready:

```powershell
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'));"
```

Save that value as SESSION_ENCRYPTION_KEY locally; do not paste it into chat or commit it. Replacing/losing the key makes existing sessions unreadable and requires sign-in again. A production key-management/rotation procedure remains necessary. `readAuthConfig` validates configuration, but CLI startup intentionally does not activate it yet.

The adapter uses fixed HTTPS endpoints, redirect rejection, four-second per-request deadlines, bounded response bodies and safe error codes. It shares no mutable provider session between users and automatically sends no email. See the provider's [Auth REST endpoints](https://supabase.github.io/auth/) and [getUser documentation](https://supabase.com/docs/reference/javascript/auth-getuser).

Supabase documents single-use refresh behavior, reuse handling and the distinction between JWT expiry and provider session termination in [sessions](https://supabase.com/docs/guides/auth/sessions). A locally valid application cookie alone is insufficient. The current upstream [authentication implementation](https://github.com/supabase/auth/blob/master/internal/api/auth.go) loads referenced users/sessions; that source is not proof of the version/configuration running on a hosted project. Live logout/password-reset/ban/session-revocation tests remain mandatory before enabling login. Local tests simulate revocation responses; they do not establish hosted-provider revocation guarantees.

## Verification and remaining Stage 12 work

```powershell
npm.cmd --prefix server run db:migrate
npm.cmd --prefix server test
npm.cmd --prefix server run test:db
npm.cmd test
```

The new migration was applied to `plazahub_dev` without changing existing demo profiles/plazas/agreements. Integration suites create their own random test databases and clean up only those. A new service instance reads an existing persisted session; no full operating-system/process-restart test is claimed.

Tests cover encryption/tampering, row binding, redacted provider errors, account linking, suspension, expiry, cookie rotation, provider outages, refresh races across service instances, logout racing refresh, CSRF/origin guards, invalid JSON/role fields, throttling and HTTP/TLS-proxy confusion. Existing occupancy/history/migration tests also pass with both migrations. Default API tests continue to prove unavailable/closed routes, not real tenant authorization.

Verification result: **25 backend unit/HTTP checks, 30 PostgreSQL integration checks and 130 frontend regressions pass**. Development still has two synthetic plazas, one tenancy, zero sessions and zero linked provider identities. The frontend and normal API health endpoints return HTTP 200. No browser layout or live-provider QA was performed.

Before finishing Stage 12 and enabling live authentication:

- Configure the actual development provider and perform real sign-in/refresh/logout/revocation integration checks with consented test accounts.
- Implement verified invitation/account linking and recovery, including expiry/single use, reviewed role assignment and configured delivery. No invitation/recovery emails have been sent.
- Define local/global logout, privileged MFA and session invalidation/cleanup rules; validate provider version and behavior.
- Compose the runtime with restricted credentials and tested policies. The migration owner/superuser remains tooling-only; Stage 13 must prove plaza/tenant isolation with the actual non-owner role before resource routes open.
- Review TLS/session-cookie/proxy deployment and shared rate limits, and move the frontend to a same-origin async integration with proper failure states.

Stage 12A is a reviewable local checkpoint. Stage 12 remains open; Stage 13 authorization and subsequent business APIs are not claimed complete. See the [review roadmap](STAGE_9_REVIEW.md#14-recommended-implementation-sequence).
