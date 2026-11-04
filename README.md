# PlazaHub

A Nigeria-focused plaza management prototype built with HTML, CSS and vanilla JavaScript modules. All people, payments and documents are demo records. Changes last only until the page is refreshed.

## Run locally

Node.js is required. The current frontend has no third-party packages to install.

```powershell
npm.cmd start
```

Open [the local preview](http://127.0.0.1:4173). Use the role switcher to explore Super Admin, Plaza Admin and Tenant views. Login and registration are simulated; the role switcher is not authentication. Stop the server with Ctrl+C.

`index.html` is the entry point. `plazahub.html` redirects there. Use the local server rather than opening the HTML file directly, because the app imports native JavaScript modules.

## Workflows and checks

The demo includes plaza/shop records, tenant assignment and history, invoices and partial payments, manual evidence review, numbered printable demo receipts, announcements, future rent notices and document metadata with demo visibility rules. Actual file uploads, real payment processing and email/SMS delivery are not implemented.

```powershell
npm.cmd test
```

The built-in Node tests cover domain rules, simulated DOM workflows and local HTTP routes. They do not establish production security or replace browser layout/print testing.

See [DEVELOPMENT.md](DEVELOPMENT.md) for stage history, architecture explanations, manual walkthroughs and limitations.

## Backend direction and local foundation

[The backend design and migration plan](docs/BACKEND_PLAN.md) recommends an Express/PostgreSQL API with managed authentication and private storage while retaining the vanilla frontend. It includes alternatives, permission boundaries, transaction rules, recovery and implementation gates.

The [Stage 9 architectural review](docs/STAGE_9_REVIEW.md) records findings and the reconciled implementation stages. The recommended stack was approved for incremental local implementation.

Stage 10 adds a separate loopback-only Express API. See [server/README.md](server/README.md) for installation, endpoints and limitations.

```powershell
npm.cmd --prefix server ci --ignore-scripts
npm.cmd --prefix server start
```

Open [API health](http://127.0.0.1:4174/api/health). Health confirms only that the process runs; readiness and protected API routes intentionally return 503 until their dependencies exist. The frontend still uses its in-memory demo repository.

Stage 11 adds a [local PostgreSQL foundation](docs/STAGE_11_DATABASE.md): versioned SQL migrations, synthetic fixtures and real database constraint/concurrency tests. The database remains separate from HTTP requests and the demo frontend.

Managed authentication, real uploads and API-backed business workflows remain future stages. No cloud account, hosted database, storage bucket or deployment has been provisioned.

[Stage 12A](docs/STAGE_12_AUTH.md) adds locally tested persistent session infrastructure and a provider adapter. Live sign-in remains disabled pending real provider configuration, onboarding and access-control validation. The demo login and role switcher remain simulated.

[Stage 12B](docs/STAGE_12_ONBOARDING.md) adds locally tested single-use invitations and verified account linking. `npm.cmd --prefix server run auth:check` reports missing provider configuration without exposing values or enabling login.
