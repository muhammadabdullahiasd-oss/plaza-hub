# Running PlazaHub

This is a buildless HTML/CSS/JavaScript demo; there are no third-party packages to install. It now uses native JavaScript modules, so open it through the local server rather than double-clicking an HTML file. Data changes last until the page is refreshed.

Run `node scripts/preview.cjs` (or `npm.cmd start` on Windows), then visit http://127.0.0.1:4173. `index.html` is the main entry. The previous `plazahub.html` address redirects there. Stop the server with Ctrl+C. The preview serves only the explicitly listed application files without caching; repository metadata and tests are not served.

## Maintenance workflow

1. Switch to Tenant, open Maintenance, and submit an issue with a category, priority, subject, and description.
2. Switch to Plaza Admin, open Maintenance, and review the request. Set it to Pending, In progress, or Resolved and leave an update for the tenant. Resolving requires a note.
3. Switch back to Tenant to see the status and management note. Navigation and role changes preserve requests during the same page session.

## Checks

Run `node --check js/app.js` and `npm.cmd test` on Windows (`npm test` on other shells). No package installation is needed. The test script enables Node's VM module support to load the actual ES module graph into a fresh simulated browser context for each workflow test. Node prints an ExperimentalWarning for this test API; browser ES modules do not require an experimental flag. Tests use Node's built-in test runner without child test processes.

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

Stages 1–4 below implement stable identities, tenancy history, and a demo period-based invoice ledger. Recommended production work: durable database and backend; per-plaza access controls and real login; secure evidence storage and audit history; backups; scheduled reminders and message delivery. Payment-provider integrations remain optional future work. Choose the backend/deployment stack before starting that phase.

## Stage 1: tenant data stability

The runnable demo before these fixes is preserved in local commit `9cf4dec`. Use `git show 9cf4dec:js/app.js` to compare it without replacing your working files.

- Payments and maintenance records now have a stable `tenantId`; the existing `tenant` name is a historical snapshot. Renaming a tenant changes neither ownership nor previously recorded names/amounts.
- New tenant IDs use a session counter initialized above the seed IDs. Deleting the last tenant does not produce an invalid ID or reuse an old identity.
- Phone and email are optional for the demo. When supplied, they are validated, retained, shown in the tenant table/edit dialog, and included in tenant CSV exports. Phone formatting spaces, parentheses, and hyphens are removed.
- Profile edits update only fields returned by `readTenantForm`; that function no longer returns `paid`. The repository additionally limits updates to editable profile fields, protecting identity and payment flags.
- Adding requires a real vacant unit. Editing cannot move a tenant through the disabled unit input. Shop reassignment and tenancy history need their own later workflow.
- Lease dates must be real calendar dates, with the end after the start.

Data flow: HTML inputs provide values to `readTenantForm`, validation returns an editable-fields object, the save function updates the in-memory tenant, and render functions refresh the table and related views. Ownership queries compare IDs, not names. These are demo consistency rules, not server authorization.

### Try it in the browser

1. Refresh http://127.0.0.1:4173 and open Plaza Admin → Tenants.
2. Edit Funmi Boutique: change the business name and add an email/phone. Save and reopen to confirm the contacts remain.
3. Switch to Tenant: the welcome name and My Lease name should reflect the edit. My Receipts should still include `TXN-2025-0841`. Historic payment names are intentionally retained.
4. Switch back to Admin → Units & Shops. Open vacant B-24 and choose Assign Tenant. B-24 should already be selected.
5. Add that tenant with valid lease dates. Their unit should become occupied. Attempting to reuse the same unit must fail.

At the end of Stage 1, edits still reset on refresh, balances needed an invoice ledger, and tenant deletion was not yet a tenancy closure. Stage 3 below replaces deletion with assignment closure and profile archiving. Role checks remain presentation only; no backend migration is part of these stages.

## Stage 2: JavaScript modules and data access

