# Stage 11: local PostgreSQL foundation

Baseline: `main` at `574b47d`. Implemented 3–4 November 2026. The [approved review](STAGE_9_REVIEW.md#14-recommended-implementation-sequence) splits B1 into the Stage 10 HTTP listener and this database slice. No production migration, customer import, cloud account or frontend data-source switch is included.

## Scope and file responsibilities

| File | Responsibility |
| --- | --- |
| `server/db.js` | Validates an explicit local database URL, creates a bounded `pg` pool and runs a transaction on one acquired connection. |
| `server/migrate.js` | Loads ordered SQL, checks applied checksums, serializes migration runners and commits schema/history together. |
| `server/migrations/001_foundation.sql` | Initial private operational schema, relationships, constraints, indexes and history guards. |
| `server/fixtures/foundation.js` | Labelled synthetic two-plaza fixtures, shared by setup/tests. Contains no login credentials or provider identities. |
| `server/seed.js` | Explicit local development seeding; refuses existing records rather than replacing/merging them. |
| `server/scripts/local-postgres.js` | Optional Windows portable-cluster init/start/stop/status, with no Windows service or PATH changes. |
| `server/tests/db.test.js` | Local configuration restrictions and portable migration checksums/numbering. |
| `server/tests/database.integration.js` | Actual PostgreSQL constraints, transactions, migration and concurrent-writer tests. |

`pg` is the one additional direct runtime dependency, pinned at 8.23.1 in the independent server lockfile. No ORM, database emulator or extra test framework was added. Express still does not import this pool or accept business requests. API health describes its own unconfigured database integration; a separately running local database does not make the application ready.

## Local setup on Windows

The checked workstation had no PostgreSQL/Docker command available. PostgreSQL 18.6 binaries were obtained from the EDB archive linked by the [official Windows download page](https://www.postgresql.org/download/windows/). The ignored `.local-postgres/` folder holds binaries, data, log and a generated connection file. Nothing in that folder belongs in Git or a frontend deployment.

For another machine, download the Windows x64 archive from [EDB's binaries page](https://www.enterprisedb.com/download-postgresql-binaries) and extract `pgsql` into `.local-postgres/`. The helper needs its `bin`, `lib` and `share` directories; pgAdmin/StackBuilder are unnecessary. Alternatively, set `$env:PLAZAHUB_PG_BIN` to an existing compatible PostgreSQL `bin` directory. The helper creates a separate cluster in the workspace; it does not control an existing installation's data.

From the repository root:

```powershell
npm.cmd --prefix server ci --ignore-scripts
npm.cmd --prefix server run db:local -- init
npm.cmd --prefix server run db:local -- start
npm.cmd --prefix server run db:migrate
npm.cmd --prefix server run db:seed
npm.cmd --prefix server run test:db
```

`init` runs once and refuses existing data/config. It uses a random local password and SCRAM authentication. Its temporary password file is removed; the generated connection secret remains in `.local-postgres/connection.env`. The configuration binds PostgreSQL to **127.0.0.1:55432** and uses UTF-8. Keep this local folder private. Ignoring a file in Git is not encryption or protection against other software running as your Windows user.

`start` is repeatable and creates `plazahub_dev` if missing. It never selects another port after a conflict. Stop/start retain records:

```powershell
npm.cmd --prefix server run db:local -- status
npm.cmd --prefix server run db:local -- stop
npm.cmd --prefix server run db:local -- start
```

The helper runs child programs hidden; `pg_ctl` writes to `.local-postgres/postgres.log`. Some restricted coding environments require permission to execute PostgreSQL outside their sandbox. Do not change authentication to `trust` to work around a setup failure. PostgreSQL describes initialization/password options in [initdb](https://www.postgresql.org/docs/current/app-initdb.html).

If you already manage PostgreSQL yourself, create a dedicated empty `plazahub_dev` database and put its local password-authenticated URL in `server/.env` as `LOCAL_DATABASE_URL`. The tooling accepts only `127.0.0.1`, a development/test database name, and no URL query overrides. It is deliberately unsuitable for a production connection. Environment variables take precedence over env-file values; `server/.env` can override the generated connection file. Do not print or paste real connection strings.

## What the database enforces

| Table | Purpose and constraints |
| --- | --- |
| `users` | Global account reference, optional unique managed-provider UUID, display name and active/suspended status. No passwords; synthetic subjects are null. |
| `plazas` | Independent plaza identity/configuration, NGN currency and Africa/Lagos business timezone. |
| `plaza_memberships` | One owner/manager membership per user/plaza, independently revocable. A user can manage several plazas. |
| `units` | Physical shop, same-plaza case-insensitive number uniqueness; no stored occupancy counter. |
| `tenant_profiles` | Business/contact record, separate from login and shop assignment. Names are not identities. |
| `tenant_access` | Explicit revocable user-to-business link; supports several users per tenant business. |
| `tenancies` | Immutable plaza/shop/tenant/agreement identity and original lease dates; explicit active/ended/cancelled lifecycle. |
| `tenancy_terms` | Append-only dated rent versions, positive integer kobo and actor/reason; unique version and effective date per agreement. |

Each operational relationship includes `plaza_id` in its foreign key. Linking Plaza A's tenancy to Plaza B's shop/profile fails even if both shops have number A-01. UUIDs make identifiers convenient, not secret or authorized.

A partial unique index permits **one active tenancy per shop**. It does not restrict a tenant to one shop. An elapsed lease end date does not free a shop; an explicit closure does. A replacement uses a new agreement, retaining the previous agreement and terms. Closure/cancellation requires a date and reason. Closed agreements cannot be reopened/rewritten; a future correction/renewal service must append the appropriate new record.

Term amounts are PostgreSQL `bigint`; `pg` returns them as exact decimal strings. Do not coerce them through an unrestricted JavaScript `Number`. Money adapters and API amount bounds belong to the financial integration stage. Event times are `timestamptz`; lease/effective dates are calendar `date` values. The database connection uses UTC; business-date decisions must explicitly use Africa/Lagos in later services.

Foreign keys restrict deletion of referenced parents. Triggers reject deleting tenancies or changing their original identity, and reject updates/deletes of term history. These controls protect ordinary SQL writes; an owner/superuser can still modify the schema or bypass protections. This is not tamper-proof auditing.

Cross-row business rules still require authorized service transactions: checking suspended/archived users/profiles/shops, maintaining at least one owner, creating an agreement and its initial terms together, validating version order/effective dates, notice policy, server-date closure eligibility and audit entries. There are no endpoints that expose incomplete direct writes. These rules arrive with Stages 12–15; the schema alone does not implement them.

## Migration and transaction behavior

Migrations are numbered `001_...sql`, `002_...sql`, etc. The runner normalizes Windows line endings before computing SHA-256 and stores name/checksum/time in `plazahub_meta.migrations`. Applied SQL must not be edited: add a later forward migration. Unknown/changed history fails. No automatic drop/reset/down command is supplied.

One transaction holds an advisory lock, validates history, applies pending SQL and records it. A failed migration leaves no partial table/history. Concurrent runners wait and then see the committed history. Connection/lock/statement timeouts bound waits. `inTransaction` acquires one client, commits on success, rolls back on error, and releases/discards the client appropriately; it never spreads transaction statements across `pool.query`. See [node-postgres transactions](https://node-postgres.com/features/transactions).

The fixtures contain 2 demo plazas, 3 synthetic users, 3 shops, 2 business profiles and 1 tenancy with initial rent terms. There are **no invoices, payments, receipts, files or live accounts**. Rerunning `db:seed` fails safely when records exist. It is not a database reset command.

## Verification and practical limits

```powershell
npm.cmd --prefix server test
npm.cmd --prefix server run test:db
npm.cmd test
```

`test:db` must have real local PostgreSQL available; it fails rather than skipping when missing. It creates a uniquely named `plazahub_test_<random hex>` database, applies migrations/fixtures and drops only that run's database after closing its connections. It never resets `plazahub_dev`. The local tooling account therefore needs database-creation permission; that privileged account must never be used by an eventual application API.

The 15 PostgreSQL tests cover fixture preservation, repeat/concurrent migration runners, checksum drift, migration rollback, same-plaza relationships, scoped shop numbers, expired occupancy, multiple shops per tenant, closure/reassignment history, protected history, invalid dates/amounts, exact kobo, service rollback and two competing database connections. The concurrency test waits until writer B is blocked on writer A's uncommitted assignment, commits A, and verifies that B fails and only one occupant remains.

All eight domain tables have RLS enabled, no policies and no PUBLIC table/schema/function grants. The migration owner bypasses RLS. Tests inspect those defaults; they do **not** establish real user isolation. Stage 13 must create a separate non-owner runtime role, trusted session context and reviewed policies, then test cross-plaza reads/writes and connection reuse with that actual role. No API route is opened before this.

Stage 12 is managed authentication and opaque application-session integration. Provider project access and integration configuration are still needed; local fixtures do not constitute sign-up/login. Subsequent stages add capabilities/RLS, operational APIs, invoices and atomic payment verification, private content, communications and reporting. None of their guarantees is implied by passing schema tests.

Learning exercise: follow `tenancies`' two composite foreign keys and its partial unique index. Explain why a JavaScript vacancy check alone can race, while the unique index makes the second database writer wait and then reject its conflicting assignment. Then trace `inTransaction` and explain why an error after the first insert must roll back that insert too.
