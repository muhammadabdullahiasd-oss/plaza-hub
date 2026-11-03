# Stage 9 architectural review

Review date: 3 November 2026. Reviewed baseline: `main` at `3d91821`. The complete 218-line [backend plan](BACKEND_PLAN.md), [development history](../DEVELOPMENT.md), project instructions and relevant source/tests were inspected. The review itself made no file changes; this document was recorded after the user approved proceeding with the recommended approach.

Finding labels distinguish **Confirmed** source/plan behavior, **Recommendation** proposed changes, and **Decision** unresolved product choices. Critical means a prerequisite before real customer data or money, not a claim that the explicitly labelled demo is a deployed vulnerable service.

## 1. Executive summary

Keep the proposed Node.js/Express/PostgreSQL direction and the existing vanilla frontend. A single API with managed identity and private storage is appropriate for the initial SaaS; frameworks or microservices would not solve its immediate integrity problems.

Confirmed: the baseline has no backend directory, SQL migrations or backend dependencies. Login/registration are simulated; document records contain no files. `AGENTS.md` and `scripts/browser-smoke.cjs` were untracked and were left untouched. All 130 existing demo tests passed during the review. No database, RLS, real session, upload or browser layout test was executed.

The plan is a suitable architectural direction, but it is not an executable schema/API specification. Highest-priority gaps are session ownership, user/tenant linking, RLS context, payment corrections, historical reporting semantics and upload/payment stage dependencies.

## 2. Existing backend proposal assessment

| Priority | Classification | Finding and consequence |
| --- | --- | --- |
| Critical | Confirmed prerequisite | Actual authentication/plaza authorization do not exist. Frontend role checks cannot be promoted to the production boundary. |
| Critical | Confirmed prerequisite | Approval currently changes in-memory objects. The plan correctly requires database transactions, but actual concurrent approval/rollback tests remain mandatory. |
| High | Confirmed plan gap | The provider session plus opaque application session needs explicit refresh, revocation, logout and encryption behavior. A second session layer adds maintenance. |
| High | Confirmed plan gap | Corrections/reversals are deferred without an explicit financial adjustment model. Human verification errors need an auditable correction path before real payments. |
| High | Confirmed behavior | Ledger `asOf` controls overdue classification, not the cutoff for approved payments. It is not a historical balance query. |
| High | Confirmed sequencing gap | B4 requires real evidence intake, but B6 postpones validated private objects. The minimum secure upload pipeline must precede evidence review. Receipt records also belong inside approval, before optional PDF delivery. |
| Medium | Confirmed plan gap | API DTOs, pagination, error codes, session timeouts and operational recovery targets need concrete acceptance criteria. |
| Low | Recommendation | Defer ORM adoption, advanced analytics, automatic billing and a separate queue platform until a demonstrated need. |

Retain the plan's useful decisions: separate profiles and tenancies, immutable issued snapshots, integer kobo, fixed announcement recipients, server-side ownership checks, private storage, an outbox and separate file/database recovery.

## 3. Recommended technology stack

| Component | Recommendation | Reason/trade-off |
| --- | --- | --- |
| Frontend | Existing native JavaScript modules | Preserve current screens and learning investment. |
| API | Express 5 on a patched supported Node LTS | JavaScript continuity; explicit routing, authorization and transactions. Express is not an authentication/security system by itself. |
| Database | PostgreSQL with reviewed SQL migrations and `pg` | Relationships, scoped foreign keys, uniqueness, range checks and transactional locking fit the domain. |
| Authentication | Supabase Auth, subject to integration validation | Managed identity/recovery rather than custom password handling. Application permissions remain PlazaHub's responsibility. |
| Files | Private Supabase Storage initially | Combines infrastructure with the proposed managed database; provider coupling, region, backups and egress still need review. |