Stage 1 is preserved in commit `e7b09b2`. The existing screens and working workflows are retained. The main HTML moved to `index.html`; `plazahub.html` is a compatibility redirect, not a second copy of the interface.

| File | Responsibility |
| --- | --- |
| `js/app.js` | Starts the app, connects modules, and temporarily retains feature rendering/validation. |
| `js/data/demo-data.js` | Creates independent sample datasets and exports demo constants. |
| `js/data/repository.js` | Reads and updates in-memory records; owns tenant ID generation and assignment invariants. |
| `js/navigation.js` | Demo session state, login/registration presentation, sidebar menus, and page switching. |
| `js/ui.js` | Shared modal and toast behavior. |
| `js/utils.js` | Reusable date, currency, escaping, status, chart-aggregation, and CSV helpers. |
| `js/features/tenancies.js` | Shop assignment, history, ending/cancellation, and tenancy-term dialogs. |
| `js/data/ledger.js` | Invoice issuance, allocation validation, payment review, balances and overdue calculations. |
| `js/features/invoices.js` | Admin invoice forms/list and role-scoped demo invoice details. |
| `js/features/payments.js` | Tenant evidence, admin manual records/review, and approved demo payment records. |
| `js/features/receipts.js` | Shared receipt details, tenant receipt list, and isolated browser print layout. |
| `js/data/announcements.js` | Demo publications, recipient snapshots, scoped queries, and read state. |
| `js/features/announcements.js` | Announcement form, admin history, tenant notices and unread indicator. |
| `js/data/rent-adjustments.js` | Rent-notice snapshots, advance-date validation, application/cancellation and read state. |
| `js/features/rent-adjustments.js` | Notice forms, details, admin/tenant history and explicit application controls. |
| `tests/helpers/load-app.cjs` | Loads real modules in isolated test contexts; legacy data aliases exist only in tests. |

`export` makes a value available to another module; `import` names the values a file needs. For example, `app.js` imports `formatNaira` from `utils.js` rather than relying on a global function. Modules run once per page load and share their imported repository instance. `createRepository()` can also create independent data for tests.

The normal data flow is `input → validation → repository operation → render`. For example, `saveTenantChanges` validates the edit, calls `repository.updateTenant(id, details)`, and refreshes the view. Application writes now go through repository methods. Lists currently return live in-memory records by convention for rendering; this is not a production access-control boundary. A future API adapter will require asynchronous loading/error handling.

Navigation receives a rendering callback from `app.js`. This lets it request a page render without importing `app.js` back and creating a circular dependency. Demo role and page state are grouped in the `session` object.

HTML still has inline handlers during this migration. `app.js` exposes only the named handlers needed by HTML through an explicit compatibility bridge; repository data and session state are not assigned to `window`. Future feature stages can replace inline attributes with event listeners. Views remain in `index.html`; a `pages/` split will be considered after feature boundaries are extracted so we avoid duplicating shared layouts.

Checks cover all prior workflows, independent repository instances, all role page routes and handler names, module URLs/content types, the legacy entry, and preview file restrictions. These simulated DOM/HTTP checks do not replace visual browser testing.

To try the extraction, refresh the preview, navigate all three roles, edit a tenant, review maintenance, and export a CSV. The interface should behave as before. Your learning exercise: trace `saveTenantChanges` in `app.js` into `updateTenant` in `repository.js`, then identify which fields the repository allows it to change.

## Stage 3: shops, tenant profiles, and tenancies

The previous runnable stage is preserved in commit `383fa49`. The demo now stores these separately:

| Record | Owns |
| --- | --- |
| Plaza | Plaza identity and its operational scope. |
| Unit | Stable unit ID, plaza ID, shop number, block, size, suggested rent. |
| Tenant | Stable tenant ID, plaza membership, name, business type, contacts, archive flag. |
| Tenancy | Stable agreement ID, tenant ID, unit ID, plaza ID, rent, dates, lifecycle, closure date/reason, and sample fees. |
| Payment / maintenance request | Tenancy, tenant, unit and plaza IDs, plus names/shop labels captured as record snapshots. |

