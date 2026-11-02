const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp } = require('./helpers/load-app.cjs');

async function createDemo() {
  const elements = new Map();
  const state = { clicks:0, removed:0, revoked:[] };
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value:'', innerHTML:'', style:{} });
    return elements.get(id);
  };
  const context = vm.createContext({
    document:{ getElementById:element, querySelectorAll:() => [], body:{ appendChild(link) { state.link = link; } }, createElement() { return { click() { state.clicks++; }, remove() { state.removed++; } }; } },
    window:{ innerWidth:1024, addEventListener() {} },
    Blob,
    URL:{ createObjectURL(blob) { state.blob = blob; return 'blob:demo'; }, revokeObjectURL(url) { state.revoked.push(url); } },
    setTimeout(callback) { state.cleanup = callback; },
  });
  const run = code => vm.runInContext(code, context);
  await loadApp(context);
  run("showToast = () => {}; session.role = 'admin';");
  return { run, element, state };
}

test('CSV preserves commas, quotes, line breaks, Unicode, and numeric amounts', async () => {
  const { run } = await createDemo();
  const rows = [['Tenant', 'Amount'], ['Ada, "A"\nShop ₦', 360000]];
  assert.equal(run(`buildCsv(${JSON.stringify(rows)})`), '\uFEFF"Tenant","Amount"\r\n"Ada, ""A""\nShop ₦","360000"');
});

test('spreadsheet formulas are neutralized in text but numbers stay numeric', async () => {
  const { run } = await createDemo();
  for (const value of ['=1+1', '+SUM(A1)', '-1+1', '@SUM(A1)', '  =1+1', '\ttext', '\ntext']) {
    assert.match(run(`buildCsv([[${JSON.stringify(value)}]])`), /^\uFEFF"'/);
  }
  assert.equal(run('buildCsv([[-100]])'), '\uFEFF"-100"');
});

test('exports enforce the demo role and preserve payment statuses', async () => {
  const { run } = await createDemo();
  assert.equal(run("getExportData('payments').rows.length"), run('PAYMENTS.length + 1'));
  assert.equal(run("getExportData('tenants').rows.length"), run('TENANTS.length + 1'));
  assert.match(run("buildCsv(getExportData('payments').rows)"), /"pending"/);
  assert.equal(run("getExportData('subscriptions')"), null);
  run("session.role = 'tenant';");
  for (const kind of ['tenants', 'payments', 'subscriptions', 'report']) {
    assert.equal(run(`getExportData('${kind}')`), null);
  }
  run("session.role = 'super';");
  assert.equal(run("getExportData('subscriptions').rows.length"), run('SUB_PAYMENTS.length + 1'));
  assert.equal(run("getExportData('payments')"), null);
});

test('report export matches the displayed rows and excludes unapproved amounts', async () => {
  const { run, element } = await createDemo();
  run('renderReports();');
  const rows = JSON.parse(run("JSON.stringify(getExportData('report').rows)"));
  assert.equal(rows.length, 9);
  assert.equal((element('reports-top-units').innerHTML.match(/<tr>/g) || []).length, 8);
  assert.match(element('reports-top-units').innerHTML, new RegExp(rows[1][1]));
  const before = run("JSON.stringify(getExportData('report').rows)");
  run("repository.addPayment({ref:'PENDING-TEST', tenancyId:10, amount:99999999, status:'pending'});");
  assert.equal(run("JSON.stringify(getExportData('report').rows)"), before);
});

test('download creates a CSV blob, clicks a dated filename, and releases its URL', async () => {
  const { run, state } = await createDemo();
  run("exportCsv('payments');");
  assert.equal(state.clicks, 1);
  assert.equal(state.removed, 1);
  assert.equal(state.link.href, 'blob:demo');
  assert.match(state.link.download, /^plazahub-demo-all-payment-records-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.match(state.blob.type, /text\/csv/);
  assert.match(await state.blob.text(), /"Reference","Tenant"/);
  state.cleanup();
  assert.deepEqual(state.revoked, ['blob:demo']);
});
