# Running PlazaHub

Open `plazahub.html` in a browser. This is a buildless HTML/CSS/JavaScript demo; no installation is required. Data changes last until the page is refreshed.

For a local server, run `node scripts/preview.cjs`, then visit http://127.0.0.1:4173. Stop the server with Ctrl+C. The preview serves only the page and its CSS/JavaScript assets and refreshes from current files without caching.

## Maintenance workflow

1. Switch to Tenant, open Maintenance, and submit an issue with a category, priority, subject, and description.
2. Switch to Plaza Admin, open Maintenance, and review the request. Set it to Pending, In progress, or Resolved and leave an update for the tenant. Resolving requires a note.
3. Switch back to Tenant to see the status and management note. Navigation and role changes preserve requests during the same page session.

## Checks

Run `node --check js/app.js` and `node --test tests/*.test.cjs`.

## Plaza management workflow

1. Switch to Super Admin and open Plazas. Search by plaza, owner, or city and combine the search with status and plan filters.
2. Add a demo plaza with an owner email, city, unit count, and plan. New plazas appear in the list and recent dashboard registrations. Duplicate names in the same city are rejected.
3. View details or suspend a plaza with confirmation. Restore returns it to its previous status, including trial or expired; sample plazas already suspended restore as active.

The dashboard plaza/tenant totals and plan distribution follow the sample plaza records. Onboarding does not create a login or send credentials. Changes reset on page refresh.

## Subscription plans

In Super Admin, open Subscriptions and edit a plan's monthly price, unit limit, and feature list. Leave the unit limit blank for unlimited. Saved changes last until refresh; they update the catalog without changing existing plaza entitlements or historical payments. Active counts are calculated from plaza records.

Production still requires a backend, database, authentication and plaza access controls, verified payments, and real email/SMS delivery.

## CSV exports

Plaza Admin can export all tenants, all payment records, and the eight displayed unit-report rows. Super Admin can export subscription payments. Files use UTF-8 with a BOM for naira/name compatibility and preserve pending/rejected statuses separately from approved payments. Text starting with spreadsheet formula markers is escaped. Tenant exports include all tenants even when the table is filtered.

## Scope and recommended next milestones

The original full product prompt is not stored in this checkout. Current scope is inferred from its existing screens: Nigerian plaza SaaS with Super Admin, Plaza Admin, and Tenant portals; rent tracking, payments, subscriptions, maintenance, notifications, reports, and floor maps. This is a browser-only prototype, with no real accounts or payment processing.

Recommended production work: durable database and backend; per-plaza access controls and real login; stable tenant/lease IDs and a period-based invoice ledger; verified payment-provider webhooks; scheduled reminders and message delivery; audit history and backups. Annual rent versus all-time collections is only a sample comparison until payments are allocated to invoices. Choose the backend/deployment stack before starting that phase.