One tenant can have several shop agreements. A shop can have only one active assignment. A passed lease-end date does not make it vacant: management must explicitly end occupancy. Closing a future-starting assignment marks it cancelled. These lifecycle actions free the shop immediately and retain the old agreement. There is no automatic future reservation scheduler or historical date-overlap engine in this stage.

The admin's Manage Shops dialog lists current and past agreements. Assign Another Shop uses an existing profile; Register New Tenant creates a profile plus its first agreement. Profile editing changes contacts and business information only. Edit Terms corrects an active agreement's rent/dates; ended/cancelled records are read-only. Effective-dated rent-change notices are a later MVP workflow, not the purpose of Edit Terms.

Archiving replaces deletion: it is allowed only after all active assignments have ended, and it retains the profile and payment history. The tenant directory includes archived/unassigned filters. The repository does not reuse old tenant, unit, or tenancy IDs during the demo session.

Occupancy, floor-map details, tenant shop lists and total annual rents use joined views of profile + tenancy + unit. A joined view assembles related fields for display without storing rent or a shop number back on the person. For example, tenant 6 can own tenancy 6 for D-09 and another tenancy for B-24. Ending the B-24 agreement does not remove D-09 or either agreement's records.

At the end of Stage 3, payment and maintenance forms selected an active matching shop agreement. Reports summed approved records per tenancy, preventing repeated collections across shops. Transfer evidence was pending and unallocated. Stage 4 below replaces that interim payment model with invoice allocations; maintenance still requires an active assignment.

The operational demo is scoped to Sunshine plaza (ID 1). Unit numbers can repeat in other plazas because IDs and plaza membership distinguish them. Repository scope and matching-ID checks are consistency checks only; a server must enforce actual authorization and tenant isolation. Other platform plaza listings remain sample account summaries rather than fully seeded operating plazas.

### Try multiple shops and history

1. Refresh the local preview and open Admin → Tenants → Funmi Boutique → Manage Shops.
2. Choose Assign Another Shop, select B-24, and enter positive rent and valid lease dates. Save. The directory and Tenant dashboard should list both D-09 and B-24.
3. Open Tenant → Maintenance and choose B-24 when submitting an issue. In Pay Fees, the shop selector chooses the relevant agreement. The entered transfer amount must be positive; no money is collected.
4. Back in Admin → Manage Shops, end B-24 with a reason. It should become vacant while D-09 stays assigned. B-24's ended agreement and any existing records remain visible in history.
5. End the tenant's remaining assignment to make Archive available. After archiving, find the profile with the Archived filter. A replacement occupant gets a new tenant/tenancy identity and does not inherit the previous occupant's receipts.

Run `npm.cmd test` for the complete regression suite. Tests cover duplicate occupancy, mismatched plazas, several shops for one tenant, closure/archiving, immutable ended terms, stale evidence forms, per-shop collection totals, and prior workflows. DOM/HTTP simulation is not visual browser QA.

At the end of Stage 3, persistent storage, real authorization, invoice balances, receipt documents, announcements and effective-dated notices remained incomplete. Stage 4 below implements the demo ledger. Profile archiving is not a production retention/restore policy. All demo changes still reset on refresh.

Learning exercise: compare `repository.getTenant(6)` with `repository.getTenancyRow(6)`. The first is the stored person; the second joins the person, agreement, and shop for display. Then trace `assignTenancy` to see why vacancy is checked before adding a new agreement.

## Stage 4: invoice periods, partial payments, and arrears