Node 26 LTS is the plan's preferred new-runtime target; the inspected local runtime is 24.15.0. Express 5 supports that runtime, so a major upgrade is not a prerequisite for a loopback foundation. Patch/pin the chosen supported LTS before deployment. See [Node release schedule](https://github.com/nodejs/Release) and [Express requirements](https://expressjs.com/en/5x/api/).

Use one shared provider project/database for the MVP's independent plazas, not a project per plaza. Keep a separate development/staging/production boundary. Avoid adding Redis, an ORM, GraphQL, Kubernetes or a frontend framework at this point.

## 4. Authentication and authorization design

**High — Recommendation:** retain the proposed backend-for-frontend session approach: Supabase verifies identity; Express owns an opaque application session in PostgreSQL. The browser holds only the application cookie. Provider refresh credentials remain server-side, encrypted and excluded from logs.

The design must explicitly handle provider-token refresh concurrency, application-session expiry, account suspension, password recovery, local/global logout and provider-session revocation. Do not combine the provider's browser-managed session example with a supposedly HttpOnly server-only session. Supabase's [advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide) describes browser token access and the difference between signature verification and checking revocation. The proposed server-only arrangement needs its own integration test.

Proposed onboarding: invite verified pilot owners/managers; create the plaza and owner membership atomically. Invite tenants to existing tenant profiles through single-use, expiring, server-recorded invitations. A tenant profile/business may have multiple authorized user links, each individually revocable. Never infer ownership merely from matching names or a client-supplied email/tenant ID. Existing contact fields are optional, so login identity collection is an onboarding decision.

Use Secure/HttpOnly/SameSite cookies, session rotation, explicit idle/absolute expiry, CSRF protection and login/recovery rate limits. Validate session/account/plaza/membership/resource access on protected requests. Prefer email login initially and authenticator MFA for privileged accounts; phone/SMS authentication adds a separate cost/delivery dependency.

No role may be selected by a public registration payload. The current role switcher and `DEMO_TENANT_ID` are presentation fixtures, not an authorization input. Platform administration must not implicitly grant access to tenant documents or payment evidence.

## 5. Multi-tenancy strategy

**Critical — Recommendation:** shared PostgreSQL schema with `plaza_id` on operational rows, server-authorized membership, tenant-profile access links, composite foreign keys and RLS as a second boundary. An owner can belong to several plazas without merging their data.

Resolve the user from the validated session, check the requested plaza membership, and then scope both queries and related-resource lookups. Set trusted identity/plaza context transaction-locally on the same acquired connection. Never set it from unverified role/tenant fields or leave context on a pooled connection after a request.

