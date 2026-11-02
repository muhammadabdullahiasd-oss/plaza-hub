const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp } = require('./helpers/load-app.cjs');

async function createDemo() {
  const elements = new Map();
  const node = () => ({ value:'', innerHTML:'', textContent:'', style:{}, classList:{ add() {}, remove() {}, toggle() {} }, appendChild() {} });
  const element = id => {
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id);
  };
  const context = vm.createContext({ document:{ getElementById:element, querySelectorAll:() => [], createElement:node }, window:{ innerWidth:1024, addEventListener() {} }, setTimeout() {} });
  const run = code => vm.runInContext(code, context);
  await loadApp(context);
  run("session.role = 'admin'; showToast = (message, type) => {globalThis.toast = {message, type};}; closeModalDirect = () => {}; openModal = (title, body) => {globalThis.modal = body;};");
  const fill = (prefix = 'nt', overrides = {}) => {
    const values = { name:'Test Shop', biz:'Retail', unit:'A-02', rent:'150000', start:'2026-01-01', end:'2027-01-01', email:'shop@example.com', phone:'+234 801 234 5678', ...overrides };
    for (const [key, value] of Object.entries(values)) element(`${prefix}-${key}`).value = value;
  };
  const editDemo = (overrides = {}) => {
    const tenant = JSON.parse(run('JSON.stringify(TENANTS.find(t => t.id === 6))'));
    fill('et', { name:tenant.name, biz:tenant.business, unit:tenant.shop, rent:String(tenant.rent), start:tenant.start, end:tenant.expires, ...overrides });
    run('saveTenantChanges(6);');
  };
  return { run, element, fill, editDemo };
}

test('tenant creation saves contacts and exposes them in table and edit form', async () => {
  const { run, element, fill } = await createDemo();
  fill();
  run('saveTenant();');
  assert.equal(run('TENANTS.at(-1).email'), 'shop@example.com');
  assert.equal(run('TENANTS.at(-1).phone'), '+2348012345678');
  assert.match(element('tenants-tbody').innerHTML, /shop@example.com/);
  run('openEditTenant(TENANTS.at(-1).id);');
  assert.match(run('modal'), /shop@example.com/);
  assert.match(run('modal'), /\+2348012345678/);
});

test('profile edits preserve invoice balances, identity, and optional unrelated fields', async () => {
  const { run, editDemo } = await createDemo();
  run("TENANTS.find(t => t.id === 6).customNote = 'Preserve me';");
  editDemo({ name:'Renamed Boutique' });
  assert.equal(run('repository.getInvoiceSummary(1).balance'), 0);
  assert.equal(run('TENANTS.find(t => t.id === 6).customNote'), 'Preserve me');
  assert.equal(run('TENANTS.find(t => t.id === 6).email'), 'shop@example.com');
});

test('renaming keeps payment totals, receipt ownership, and record snapshots', async () => {
  const { run, editDemo, element } = await createDemo();
  const before = run('getTenantApprovedAmount(6)');
  assert.equal(before, 480000);
  const history = run('JSON.stringify(PAYMENTS)');
  editDemo({ name:'Renamed Boutique' });
  assert.equal(run('getTenantApprovedAmount(6)'), before);
  assert.equal(run('JSON.stringify(PAYMENTS)'), history);
  run('renderTenantDashboard(); renderReceipts();');
  assert.match(element('tenant-receipts-list').innerHTML, /TXN-2025-0841/);
  assert.equal(element('tenant-welcome-name').textContent, 'Renamed Boutique 👋');
  assert.equal(run('getUnitReportRows().find(row => row.tenant.id === 6).collected'), 480000);
});

test('matching names never grant another tenant payment or maintenance ownership', async () => {
  const { run, element } = await createDemo();
  run("TENANTS.find(t => t.id === 7).name = 'Funmi Boutique'; const otherInvoice = repository.createInvoice({tenancyId:7,periodStart:'2026-01-01',periodEnd:'2026-12-31',dueDate:'2026-01-14',items:[{description:'Rent',amount:999}]}); repository.addPayment({invoiceId:otherInvoice.id, ref:'OTHER-TENANT', amount:999, date:'2026-11-02', status:'paid'}); repository.addMaintenanceRequest({id:'MR-099', tenancyId:7, subject:'Private', category:'Other', priority:'Low', date:'Today', status:'pending'}); renderReceipts(); renderMaintenance();");
  assert.equal(run('getTenantApprovedAmount(6)'), 480000);
  assert.doesNotMatch(element('tenant-receipts-list').innerHTML, /OTHER-TENANT/);
  assert.doesNotMatch(element('maintenance-list').innerHTML, /MR-099/);
});

test('new IDs remain finite and do not reuse a removed tenant identity', async () => {
  const { run, fill } = await createDemo();
  run("TENANCIES.forEach(t => repository.endTenancy(t.id, 'Vacated')); TENANTS.forEach(t => repository.removeTenant(t.id));");
  fill();
  run('saveTenant();');
  assert.equal(run('Number.isSafeInteger(TENANTS.at(-1).id)'), true);
  assert.ok(run('TENANTS.at(-1).id') > 12);
  assert.equal(run('getTenantApprovedAmount(TENANTS.at(-1).id)'), 0);
});