Stage 3 is preserved in commit `47451fb`. This stage changes the source of financial balances from a tenancy's `paid` flag to issued invoices and their approved allocations. It preserves existing sample payment references and amounts. The ten original sample obligations receive explicitly seeded calendar-year invoices; January 14 is a fixture due date, not a billing rule for new agreements. The old Ifeoma “overdue payment” row is retained internally as `legacy-obligation`, excluded from transaction displays/exports, and represented as an unpaid invoice. Funmi has an additional open 2026 sample invoice of ₦510,000 (₦480,000 rent + ₦24,000 service charge + ₦6,000 waste levy).

The relationship is `tenant → tenancy → invoice → payment allocation`. A tenancy describes the agreement; an invoice is one specific bill. Paying the 2025 invoice does not settle 2026. Issuing a new tenancy does not silently create a bill or assume an anniversary/calendar billing policy. Admin must explicitly enter an inclusive billing period, due date and charges. One invoice holds all charges for that period; overlapping periods on the same tenancy are rejected in this MVP.

Invoice amounts, dates, tenant name and shop label are snapshots. Profile edits, term corrections, occupancy closure, and archiving do not rewrite issued invoices or confirmed payments. Financial getters return copies, including invoice line items, so rendering cannot accidentally change stored amounts. Older nonfinancial repository lists still return live objects by convention.

`ledger.js` validates and computes money in integer kobo. For example, ₦0.10 + ₦0.20 becomes 10 + 20 kobo, avoiding floating-point remainders. Outstanding is invoiced amount minus approved allocations. Pending and rejected evidence contribute nothing to collected totals. An unpaid remainder becomes overdue the day after its due date; lease expiry remains a separate occupancy concept. Admin summaries, tenant balance, reports and CSV now use invoice allocations. The report shows the eight largest billed agreements, including ended agreements; charts combine approved payments across recorded years, as labelled.

### Try the workflow

1. Open the preview, switch to Tenant → Pay Fees, and select `INV-0011` for D-09. Its initial balance is ₦510,000. The older 2025 invoice is already settled.
2. Submit ₦100,000 using a made-up unique bank reference and a harmless sample file. Only its filename is retained; nothing uploads. The submission is pending and the balance remains ₦510,000. No receipt appears for it.
3. Switch to Plaza Admin → Payments. Review that submission and approve it. `INV-0011` should show approved ₦100,000 and outstanding ₦410,000. Repeating approval cannot count it twice. The tenant's approved demo records now include it.
4. Submit another sample with a different bank reference and reject it with a reason. The balance stays ₦410,000. Tenant → Pay Fees shows the rejection and reason in that invoice's history.
5. Use Record Payment to allocate an already-confirmed sample cash/transfer/cheque amount to a specific unpaid invoice. A partial amount reduces just that invoice. Anything above its remaining balance is rejected.
6. Use Issue Invoice to bill a new shop agreement, or a nonoverlapping period such as 2027 for D-09. Enter dates and rent; optionally add a service charge. The new bill appears in the admin list and tenant selector. Reissuing that period must fail without adding a duplicate.

Duplicate bank references are rejected case-insensitively within a plaza, even after rejection. A correction or allocation to the wrong invoice needs a future review/reallocation workflow; changing the reference is not a way to verify a duplicate transfer. Different pending submissions may together exceed a bill, but each approval rechecks the current remaining balance. If another approval/manual record consumed that balance, the later approval fails and remains pending for review.

### Decisions and remaining work

- One payment allocates to one invoice. Transfers covering multiple invoices, overpayments, credits, refunds and reallocations need explicit business rules and later workflows. The current UI rejects over-allocation rather than discarding excess money.
- No automatic invoice schedule, late penalties, grace periods, proration or rent increases are assumed. Effective-dated rent notices are still a later stage. An admin enters historical/catch-up periods explicitly, including for ended tenancies.
- Issued invoices and confirmed records cannot be edited through this UI. Void/correction/credit-note procedures need design before real use; this demo is not an accounting or tax document system.
- An ended or archived tenancy's existing debt can still be paid. Closing occupancy does not forgive arrears. New maintenance requests continue to require an active assignment.
- Provider/card/USSD mock choices are deferred; the current tenant workflow is manual bank-transfer evidence. Existing historical method labels remain sample records. Official receipt downloads/email are not implemented; View Record shows an honest demo record.
- All role/scope checks are presentation and consistency checks. Real authorization, tenant isolation, evidence validation/storage, durable data, atomic concurrent allocations and audit logs require a backend. Changes still reset on refresh.

