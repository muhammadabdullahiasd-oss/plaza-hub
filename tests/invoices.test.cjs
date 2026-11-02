const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadApp } = require('./helpers/load-app.cjs');

async function demo() {
  const elements = new Map();
  const node = () => ({ value:'', innerHTML:'', textContent:'', style:{}, classList:{ add() {}, remove() {}, toggle() {} } });
  const element = id => {
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id);
  };
  const context = vm.createContext({ document:{ getElementById:element, querySelectorAll:() => [], createElement:node },
    window:{ innerWidth:1024, addEventListener() {} }, setTimeout() {} });
  await loadApp(context);
  const run = code => vm.runInContext(code, context);
  run("session.role='admin'; openModal=(title, body) => { globalThis.modalTitle=title; globalThis.modal=body; }; closeModalDirect=()=>{}; showToast=(message,type)=>{ globalThis.toast={message,type}; };");
  const fill = values => { for (const [id, value] of Object.entries(values)) element(id).value = value; };
  return { run, element, fill };
}

test('admin issues itemized invoices and validation preserves records on duplicate submission', async () => {
  const { run, element, fill } = await demo();
  run('openCreateInvoice();');
  assert.match(run('modal'), /invoice-tenancy/);
  fill({ 'invoice-tenancy':'6', 'invoice-start':'2027-01-01', 'invoice-end':'2027-12-31', 'invoice-due':'2027-01-14',
    'invoice-description':'Rent <script>', 'invoice-amount':'480000', 'invoice-extra-label':'Service charge', 'invoice-extra-amount':'24000' });
  run('saveInvoice();');
  assert.equal(run('repository.getInvoiceSummary(12).balance'), 504000);
  assert.equal(run('repository.getInvoice(12).items.length'), 2);
  assert.match(element('invoices-tbody').innerHTML, /INV-0012/);
  assert.match(run('modal'), /Rent &lt;script&gt;/);
  assert.doesNotMatch(run('modal'), /Rent <script>/);
  run('saveInvoice();');
  assert.equal(run('repository.listInvoices().length'), 12);
  assert.equal(run('toast.type'), 'error');
});

test('tenant evidence keeps balance unchanged until admin approval, including repeated approval', async () => {
  const { run, element, fill } = await demo();
  run("session.role='tenant'; renderPayStep(1);");
  assert.match(element('pay-content').innerHTML, /INV-0011/);
  run('renderPayStep(2);');
  fill({ 'transfer-amount':'100000', 'transfer-reference':'BANK-UI' });
  element('transfer-evidence').files = [{ name:'proof.pdf' }];
  run('processPayment(); globalThis.ref=PAYMENTS[0].ref;');
  assert.equal(run('repository.getInvoiceSummary(11).balance'), 510000);
  assert.match(element('pay-content').innerHTML, /unchanged/);
  run('renderReceipts();');
  assert.doesNotMatch(element('tenant-receipts-list').innerHTML, /EVD-/);
  run("session.role='admin'; openPaymentReview(ref);");
  assert.match(run('modal'), /BANK-UI/);
  run('approvePaymentEvidence(ref); approvePaymentEvidence(ref);');
  assert.equal(run('repository.getInvoiceSummary(11).balance'), 410000);
  assert.equal(run('repository.getInvoiceSummary(11).approved'), 100000);
  assert.match(element('tenant-receipts-list').innerHTML, /EVD-/);
  assert.match(element('payments-outstanding').textContent, /830,000/);
});

test('rejection requires a note and never appears as an approved receipt', async () => {
  const { run, element, fill } = await demo();
  run("session.role='tenant';");
  fill({ 'transfer-amount':'100', 'transfer-reference':'BANK-REJECT' });
  element('transfer-evidence').files = [{ name:'sample.pdf' }];
  run('submitTransferEvidence(); globalThis.ref=PAYMENTS[0].ref;');
  run("session.role='admin'; rejectPaymentEvidence(ref);");
  assert.equal(run('PAYMENTS[0].status'), 'pending');
  fill({ 'payment-review-reason':'Bank entry not found' });
  run('rejectPaymentEvidence(ref); renderReceipts();');
  assert.equal(run('PAYMENTS[0].status'), 'rejected');
  assert.equal(run('repository.getInvoiceSummary(11).balance'), 510000);
  assert.doesNotMatch(element('tenant-receipts-list').innerHTML, /EVD-/);
  run("session.role='tenant'; renderPayStep(1);");
  assert.match(element('pay-content').innerHTML, /Bank entry not found/);
  assert.match(element('pay-content').innerHTML, /Rejected/i);
});

test('role presentation blocks invoice creation and another tenant invoice/receipt details', async () => {
  const { run, fill } = await demo();
  run("session.role='tenant'; globalThis.modal='unchanged'; openCreateInvoice(); saveInvoice(); openInvoiceDetails(2); openPaymentRecord('TXN-2025-0840');");
  assert.equal(run('modal'), 'unchanged');
  assert.equal(run('repository.listInvoices().length'), 11);
  run('selectTenantInvoice(2);');
  fill({ 'transfer-amount':'100', 'transfer-reference':'FOREIGN' });
  run('openInvoiceDetails(11);');
  assert.match(run('modalTitle'), /INV-0011/);
  run("globalThis.modal='unchanged'; session.role='super'; openInvoiceDetails(11); openRecordPayment();");
  assert.equal(run('modal'), 'unchanged');
});

test('a newly assigned shop requires an issued invoice before evidence submission', async () => {
  const { run, element, fill } = await demo();
  run("globalThis.extra=repository.assignTenancy({tenantId:6,plazaId:1,unitId:2,rent:800000,start:'2026-01-01',expires:'2027-01-01'}); session.role='tenant'; selectTenantTenancy(extra.id);");
  assert.match(element('pay-content').innerHTML, /No invoice/);
  fill({ 'transfer-amount':'100', 'transfer-reference':'NO-INVOICE' });
  element('transfer-evidence').files = [{ name:'sample.pdf' }];
  const count = run('PAYMENTS.length');
  run('submitTransferEvidence();');
  assert.equal(run('PAYMENTS.length'), count);
  assert.equal(run('toast.type'), 'error');
});
