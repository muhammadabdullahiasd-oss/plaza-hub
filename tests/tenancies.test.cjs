const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadApp } = require('./helpers/load-app.cjs');
const terms = { rent:800000, start:'2026-01-01', expires:'2027-01-01' };
async function fresh() {
  const { createRepository } = await import('../js/data/repository.js');
  return createRepository();
}

test('fixtures store profiles, units, and tenancy terms separately', async () => {
  const repo = await fresh();
  const profile = repo.getTenant(6);
  assert.equal(profile.shop, undefined);
  assert.equal(profile.rent, undefined);
  assert.equal(profile.paid, undefined);
  assert.equal(repo.getTenancy(6).tenantId, 6);
  assert.equal(repo.getTenancyRow(6).shop, 'D-09');
  assert.equal(new Set(repo.listUnits().map(unit => unit.id)).size, 49);
  assert.equal(repo.listTenancies().length, 12);
});

test('one tenant can occupy multiple shops without duplicating their profile', async () => {
  const repo = await fresh();
  const extra = repo.assignTenancy({ tenantId:6, unitId:2, plazaId:1, ...terms });
  assert.equal(repo.listTenants().length, 12);
  assert.equal(repo.listActiveTenancies(6).length, 2);
  assert.equal(repo.listOccupancies().length, 13);
  assert.equal(repo.getTenancyRow(extra.id).shop, 'A-02');
  assert.equal(repo.listPlazas()[0].tenants, 12);
});

test('a shop rejects a second active assignment even for the same tenant', async () => {
  const repo = await fresh();
  const before = JSON.stringify(repo.listTenancies());
  for (const tenantId of [6, 7]) assert.throws(() => repo.assignTenancy({ tenantId, unitId:49, plazaId:1, ...terms }), /occupied/);
  assert.equal(JSON.stringify(repo.listTenancies()), before);
});

test('plaza IDs distinguish identical shop numbers and reject mismatched assignments', async () => {
  const { createDemoData } = await import('../js/data/demo-data.js');
  const { createRepository } = await import('../js/data/repository.js');
  const data = createDemoData();
  data.tenants.push({ id:50, plazaId:2, name:'Other plaza tenant', business:'Retail', archived:false });
  data.units.push({ id:500, plazaId:2, number:'A-02', block:'A', size:30, suggestedRent:200000 });
  const repo = createRepository(data);
  assert.throws(() => repo.assignTenancy({ tenantId:6, unitId:500, plazaId:1, ...terms }), /this plaza/);
  assert.throws(() => repo.assignTenancy({ tenantId:50, unitId:2, plazaId:1, ...terms }), /this plaza/);
  repo.assignTenancy({ tenantId:50, unitId:500, plazaId:2, ...terms });
  assert.equal(repo.listUnits().some(unit => unit.id === 500), false);
  assert.equal(repo.listOccupancies(2).length, 1);
  assert.equal(repo.listOccupancies().length, 12);
});

test('invalid terms do not create a partial tenant or assignment', async () => {
  const repo = await fresh();
  for (const invalid of [{ rent:0 }, { rent:Infinity }, { start:'2026-02-30' }, { expires:'2025-01-01' }]) {
    assert.throws(() => repo.addTenant({ name:'New tenant', business:'Retail', shop:'A-02', ...terms, ...invalid }), /positive rent/);
    assert.equal(repo.listTenants().length, 12);
    assert.equal(repo.listTenancies().length, 12);
  }
});

test('expiry does not release a shop; explicit closure retains its terms and records', async () => {
  const repo = await fresh();
  const payments = JSON.stringify(repo.listPayments());
  const requests = JSON.stringify(repo.listMaintenanceRequests());
  assert.equal(repo.getTenancy(6).status, 'active');
  const before = { ...repo.getTenancy(6) };
  assert.throws(() => repo.endTenancy(6, '  '), /reason/);
  repo.endTenancy(6, 'Moved to a larger shop');
  assert.equal(repo.getTenancy(6).status, 'ended');
  assert.equal(repo.getTenancy(6).rent, before.rent);
  assert.equal(repo.getTenancy(6).expires, before.expires);
  assert.equal(repo.listActiveTenancies(6).length, 0);
  assert.equal(repo.listUnits().some(unit => unit.id === 49), true);
  assert.equal(JSON.stringify(repo.listPayments()), payments);
  assert.equal(JSON.stringify(repo.listMaintenanceRequests()), requests);
  assert.throws(() => repo.updateTenancy(6, { rent:1 }), /active shop/);
});