Run `npm.cmd test`. The suite covers partial settlement, period separation, pending/rejected balances, duplicate references, repeated/competing approvals, kobo arithmetic, invalid dates and amounts, invoice overlap, immutable financial snapshots, old debt after closure, empty/unbilled agreements, scoped presentation, forms, CSV and module HTTP routes. These simulated DOM/HTTP checks do not establish browser layout quality or production security. Browser QA was paused at the user's request during this stage.

Learning exercise: follow `submitTransferEvidence` in `payments.js` into `ledger.addPayment`, then `reviewPayment`. Identify why recording pending evidence leaves `approvedKobo` unchanged, and why approval must check capacity again even after submission passed validation.

Stage 5 below adds receipt numbering and printable demo views. Secure document storage, official receipt issuance and notification delivery remain backend work.

## Stage 5: numbered and printable demo receipts

Stage 4 is preserved in commit `963471e`. Each confirmed manual payment or approved evidence allocation now receives one `DEMO-RCT-000001` style number. Receipt creation happens inside the ledger's confirmation operation; opening, rerendering or printing a view never issues another number. Repeated approval returns the same receipt. Pending, rejected, failed overpayments and stale approvals produce none.

Existing approved sample payments receive demo receipts when the repository starts, in payment-date order. Their issue date is the current demo initialization date, not a claimed historical issuance date. For imported samples, the remaining balance is reconstructed from approved sample payments in payment-date order. These are sample records only. Numbers are unique within the current repository session; refresh resets them. Persistent, concurrent numbering and real issuance require a server/database.

Receipt snapshots contain the plaza name, tenant and shop labels, invoice number/period/charges, payment reference, payment date/method, amount, issue date, and balance immediately after that allocation. Later profile/term edits, occupancy closure or payments cannot rewrite the snapshot. Receipt queries return copies, including nested charge items.

For example, approving ₦100,000 against `INV-0011` produces a receipt showing ₦510,000 invoiced, ₦100,000 received in that payment, and ₦410,000 remaining. A later ₦410,000 payment gets a separate receipt with zero remaining. Reopening the first receipt still shows ₦410,000. Use the invoice view for today's balance.

The shared `receipts.js` feature replaces the previous payment-record dialog. Tenant → My Receipts lists only that demo tenant's approved receipts. Admin → Payments has Receipt buttons for approved records, while retaining Invoice buttons. The same scoped view is used in both places; platform admin cannot use this operational receipt view. These frontend scope checks are not real authorization.

### Try viewing and printing

1. Refresh the local preview, then open Tenant → My Receipts → View Receipt for the original 2025 sample. Check the number, invoice, tenant, amount and prominent demo label.
2. Choose Print / Save as PDF. In Chrome's dialog, select a printer or Save as PDF. Only the receipt document should appear, with no sidebar, other tenants, modal controls or dashboard. Close/cancel the dialog and confirm the application remains usable.
3. Submit a small transfer-evidence sample against `INV-0011`. Before approval it must have no receipt. Approve in Admin → Payments, then open its Receipt button. Tenant → My Receipts should show the same number and details.
4. Record a second partial payment. The first receipt's balance must remain unchanged, while the invoice's current balance and the newer receipt reflect the additional allocation.
5. Reject another submission. It must remain in evidence history, with no receipt button or tenant receipt entry. Repeat an approval and reopen/print a receipt; no additional number should appear.