Separate migration, application and background-worker roles. The application must not be a table owner or have `BYPASSRLS`; missing context must deny access. Ordinary `pg` connections do not automatically acquire the browser JWT context used in typical Supabase policy examples. Write and test policies for the chosen connection model. PostgreSQL documents the bypass behavior in [row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Keep domain tables outside exposed Data API schemas and disable unused exposure. Storage has separate controls; database API restrictions do not cover every provider service. See [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).

Required tests include two plazas with identical shop numbers, managers with disjoint memberships, multiple users in one tenant business, cross-plaza guessed IDs, forged tenant IDs, revoked links and pool-connection reuse. Test using the actual application DB role, not only a privileged migration account.

## 6. Proposed database architecture

The [plan's entity groups](BACKEND_PLAN.md#5-proposed-data-model-and-invariants) cover the main domain. They need specific keys and transitions before Stage 11 migrations.

| Model | Required relationship/history |
| --- | --- |
| Users, sessions, memberships, tenant access | Global identity, plaza capabilities and explicit business-profile links; active/revoked states. |
| Plazas, units, tenant profiles | Shop numbers unique within a plaza; profiles kept separate from agreements. |
| Tenancies and term versions | Many historical agreements per shop; several shops per tenant; one active occupant per unit. Shop changes close/create agreements rather than rewrite history. |
| Invoices and items | Explicit periods/due dates, immutable issued amounts, identity snapshots and same-plaza tenancy link. |
| Payment records, evidence versions, allocations | Separate unverified evidence from confirmed value; one-invoice allocation in the current MVP. |
| Reversal/correction entries and receipts | Linked corrective events, actor/reason/time and durable original receipt snapshots. No deletion of confirmed history. |
| Announcements, recipients, reads | Fixed publication audience and individual read status. Delivery attempts are separate from read events. |
| Rent notices and term history | Old/new rent, approved policy version, server effective date, application/cancellation events. |
| Documents, stored objects, visibility history | Original agreement ownership or plaza information scope; private file validation/version state. |
| Maintenance, audit, idempotency, outbox/delivery | Request history, durable mutation records, safe retries and deduplicated external delivery. |

Rent schedules and invoices are different: a schedule describes recurring timing; an invoice is an issued bill. Keep explicit manual issuance initially. Automatic schedules later need versioned frequency/anchor/due rules and a unique generation key to prevent duplicate bills.

Required constraints/indexes include scoped shop-number uniqueness; unique active assignment `(plaza_id, unit_id)`; parent composite keys and same-plaza foreign keys; positive integer-kobo amounts; valid period dates; nonoverlapping issued periods under the current combined-charge invoice policy; one open notice per tenancy; unique allocation/receipt linkage; and explicit canonical payment-reference/idempotency constraints.

Add query indexes for `(plaza_id, tenant_id, status)` on agreements, `(plaza_id, due_date)` on invoices, `(plaza_id, invoice_id, posted_at)` on allocations, and document/recipient/read lookups. Confirm provider extension support for range exclusion constraints. PostgreSQL describes the available mechanisms in [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

**High — Confirmed reporting caveat:** [`ledger.js`](../js/data/ledger.js) sums all current paid records regardless of `asOf`. A read-only experiment added a November payment to a fresh in-memory repository: its January balance changed from ₦510,000 to ₦410,000. Backend historical reports need a defined posting cutoff, including reversals. Distinguish bank payment date, recorded/approved timestamp and billing period. Current all-period summaries should not be presented as historical reports.

## 7. Payment workflow and transaction design

Preserve submission → pending → approved/rejected. Upload completion never confirms money. Managers verify evidence against actual bank information; tenants cannot send an approved state or choose another tenant's invoice.

Approval must use one database transaction: authorize, lock invoice then submission in a consistent order, recheck current state, calculate net outstanding, allocate, create the durable receipt, write review/audit/idempotency/outbox records, and commit together. Manual confirmation follows the same allocation path. Uncommitted notifications must not escape. Use one acquired client as required by [node-postgres transactions](https://node-postgres.com/features/transactions).

An idempotency record must bind the caller/plaza/key to method, resource ID and canonical payload hash—not just a JSON body that could be identical for two different approval URLs. Same request returns the existing receipt; a conflicting payload returns a conflict. Database uniqueness protects against different reviewers or keys processing the same payment twice.

**High — Recommendation:** define canonical bank-reference and evidence-resubmission rules. Current [`ledger.js`](../js/data/ledger.js) rejects duplicate trimmed/case-folded references even after rejection. Corrected evidence should not require inventing a new bank reference. Use a linked correction/evidence version rather than creating duplicate received money. A reference or image hash alone is not proof of payment.

Before real payments, add authorized linked reversal/correction events. Original allocations/receipts remain, with explicit reversal/supersession state; reports calculate net amounts. Keep overpayment and multi-invoice allocation disabled until their business rules exist.

Acceptance gates: simultaneous ₦70,000 approvals against ₦100,000 permit only one; manual-versus-evidence races behave identically; duplicate/retried requests return one receipt; transaction failure leaves no partial state; rejected evidence never reduces debt; reversals reconcile balances and audit history.

## 8. Document storage and security

The metadata-only scope in [`documents.js`](../js/data/documents.js) is correctly labelled. Preserve its distinction between a tenancy's original tenant and evergreen plaza information, subject to approval of historical-access rules.

**Critical — Recommendation:** authorize upload intents and every metadata/content lookup. Use server-generated object IDs, private quarantine, content/type/size validation, malware checks, tenant/plaza ownership checks and attachment downloads. Suggested initial policy for review: PDF/JPEG/PNG, a configurable 5 MiB limit, no HTML/SVG/Office formats. These are proposed product limits, not existing validation or a guarantee of file safety.

Model intent → uploaded/quarantined → clean/blocked → published. Database and object storage cannot share one ordinary SQL transaction: handle failed uploads, orphan objects, scan outages and cleanup explicitly. Until clean/authorized, files remain inaccessible. Proof images remain pending even after successful scanning.

For initial sensitive downloads, prefer API authorization plus streaming with private/no-store responses. Signed links, if added, have short expiry and a documented revocation window; already-issued links/downloaded copies cannot be fully recalled. Public buckets are unsuitable for tenancy/evidence files. See [Supabase bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## 9. API architecture

Keep one modular Express application, a PostgreSQL pool/transaction helper and feature services. Use same-origin `/api` requests, validated input schemas, server-selected ownership, safe response DTOs, bounded pagination and error codes such as unauthenticated, forbidden/not-found, validation and conflict. Do not expose a generic endpoint that accepts arbitrary record status changes.

`/api/session` supplies the verified user and permitted plazas/profile links. Resource paths may include a plaza ID, but authorization always checks it. Financial writes use idempotency; edits use version checks. Logs carry generated request IDs without credentials, full request bodies or signed URLs.

Stage 10 should expose process liveness separately from operational readiness. Protected routes fail closed until authentication exists. No public demo-login endpoint should pretend to establish a real session.

## 10. Frontend integration strategy

Retain screens and feature modules. Add an API transport module and async repository adapter; migrate one workflow at a time. [`repository.js`](../js/data/repository.js) returns synchronous arrays/live objects in places, so replacing it with fetch without renderer changes will break the app.

Use loading/error/empty/success states, disable pending submissions, retain failed drafts, ignore stale search responses and clear user/plaza caches on logout or scope changes. Return joined page data to avoid one request per tenant/unit inside render loops. Keep demo/live modes separate; never convert a failed API write into a local success.

**High — Confirmed migration risk:** [`ui.js`](../js/ui.js) inserts toast messages as HTML, and older dashboard strings include unescaped names. Current form restrictions reduce some paths, but this is not safe output handling for arbitrary API data. Fix output escaping/text insertion and review inline handlers/CSP before real data; no browser exploit was claimed or executed in this review.

## 11. Security risks and mitigations

| Priority | Risk | Required mitigation |
| --- | --- | --- |
| Critical | Cross-plaza/tenant access | Verified identity, scoped membership/resource checks, same-plaza FKs and tested RLS. |
| Critical | Duplicate/partial financial confirmation | Locked transaction, durable idempotency, unique links, audit and rollback tests. |
| High | Session theft or stale authority | Secure cookies, CSRF, rotation, revocation, privilege checks and safe provider-token storage. |
| High | Uploaded/private file exposure | Private validation pipeline, per-request ownership and no public object URLs. |
| High | HTML injection or mass assignment | Text escaping, allowlisted input fields and explicit state-transition endpoints. |
| Medium | CORS/rate-limit misconceptions | Same-origin initially; no permissive credentialed CORS. CORS is not authorization. Limit authentication/uploads per actor and IP, with correct trusted-proxy configuration. |
| Medium | Secret/error leakage and recovery failure | Environment/host secrets, least-privilege DB roles, safe errors, redacted logs and tested recovery. |

Keep database credentials and provider service keys server-only. Use parameterized queries, restricted migration credentials, patching and dependency checks. Audit events should be append-only for the ordinary application role, not claimed immune to a database owner. Review data location, retention and customer obligations before hosting sensitive records; no legal compliance claim is made.

## 12. Development and deployment costs

Local Node/Express/PostgreSQL development can avoid hosting charges. PostgreSQL/Docker commands were not found on PATH during inspection; that does not prove no installation exists. Choose a local PostgreSQL setup in Stage 11 rather than silently creating a paid cloud project.

Checked official prices on 3 November 2026: Supabase Pro starts at US$25/month for the included first project; additional projects/usage can increase the bill. The free tier may pause after a week of inactivity, and automatic backups are not included there. It is suitable for development, not a promised production availability plan. See [Supabase pricing](https://supabase.com/pricing).

Planning allowance, not a vendor quote: approximately US$40–80/month for a small production setup, assuming the US$25 managed base, US$10–25 API hosting and US$5–30 combined email/domain/object-backup allowances. Paid staging, workers, large usage, taxes and premium recovery can add costs. Convert using the actual payment/FX rate when budgeting in naira.

PITR is a material extra: Supabase's example totals US$130/month for Pro + Small compute + seven-day PITR after compute credit, before API hosting. See [PITR billing](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery). Database backups do not include Storage file objects; recovery needs both, as the original plan correctly states. See [backup scope](https://supabase.com/docs/guides/platform/backups).

Budget a production SMTP service for invitations/recovery: the default provider SMTP is not intended for production delivery. See [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp). No paid service was provisioned. A defensible development fee/timeline requires the pilot scope and mentoring capacity; authentication, SQL/permission testing and file handling are the major effort drivers.

## 13. Missing decisions

Resolve each before its dependent feature, rather than blocking the local HTTP foundation:

1. Approved hosting budget/region and any FlexiSAF stack requirement.
2. Owner verification, tenant invitations, shared-business logins, account suspension and historical access.
3. Reviewer powers/self-approval, payment/reference corrections, reversals, overpayments and receipt-number policy.
4. Billing schedules, reporting/posting dates and what constitutes an opening balance on import.
5. Contract-specific rent-change/renewal rules and mid-period invoice correction.
6. Upload limits/types, scanning, retention, withdrawal and historical document availability.
7. Acceptable data loss/recovery time, support/export obligations and monitoring ownership.

The user's subsequent approval authorizes proceeding with the recommended local implementation. It is not a purchase, production-deployment authorization or a resolution of every commercial/contractual rule.

## 14. Recommended implementation sequence

Reconcile B1–B7 with the user's proposed stages:

| Stage | Scope / relationship to the plan |
| --- | --- |
| 10 | Local Express foundation, health/readiness, safe errors, closed protected routes and HTTP tests. First part of B1. |
| 11 | Local PostgreSQL, reviewed schema/migrations, scoped constraints and disposable fixtures. Completes B1 database work. |
| 12 | Managed authentication and persistent application sessions; invitation/refresh/logout/revocation tests. |
| 13 | Capabilities, plaza/tenant ownership and tested application-role RLS before resource APIs. Together 12–13 cover B2. |
| 14 | Shop/tenant APIs and first async frontend slice, including failure states. |
| 15 | Tenancy/rent/invoice rules and durable term history. These operational slices cover B3. |
| 16 | Start with the minimal validated private evidence-upload path, then atomic payment submission/review/allocation and receipt records. B4 cannot depend on a later unbuilt upload boundary. |
| 17 | Broader private document directory, authorized downloads and receipt content/print delivery. B6 plus receipt presentation; receipt records already exist from Stage 16. |
| 18 | Persistent announcements/read states, rent notices, notification delivery/outbox when enabled. B5. |
| 19 | Scoped reporting, temporal/reversal reconciliation and dashboard integration. |
| 20 | Full integration/security/restore/browser review and deployment preparation. B7; tests and security checks also run in every earlier stage. |

The immediate implementation is Stage 10 only. Database configuration, real accounts, authenticated business routes, sensitive files, actual email/SMS and deployment remain subsequent work. Preserve the existing demo entry, regression tests, user changes and Git history throughout.
