# PlazaHub local API — Stage 10

This is a loopback-only Express foundation. It has no database, user accounts, sessions, authenticated business endpoints or frontend data integration yet. The existing demo continues at port 4173.

## Install and run from the repository root

Use a supported Node.js 24 or 26 LTS. This stage was checked on the existing Node.js 24.15.0; install a current patched supported release before deployment. Express 5.3.0 and its transitive dependencies are pinned in this package's lockfile. The root frontend package is unchanged.

```powershell
npm.cmd --prefix server ci --ignore-scripts
npm.cmd --prefix server start
```

The API listens at [http://127.0.0.1:4174/api/health](http://127.0.0.1:4174/api/health). In another terminal, `npm.cmd start` still opens the frontend preview at [http://127.0.0.1:4173](http://127.0.0.1:4173).

`server/.env` is optional. To choose a different port, copy `server/.env.example` to `server/.env` and edit PORT. Local environment files are ignored by Git; the example contains no secrets. The native Node environment-file flag loads it relative to the server package. No dotenv dependency is needed.

The host is fixed to `127.0.0.1`; a HOST variable cannot expose the API on the network. NODE_ENV may be development/test only in this foundation. Invalid ports or an occupied port cause startup to fail rather than silently selecting another port. `npm.cmd --prefix server run dev` uses Node's built-in watch mode. Stop a running server with Ctrl+C.

## Endpoints and behavior

| Request | Response | Meaning |
| --- | --- | --- |
| GET/HEAD `/api/health` | 200 | The HTTP process works. JSON explicitly says database/authentication are not configured and `readyForBusiness` is false. |
| GET/HEAD `/api/ready` | 503 `NOT_READY` | The application cannot serve business workflows yet. This is expected. |
| Other methods on health/ready | 405 | These endpoints allow reads only. |
| Any other `/api` path | 503 `AUTH_NOT_CONFIGURED` | Protected access is closed, including login until Stage 12 exists. Supplied Bearer/cookie/role/tenant values are not accepted as authentication. |
| Other paths | 404 `NOT_FOUND` | The API does not serve repository files or frontend assets. |

Examples:

```powershell
Invoke-RestMethod http://127.0.0.1:4174/api/health
```

Opening `/api/ready` or `/api/plazas/1/units` in the browser shows a JSON error with status 503. Those are deliberate unavailable states, not successful database or authorization checks. The API does not load the demo repository or return synthetic records as live data.

Application errors have `error.code`, a safe `error.message`, and `error.requestId`, matching the generated `X-Request-Id` header. Caller request IDs are ignored. Unexpected error messages/stacks are omitted from responses and the default log event. Node may reject malformed HTTP before Express receives it; the JSON envelope is for application responses.

No permissive CORS headers are enabled, and no JSON business bodies are parsed or accepted yet. Future authenticated resource stages must add schema validation, bounded body parsing, session/CSRF checks and rate limits. The present headers/timeouts are baseline controls, not a production security claim. No credentials or cookies are issued.

## File responsibilities

| File | Purpose |
| --- | --- |
| `app.js` | Creates Express middleware/routes and safe application errors. Importing it never starts a listener. |
| `config.js` | Validates local PORT/mode and fixes the loopback host. |
| `start.js` | Starts the HTTP listener, bounds request/header timeouts and handles shutdown. |
| `tests/app.test.js` | Real HTTP checks of responses, closed routes, redaction and static-file restrictions. |
| `tests/start.test.js` | Configuration, port conflict and graceful/deadline shutdown checks. |

`createApp` describes how a request is handled; `startServer` owns listening. That separation lets tests start isolated listeners on temporary ports. SIGINT/SIGTERM handlers call `stopServer`; it stops accepting connections and allows up to five seconds for pending responses before force-closing them. Tests exercise the shutdown function directly, including an intentionally unfinished response. Native Windows signal delivery is not a substitute for testing the eventual hosting environment.

## Verification

```powershell
npm.cmd --prefix server test
npm.cmd test
npm.cmd audit --prefix server --omit=dev
```

The first command runs 14 backend HTTP/lifecycle tests using Node's test runner and native fetch; no test framework or Supertest was added. The second runs the separate frontend demo regressions. The audit is a point-in-time known-advisory check, not a guarantee of security.

No PostgreSQL connection or migration was executed. No RLS, real session, private upload, payment transaction, browser layout or production deployment is validated by these tests. Stage 11 will add a disposable local PostgreSQL foundation after its setup and schema are reviewed.

See the [architectural review](../docs/STAGE_9_REVIEW.md) for findings, the [migration plan](../docs/BACKEND_PLAN.md) for context, and [development history](../DEVELOPMENT.md) for completed work.