test('unknown and occupied units reject without changing the tenant list', async () => {
  const { run, fill } = await createDemo();
  for (const unit of ['Z-99', 'A-01']) {
    fill('nt', { unit });
    run('saveTenant();');
    assert.equal(run('TENANTS.length'), 12);
    assert.equal(run('toast.type'), 'error');
  }
});

test('profile edits cannot move an assignment through a stale unit input', async () => {
  const { run, editDemo } = await createDemo();
  editDemo({ unit:'A-02' });
  assert.equal(run('repository.getTenancyRow(6).shop'), 'D-09');
});

test('invalid contact fields and dates reject without mutation', async () => {
  const { run, fill } = await createDemo();
  for (const invalid of [{email:'not-email'}, {phone:'letters'}, {start:'2026-02-30'}, {end:'invalid'}, {end:'2025-01-01'}]) {
    fill('nt', invalid);
    run('saveTenant();');
    assert.equal(run('TENANTS.length'), 12);
    assert.equal(run('toast.type'), 'error');
  }
  fill('nt', { email:'', phone:'' });
  run('saveTenant();');
  assert.equal(run('TENANTS.length'), 13);
});

test('vacant-unit assignment preselects the unit the user clicked', async () => {
  const { run } = await createDemo();
  run("openAddTenant('B-24');");
  assert.match(run('modal'), /<option selected>B-24<\/option>/);
});

test('new manual payments and transfer evidence use stable tenant IDs', async () => {
  const { run, element, editDemo } = await createDemo();
  editDemo({ name:'Renamed Boutique' });
  for (const [key, value] of Object.entries({ invoice:'11', amount:'10000', method:'Cash', date:'2026-11-01' })) element(`manual-payment-${key}`).value = value;
  run('saveManualPayment();');
  assert.equal(run('PAYMENTS[0].tenantId'), 6);
  assert.equal(run('getTenantApprovedAmount(6)'), 490000);
  element('transfer-reference').value = 'BANK-001';
  element('transfer-amount').value = '100000';
  element('transfer-evidence').files = [{ name:'proof.pdf' }];
  run("session.role = 'tenant'; submitTransferEvidence();");
  assert.equal(run('PAYMENTS[0].tenantId'), 6);
  assert.equal(run('PAYMENTS[0].tenant'), 'Funmi Boutique'); // Issued invoice name snapshot.
  assert.equal(run('PAYMENTS[0].status'), 'pending');
  assert.equal(run('getTenantApprovedAmount(6)'), 490000);
});

test('seed payment identities preserve the original tenant and unit links', async () => {
  const { run } = await createDemo();
  assert.equal(run('PAYMENTS.every(payment => { const row = repository.getTenancyRow(payment.tenancyId); return row.tenantId === payment.tenantId && row.name === payment.tenant && row.shop === payment.unit; })'), true);
});

test('maintenance submission still works after the tenant is renamed', async () => {
  const { run, editDemo, element } = await createDemo();
  editDemo({ name:'New Boutique Name' });
  element('maintenance-category').value = 'Electrical';
  element('maintenance-tenancy').value = '6';
  element('maintenance-priority').value = 'High';
  element('maintenance-subject').value = 'Broken light';
  element('maintenance-description').value = 'The entrance light does not turn on.';
  element('maintenance-form').reset = () => {};
  run("session.role = 'tenant'; submitMaintenanceRequest(); renderMaintenance();");
  assert.equal(run('MAINTENANCE_REQUESTS[0].tenantId'), 6);
  assert.equal(run('MAINTENANCE_REQUESTS[0].tenant'), 'New Boutique Name');
  assert.match(element('maintenance-list').innerHTML, /Broken light/);
  assert.match(element('maintenance-list').innerHTML, /MR-004/);
});

test('removing and replacing a tenant frees the unit without transferring history', async () => {
  const { run, fill, element } = await createDemo();
  const history = run('JSON.stringify(PAYMENTS)');
  run("repository.endTenancy(6, 'Moved out'); removeTenant(6);");
  assert.equal(run("getAvailableUnits().includes('D-09')"), true);
  fill('nt', { name:'Funmi Boutique', unit:'D-09' });
  run('saveTenant();');
  const replacementId = run('TENANTS.at(-1).id');
  assert.notEqual(replacementId, 6);
  assert.equal(run(`getTenantApprovedAmount(${replacementId})`), 0);
  assert.equal(run('JSON.stringify(PAYMENTS)'), history);
  element('transfer-reference').value = 'NEW-REFERENCE';
  element('transfer-evidence').files = [{ name:'receipt.pdf' }];
  run("session.role = 'tenant'; submitTransferEvidence();");
  assert.equal(run('JSON.stringify(PAYMENTS)'), history);
  assert.equal(run('toast.type'), 'error');
});