`printReceipt` rechecks the current role and ownership, renders the snapshot into a dedicated sibling of the app shell, enables a print-only CSS layout, and calls `window.print()`. A `finally` block clears the temporary document and class after the dialog returns, including errors. No pop-up, download dependency, email or server upload is involved. Save as PDF is a browser print option; there is no automatic PDF-generation endpoint. Print failures show an error and leave the receipt available for retry.

Run `npm.cmd test`. New tests cover seed numbering, confirmation-only issuance, partial-balance snapshots, repeated approval, failed allocation, immutable copies/lifecycle history, scoped opening and printing, print cleanup/error/retry, escaped user text, empty state, module delivery and print isolation rules. Native printing is simulated in the automated tests. Actual Chrome pagination, paper/PDF output and mobile appearance still need the manual checklist above; browser QA remains paused at the user's request.

All documents are marked DEMO / NOT OFFICIAL on screen and in print. Real bank verification, official receipt issuance, durable numbering, authorized document access and audit logs still require a backend. No signature, tax status or legal validity is implied. This stage adds no production backend or dependencies.

Learning exercise: trace `reviewPayment` → `issueReceipt` in `ledger.js`, then `openPaymentRecord` → `printReceipt` in `receipts.js`. The ledger creates the historical record once; the view only reads it. That separation prevents reprints from changing financial history.

Stage 6 below adds announcements with audience selection and tenant visibility. Actual email/SMS delivery remains backend work.

## Stage 6: management announcements and demo read state

Stage 5 is preserved in commit `552d80b`. The previous Bulk Reminder panel was a visual form: its button only displayed a fixed success toast and did not save the subject, body, audience or delivery channel. This stage replaces it with a working in-memory announcement workflow in Admin → Notifications. The original operational alerts and tenant activity examples remain in clearly labelled static sample sections; they do not count toward unread announcements.

An admin can publish plain-text subjects (1–120 characters) and messages (1–3,000) to all current tenants or selected tenants. A current tenant means a nonarchived profile with an assignment whose lifecycle is `active` in this plaza. Expired lease dates alone do not end occupancy, consistent with Stage 3; a future-starting assignment also remains assigned until explicitly cancelled. One person occupying several shops receives one notice, with all their assigned shop labels in the publication's recipient snapshot. Archived or unassigned profiles do not receive new announcements; contacting former tenants about old debt needs a later audience policy.

Publication resolves and saves recipient IDs, names and shop labels at that moment. Later renaming, archiving, closure, reassignment or registering a new occupant cannot rewrite the original audience. Old recipients can still see their historical notices in this demo. New tenants do not inherit earlier broadcasts. Published text and audience cannot be edited or deleted through this UI; an important correction should be a new notice. Scheduling, withdrawal, drafts, attachments, search and automatic overdue/expiry audiences are deferred.

The admin history shows the saved text, publication time, original recipients and how many have clicked Mark as Read. Tenant → Notifications shows only announcements addressed to demo tenant 6. Its query returns notice text and that tenant's read state, without other recipients' names, IDs or read data. Repeated Mark as Read clicks retain the first timestamp. The header bell's dot reflects unread management announcements for the current demo tenant; the old hard-coded notification counts are removed. Reading one notice does not acknowledge another.

### Try announcements

1. Refresh the preview and open Admin → Notifications. The published list starts empty. Write a subject such as “Planned water supply maintenance” and explain the time, affected shops and contact person. Choose All Current Tenants and check the recipient count before publishing.
2. Publish the demo announcement. The form clears only after success, and the history retains your actual text. Expand Recipient List at Publication to check names and shops. No email or SMS is sent.
3. Switch to Tenant. The bell should show an unread dot. Open Notifications to see the notice, then choose Mark as Read. Its unread count and bell dot should update. Switch back to Admin to see the read count change.
4. Publish another notice with Selected Tenants. Choose Grace Pharmacy without choosing Funmi Boutique. It should appear in admin history but not in the Funmi tenant portal. A selected audience with no checked tenants must fail and retain the draft text.
5. Publish a notice to Funmi, then rename the profile or end its shop assignment. The original publication recipient label and historical notice should remain. A newly registered replacement tenant must not inherit it.
6. Submit blank/whitespace or oversized content and confirm no record is added. Try ordinary text containing `<script>` or `<img>`; it must display literally rather than execute. Republishing after a successful form reset must fail until a new subject/body is entered.

