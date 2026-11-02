# Running PlazaHub

Open `plazahub.html` in a browser. This is a buildless HTML/CSS/JavaScript demo; no installation is required. Data changes last until the page is refreshed.

For a local server, run `node scripts/preview.cjs`, then visit http://127.0.0.1:4173. Stop the server with Ctrl+C. The preview serves only the page and its CSS/JavaScript assets and refreshes from current files without caching.

## Maintenance workflow

1. Switch to Tenant, open Maintenance, and submit an issue with a category, priority, subject, and description.
2. Switch to Plaza Admin, open Maintenance, and review the request. Set it to Pending, In progress, or Resolved and leave an update for the tenant. Resolving requires a note.
3. Switch back to Tenant to see the status and management note. Navigation and role changes preserve requests during the same page session.

## Checks

Run `node --check js/app.js` and `node --test --test-isolation=none tests/*.test.cjs`. The second command uses Node's built-in test runner without starting child test processes, which also works in restricted development environments.

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

The supplied master prompt defines a Nigerian plaza SaaS built incrementally with HTML, CSS, and vanilla JavaScript. Core MVP priorities are plaza/shop management, tenant assignment, rent schedules, manual payment evidence and review, receipt records, announcements/rent-adjustment notices, basic reports, and role-specific views. Keep useful existing work and audit before major changes. This remains a browser-only prototype, with no real accounts or payment processing. Automated payments and subscription billing come after the core MVP.

Recommended production work: durable database and backend; per-plaza access controls and real login; stable tenant/lease IDs and a period-based invoice ledger; verified payment-provider webhooks; scheduled reminders and message delivery; audit history and backups. Annual rent versus all-time collections is only a sample comparison until payments are allocated to invoices. Choose the backend/deployment stack before starting that phase.

## Stage 1: tenant data stability

The runnable demo before these fixes is preserved in local commit `9cf4dec`. Use `git show 9cf4dec:js/app.js` to compare it without replacing your working files.

- Payments and maintenance records now have a stable `tenantId`; the existing `tenant` name is a historical snapshot. Renaming a tenant changes neither ownership nor previously recorded names/amounts.
- New tenant IDs use a session counter initialized above the seed IDs. Deleting the last tenant does not produce an invalid ID or reuse an old identity.
- Phone and email are optional for the demo. When supplied, they are validated, retained, shown in the tenant table/edit dialog, and included in tenant CSV exports. Phone formatting spaces, parentheses, and hyphens are removed.
- Profile edits update only fields returned by `readTenantForm`; that function no longer returns `paid`, so `Object.assign(tenant, details)` cannot accidentally reset it.
- Adding requires a real vacant unit. Editing cannot move a tenant through the disabled unit input. Shop reassignment and tenancy history need their own later workflow.
- Lease dates must be real calendar dates, with the end after the start.

Data flow: HTML inputs provide values to `readTenantForm`, validation returns an editable-fields object, the save function updates the in-memory tenant, and render functions refresh the table and related views. Ownership queries compare IDs, not names. These are demo consistency rules, not server authorization.

### Try it in the browser

1. Refresh http://127.0.0.1:4173 and open Plaza Admin → Tenants.
2. Edit Funmi Boutique: change the business name and add an email/phone. Save and reopen to confirm the contacts remain.
3. Switch to Tenant: the welcome name and My Lease name should reflect the edit. My Receipts should still include `TXN-2025-0841`. Historic payment names are intentionally retained.
4. Switch back to Admin → Units & Shops. Open vacant B-24 and choose Assign Tenant. B-24 should already be selected.
5. Add that tenant with valid lease dates. Their unit should become occupied. Attempting to reuse the same unit must fail.

Remaining limitations: edits still reset on refresh; balances still need the invoice ledger; deleting a tenant is not yet a formal tenancy closure; role checks are not authentication; fixed invoice and lease details remain demo content. No backend migration is part of this stage.