test('archiving requires no occupied shops and keeps profile and history', async () => {
  const repo = await fresh();
  assert.throws(() => repo.removeTenant(6), /End all active/);
  repo.endTenancy(6, 'Vacated');
  repo.removeTenant(6);
  assert.equal(repo.getTenant(6).archived, true);
  assert.equal(repo.listTenancies(6).length, 1);
  assert.equal(repo.getTenantApprovedAmount(6), 480000);
  assert.throws(() => repo.assignTenancy({ tenantId:6, unitId:49, plazaId:1, ...terms }), /active tenant/);
  assert.throws(() => repo.updateTenant(6, { name:'Changed' }), /read-only/);
});

test('reoccupying the same shop creates a new tenancy without inheriting collections', async () => {
  const repo = await fresh();
  repo.endTenancy(6, 'Old agreement ended');
  const renewed = repo.assignTenancy({ tenantId:6, unitId:49, plazaId:1, ...terms });
  assert.notEqual(renewed.id, 6);
  assert.equal(repo.getTenancyApprovedAmount(renewed.id), 0);
  assert.equal(repo.getTenancyApprovedAmount(6), 480000);
  assert.equal(repo.listTenancies(6).length, 2);
});

test('profile edits and corrections of active terms preserve payment snapshots', async () => {
  const repo = await fresh();
  const payments = JSON.stringify(repo.listPayments());
  repo.updateTenant(6, { name:'Renamed', rent:1, paid:false });
  assert.equal(repo.getTenancy(6).rent, 480000);
  repo.updateTenancy(6, { rent:500000 });
  assert.equal(repo.getInvoiceSummary(1).balance, 0);
  assert.equal(JSON.stringify(repo.listPayments()), payments);
  assert.throws(() => repo.updateTenancy(6, { unitId:2 }), /End the existing/);
});

test('payments bind to invoices while new maintenance requires an active tenancy', async () => {
  const repo = await fresh();
  const extra = repo.assignTenancy({ tenantId:6, unitId:2, plazaId:1, ...terms });
  const invoice = repo.createInvoice({ tenancyId:extra.id, periodStart:'2026-01-01', periodEnd:'2026-12-31', dueDate:'2026-01-14', items:[{ description:'Rent', amount:800000 }] });
  const payment = repo.addPayment({ ref:'NEW', invoiceId:invoice.id, tenancyId:extra.id, amount:100000, date:'2026-11-02', status:'paid' });
  const request = repo.addMaintenanceRequest({ id:'MR-NEW', tenancyId:extra.id, subject:'Repair' });
  assert.equal(payment.unit, 'A-02');
  assert.equal(payment.tenantId, 6);
  assert.equal(request.unitId, 2);
  assert.equal(repo.getTenancyApprovedAmount(extra.id), 100000);
  assert.equal(repo.getTenancyApprovedAmount(6), 480000);
  assert.throws(() => repo.addPayment({ ref:'SPOOF', invoiceId:invoice.id, tenancyId:extra.id, tenantId:7, amount:1 }), /does not match/);
  repo.endTenancy(extra.id, 'Closed');
  assert.equal(repo.addPayment({ ref:'ENDED', invoiceId:invoice.id, amount:1, date:'2026-11-02', status:'paid' }).invoiceId, invoice.id);
  assert.throws(() => repo.addMaintenanceRequest({ id:'ENDED', tenancyId:extra.id }), /active shop/);
});

test('future-starting assignments are cancelled when closed before they start', async () => {
  const repo = await fresh();
  const future = repo.assignTenancy({ tenantId:6, unitId:2, plazaId:1, rent:100, start:'2099-01-01', expires:'2100-01-01' });
  repo.endTenancy(future.id, 'Plans changed');
  assert.equal(future.status, 'cancelled');
  assert.equal(repo.listActiveTenancies(6).length, 1);
});

async function browserDemo() {
  const nodes = new Map();
  const node = () => ({ value:'', innerHTML:'', textContent:'', style:{}, classList:{ add() {}, remove() {}, toggle() {} }, appendChild() {}, reset() {} });
  const element = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  const context = vm.createContext({ document:{ getElementById:element, querySelectorAll:() => [], createElement:node }, window:{ innerWidth:1024, addEventListener() {} }, setTimeout() {} });
  const run = code => vm.runInContext(code, context);
  const { repository, actions, session } = await loadApp(context);
  run("session.role = 'admin'; openModal = (title, body, footer) => {globalThis.modal = {title, body, footer};}; showToast = (message, type) => {globalThis.toast = {message, type};};");
  return { element, run, repository, actions, session };
}

