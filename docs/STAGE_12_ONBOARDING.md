# Stage 12B: invitation and account-linking foundation

Baseline: `6f706aa`. Implemented 4 November 2026. This continues the [session foundation](STAGE_12_AUTH.md). Stage 12's live-provider/recovery gates remain open. No provider configuration appeared in the workspace, and no external account, message or delivery service was used.

## Scope and files

| File | Purpose |
| --- | --- |
| `server/migrations/003_invitations.sql` | Private invitation records, same-plaza relationships, pending uniqueness and append-only lifecycle events. |
| `server/auth/invitations.js` | Internal issue/revoke/accept service, current issuer checks, verified identity linking and atomic grants. |
| `server/auth/provider.js` | Returns the canonical email from the confirmed provider user alongside the UUID. Request email/user metadata do not establish identity. |
| `server/scripts/check-auth-config.js` | Read-only configuration format/presence check; no network call or live-auth activation. |
| `server/tests/invitations.integration.js` | Actual PostgreSQL invitation, permission, lifecycle, concurrency and rollback checks with a synthetic provider. |

No dependency was added. Migrations 001/002 remain unchanged; 003 brings the private domain schema to eleven tables. The frontend and default API routing are unchanged. Neither an invitation form nor an invitation HTTP endpoint is enabled.

## Invitation authority and target

An active, provider-linked owner may invite a manager or a tenant user in that plaza. An active, provider-linked manager may invite tenant users. Ordinary tenants, revoked/suspended staff and another plaza's owner cannot issue or revoke these invitations. The plaza must be active. Tenant invitations require a nonarchived profile in that same plaza; they do not move shops or create business profiles.

The service receives `actorId` from a future trusted session controller. It must never be taken from a public request body. Its SQL checks are exercised using the migration account in local tests; they do not establish a working HTTP authentication boundary or application-role RLS. Restricted credentials/policies and authenticated controllers are still required.

Invitation target fields are fixed at issuance: plaza, kind, optional tenant ID, recipient email, issuer and expiry. Only manager/tenant kinds exist. Owner/platform-administrator onboarding requires a separately reviewed bootstrap/ownership process. A manager invitation cannot downgrade an existing owner or reactivate a revoked owner. A fresh authorized invitation can restore a revoked manager/tenant access link; it does not silently alter an existing active grant or rewrite account identity.

An invitation defaults to 24 hours and is bounded to 1–168 hours. These are local product defaults for review. A pending duplicate for the same plaza/target/canonical email is rejected, including concurrent issuance. Once the previous invitation expires, issuance records its expiration and creates a new identity/token. Email normalization trims/lowercases and rejects controls; it does not merge plus-addresses/dots or infer that different emails belong to one person.

## Acceptance and history

The raw invitation token is a random 32-byte secret, returned once to the trusted delivery caller. Only a domain-separated SHA-256 hash is stored. No raw URL, password or provider token is saved in invitation/event rows. Administrative projections omit the hash/secret. No actual delivery occurs.

Acceptance requires the token and a successful password grant for an already registered, confirmed, nonanonymous provider account. The provider adapter supplies the verified UUID and email. Comparing only the email typed into the form would be insufficient. The verified email must match the invitation, and the provider grant must still be current.

Inside one database transaction, acceptance locks the plaza and invitation, rechecks pending state/expiry, rechecks the issuer's current role/account and target eligibility, finds/creates the global user by verified provider UUID, writes the precise membership/access grant, consumes the invitation and appends the event. Failure in any write rolls everything back. Existing provider UUIDs reuse their existing user across independently invited plazas; matching contact names/emails alone do not link accounts.

The fixed lock order serializes issue/revoke/accept for a plaza. Two simultaneous consumers produce one grant and one consumption event; the other gets a generic invalid-invitation result. Revocation racing acceptance leaves either a revoked invitation without a new grant or an accepted invitation with its grant. All future membership/offboarding services must adopt compatible lock order and be tested for cross-service races. See [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html).