Data flow: `announcement-form` invokes the feature's `publishAnnouncement`; it reads input and selection values, then calls the repository. `createAnnouncementStore` validates all details and resolves eligible recipients before adding a record, so one invalid recipient cannot produce a partial publication. The feature renders the resulting history with escaped text, preserving line breaks with CSS. Repository queries return copies to protect stored snapshots. Read updates change only the recipient's separate read state.

The announcement store is a small module composed into `repository.js`, following the same pattern as the ledger. The feature module owns presentation and role guards; it does not modify tenancy terms or invoice data. Ordinary announcements are not effective-dated rent adjustments and have no effect on rent, due dates, invoices, payments or receipts.

Run `npm.cmd test`. New tests cover both audiences, duplicate recipients across shops, empty/archived/unassigned audiences, invalid text/IDs, plazas with identical shop numbers, private tenant views, idempotent reads, immutable snapshots, replacement occupants, unchanged financial records, form reset/errors, role presentation, escaping, navigation/indicators, native form labels and module HTTP routes. These DOM/HTTP simulations do not verify Chrome/mobile layout or real security. Browser QA remains paused.

Publication and read status are local browser demonstrations and reset on refresh. Marked Read records an explicit click; it does not prove delivery, understanding, consent or legal acknowledgement. No email/SMS connector is called. A production implementation needs authenticated plaza membership, server-enforced recipient isolation, durable publications and audit history, authorized access to old notices, delivery jobs/status and appropriate retention rules.

Learning exercise: follow `publishAnnouncement` from `js/features/announcements.js` into `js/data/announcements.js`. Compare the admin query with `listTenantAnnouncements`: the latter deliberately omits other recipients. Then identify why resolving the audience only when reading would let a replacement occupant see an old notice.

Stage 7 below adds effective-dated rent-adjustment notices and explicit application rules. Automatic rent changes remain deferred.

## Stage 7: effective-dated rent adjustment notices

Stage 6 is preserved in commit `b3e9398`. Management can now record a future increase or decrease in annual rent for one shop agreement. The notice captures the tenant/shop labels, original agreement dates, old rent, new rent, explanation, publication date, effective date, actual calendar advance days and an explicitly entered minimum advance requirement. It does not automatically create an invoice, alter fees or renew a lease.

This is a demo policy workflow, not an implementation of any Nigerian legal notice period. The form has no default minimum: the admin must enter 1–3,650 whole calendar days. The effective date must be later than the local publication date, on/after the agreement start, and meet the entered minimum. The reason is required (up to 1,000 characters). New rent must be positive, differ from current rent, and have at most two decimal places. Both increases and decreases are supported. Whether a real adjustment is permitted and sufficiently notified needs the actual agreement and production business rules before real use.

Only an active assignment for a nonarchived tenant in the operational plaza can receive a new notice. Lifecycle `active` still means assigned until explicitly ended, even if its recorded lease-end date has passed. A notice after that date does not itself extend or validate the lease. There can be only one open notice per agreement. To correct an open notice, cancel it with a reason and publish a replacement; both records remain visible to the original tenant.

Publication leaves `tenancy.rent` unchanged. Once the effective date arrives, the notice becomes Ready for Management Application. Admin must explicitly apply it. Application rechecks that the original assignment remains active and its rent/start/end dates still match the published snapshot; stale notices are blocked. Direct term corrections therefore require cancelling and republishing the open notice. Renaming a profile does not block application or change its historical label. Closing/reassigning a shop cannot transfer the old tenant's rent notice to a replacement occupant.