test('UI can assign another shop, display it, and end just that assignment', async () => {
  const { element, repository, actions, run } = await browserDemo();
  for (const [key, value] of Object.entries({ tenant:'6', unit:'2', rent:'800000', start:'2026-01-01', end:'2027-01-01' })) element(`assignment-${key}`).value = value;
  actions.saveAssignment();
  const extra = repository.listActiveTenancies(6).find(t => t.unitId === 2);
  assert.ok(extra);
  assert.match(run('modal.body'), /A-02/);
  assert.match(element('tenant-shop-summary').textContent, /D-09, A-02/);
  assert.equal(element('tenant-rent-total').textContent, '₦1,280,000');
  element('tenancy-end-reason').value = '<img src=x> Moved out';
  actions.endTenancy(extra.id);
  assert.equal(repository.listActiveTenancies(6).length, 1);
  assert.doesNotMatch(element('tenant-shop-summary').textContent, /A-02/);
  assert.match(run('modal.body'), /&lt;img/);
  assert.doesNotMatch(run('modal.body'), /<img/);
  assert.match(element('tenant-lease-details').innerHTML, /A-02/);
  assert.equal(actions.calculateOperationalSummary().occupied, 12);
});

test('maintenance selection rejects other tenants and records the correct shop', async () => {
  const { repository, element, actions, session } = await browserDemo();
  const extra = repository.assignTenancy({ tenantId:6, unitId:2, plazaId:1, ...terms });
  session.role = 'tenant';
  for (const [key, value] of Object.entries({ category:'Electrical', priority:'High', subject:'Broken light', description:'Entrance light fails', tenancy:'7' })) element(`maintenance-${key}`).value = value;
  actions.submitMaintenanceRequest();
  assert.equal(repository.listMaintenanceRequests().length, 3);
  element('maintenance-tenancy').value = String(extra.id);
  actions.submitMaintenanceRequest();
  assert.equal(repository.listMaintenanceRequests()[0].tenancyId, extra.id);
  assert.equal(repository.listMaintenanceRequests()[0].unit, 'A-02');
});

test('stale evidence never silently moves to another shop after closure', async () => {
  const { repository, actions, element, session } = await browserDemo();
  const extra = repository.assignTenancy({ tenantId:6, unitId:2, plazaId:1, ...terms });
  session.role = 'tenant';
  actions.selectTenantTenancy(extra.id);
  element('transfer-reference').value = 'BANK-TEST';
  element('transfer-amount').value = '100000';
  element('transfer-evidence').files = [{ name:'proof.pdf' }];
  repository.endTenancy(extra.id, 'Closed while filling form');
  actions.submitTransferEvidence();
  assert.equal(repository.listPayments().length, 10);
  actions.selectTenantTenancy(6);
  actions.submitTransferEvidence();
  assert.equal(repository.listPayments()[0].tenancyId, 6);
  assert.equal(repository.listPayments()[0].status, 'pending');
  assert.equal(repository.listPayments()[0].invoiceId, 11);
  assert.equal(repository.listPayments()[0].period, '2026-01-01 – 2026-12-31');
});

test('per-shop reports do not repeat a tenant total across multiple shops', async () => {
  const { repository, actions } = await browserDemo();
  const extra = repository.assignTenancy({ tenantId:6, unitId:2, plazaId:1, ...terms });
  const invoice = repository.createInvoice({ tenancyId:extra.id, periodStart:'2026-01-01', periodEnd:'2026-12-31', dueDate:'2026-01-14', items:[{ description:'Rent', amount:800000 }] });
  repository.addPayment({ ref:'SHOP-TWO', invoiceId:invoice.id, tenancyId:extra.id, amount:100000, date:'2026-11-02', status:'paid' });
  const rows = actions.getUnitReportRows();
  assert.equal(rows.find(row => row.tenant.tenancyId === 6).collected, 480000);
  assert.equal(rows.find(row => row.tenant.tenancyId === extra.id).collected, 100000);
});

test('tenancy actions only mutate from the demo admin presentation', async () => {
  const { repository, actions, session, element } = await browserDemo();
  session.role = 'tenant';
  element('tenancy-end-reason').value = 'Unauthorized';
  actions.endTenancy(6);
  actions.saveAssignment();
  assert.equal(repository.getTenancy(6).status, 'active');
  assert.equal(repository.listTenancies().length, 12);
});