Expired, revoked and accepted tokens cannot be consumed. At exact expiry the token is invalid. Expiration observed by the service is recorded and committed even when acceptance/revocation returns an invalid result. Expiration is lazy; no background cleanup or delivery scheduler exists. Reissuing does not revive an old token.

Pending revocation is repeatable. Revoking an already accepted invitation does not remove its access grant; that needs an explicit membership/access-revocation operation. The issuer's permission is checked at acceptance, so suspension/revocation blocks outstanding invites while that restriction applies. Restoring permissions may make an unexpired pending invite eligible again. Permanent offboarding must explicitly revoke outstanding invitations; it is not implemented by this service alone.

Invitation identity and closed state are immutable; event rows cannot be updated/deleted through ordinary SQL. Events record issued/accepted/revoked/expired, actor and timestamp in the mutation transaction. These are invitation-specific history records, not the complete future platform audit system, and they are not tamper-proof against a database owner.

Acceptance returns a safe grant summary and creates **no application session**. The temporary provider grant is discarded with best-effort current-session logout, including after failure. A provider outage can prevent remote cleanup but cannot turn failed local onboarding into a grant. The user must subsequently use the regular login flow. Provider registration, verification delivery, recovery and their browser experience remain unimplemented.

The random/hashed/expiring/single-use approach adapts the token guidance in [OWASP's recovery cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) to invitation acceptance. This does not implement password reset. Identity is retrieved through the server/provider boundary described in [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## Check and test locally

```powershell
npm.cmd --prefix server run auth:check
npm.cmd --prefix server run db:migrate
npm.cmd --prefix server test
npm.cmd --prefix server run test:db
npm.cmd test
```

`auth:check` prints missing variable names or a configuration-format result. Missing/invalid configuration returns a nonzero status. Even a successful format check contacts no provider and enables no route. The checked workspace reports all three missing: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SESSION_ENCRYPTION_KEY.

When a development provider project is available, create/edit ignored `server/.env` using [the example](../server/.env.example), without overwriting existing local work. Fill its project HTTPS URL, publishable key and locally generated random encryption key; the [session setup guide](STAGE_12_AUTH.md#prepare-provider-configuration-locally) explains key generation. Do not paste passwords/keys into chat. A service-role key is not accepted by this adapter. No provider project can be inferred or created from the current local fixtures.

Verification: **25 backend checks, 51 PostgreSQL checks and 130 frontend regressions pass**. PostgreSQL tests include scope/issuer checks, verified email mismatch, replay, exact expiry/reissue, revocation, owner-role protection, identity reuse, concurrent issue/accept/revoke, immutable history and complete rollback on an injected audit failure. The provider is synthetic; no external authentication/delivery or browser layout test is claimed.

Migration 003 was applied locally. Development retains two demo plazas, one tenancy, zero invitations/events and zero linked provider users. Test invitations/users exist only in the disposable databases created and removed by the shared test helper. All eleven domain tables enable RLS without usable policies/public table grants; the migration owner bypasses RLS as before. Stage 13 must validate a genuine non-owner runtime role and scoped policies.

## Remaining gates

Stage 12 remains open for real provider configuration/validation, verified first-owner provisioning, registration/verification/recovery, invitation delivery/acceptance UI and HTTP protection/rate limits. No invitation emails or real account changes are authorized or performed here. The normal API still reports unavailable authentication, and the demo login remains simulated.

The next independent local slice is Stage 13's restricted database credentials and plaza/tenant authorization. Developing that slice does not close Stage 12's real-provider gates. Business APIs must remain closed until both boundaries are validated.

Learning exercise: compare `email` passed to `accept` with `grant.email`. Explain why a matching form field proves nothing by itself. Then trace the transaction through user linking, access grant, consumption and event insertion; explain why the injected event failure must undo every earlier write.