Applying updates that agreement's current annual rent exactly once and records the action time. Repeated application returns the existing result; replaying an earlier notice cannot undo a later change. Already-applied changes cannot be cancelled through this UI; a later adjustment needs a new future notice. There is no automatic scheduler, retroactive allocation, proration, penalty, refund or invoice-correction policy. Applying late updates the current agreement when management acts; the notice's effective date and actual application timestamp are retained separately.

Already-issued invoices, payment allocations and receipt snapshots are unchanged by publication, application or cancellation. New invoices still require explicit amounts and periods in the existing Issue Invoice workflow; the app does not infer how to split a period around a rent change. If an issued future bill overlaps the effective date, it remains intact and requires a separately designed correction/credit workflow before production use.

### Try rent notices

1. Open Admin → Notifications → Issue Rent Notice, or Admin → Tenants → Funmi Boutique → Manage Shops → Issue Rent Notice for D-09.
2. Enter a new annual rent such as ₦500,000, a future date at least 30 calendar days away, minimum advance days `30`, and a sample explanation. Publish. These example days are only a demo input, not a recommended real notice period.
3. Open the notice. It should retain the old ₦480,000 and show Scheduled, with Apply New Rent Now disabled before its date. Current agreement rent and the ₦510,000 sample invoice should remain unchanged.
4. Switch to Tenant → Notifications. Only notices for demo tenant 6 should appear. View the explanation, old/new amounts, dates and status, then mark it read. Marking read is not tenant acceptance or proof of valid delivery.
5. Back in Admin, cancel the notice with a reason. The cancelled history should remain in the tenant portal and its changed status should be unread again. Rent remains unchanged. You can now issue a corrected replacement.
6. For a retained open notice, correct its agreement's rent or dates, or end the assignment. Use Refresh Statuses in the notice section: application should be Blocked. The original snapshot should remain unchanged.

To exercise due-date application manually, keep the same page session until the effective date and use the in-app Refresh Statuses button or navigate away/back. Reloading the browser erases demo records. Automated tests inject a controlled date so the day before, the effective day and later changes are tested immediately without altering your computer clock. Production scheduling and durable state need a backend.

The shared notification dot now includes unread announcements and rent notices. Each rent notice retains its publication-read timestamp. Applying or cancelling records a separate status update, which starts unread; marking that status read does not erase the earlier read timestamp. Notice views and actions enforce the demo role/plaza/recipient presentation rules, while the data store validates assignment consistency. These frontend checks cannot secure production tenancy data or enforce contractual authorization.

Run `npm.cmd test`. New tests cover early/due application, repeated and later changes, increases/decreases and kobo amounts, invalid/insufficient advance dates, leap-day counting, conflicting notices, cancellation, stale terms, closure/replacement occupants, future assignment starts, scoped read state, immutable snapshots, unchanged invoices/payments/receipts, UI forms/validation/escaping, refreshed annual rent displays and module delivery. Browser layout testing remains paused; these are domain, simulated-DOM and HTTP checks.

Learning exercise: trace `publishRentAdjustment` and `applyRentAdjustment` in the data store. The former captures a proposed future change; the latter revalidates the current agreement before changing it. Then compare the notice's `oldRent` snapshot with today's `tenancy.rent` and the independent invoice amounts. This separation keeps historical bills stable while the agreement evolves.

Still incomplete: durable notices and read/application history, real login and server-enforced authorization, delivery channels, contract-specific adjustment policies, correction/credit workflows, automatic billing, backups and audit logs. All notices remain explicitly demo records and reset on refresh. No backend or dependency was introduced.

Recommended next stage: a document directory with explicit demo access rules, followed by a backend design review before persistent accounts, payments or sensitive document storage.
