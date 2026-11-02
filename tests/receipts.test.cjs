const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp } = require('./helpers/load-app.cjs');

async function fresh() {
  const { createRepository } = await import('../js/data/repository.js');
  return createRepository();
}
function allocate(repo, overrides = {}) {
  return repo.addPayment({ invoiceId:11, ref:'RECEIPT-1', amount:100000,
    status:'paid', date:'2026-11-02', method:'Cash', ...overrides });
}
async function demo() {
  const elements = new Map();
  const classes = new Set();
  const state = { prints:[] };
  const node = () => ({ value:'', innerHTML:'', textContent:'', style:{}, classList:{ add() {}, remove() {}, toggle() {} } });
  const element = id => {
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id);
  };
  const context = vm.createContext({ document:{ getElementById:element, querySelectorAll:() => [], createElement:node,
    body:{ classList:{ add:name => classes.add(name), remove:name => classes.delete(name) } } },
    window:{ innerWidth:1024, addEventListener() {}, print() {
      state.prints.push({ html:element('receipt-print-root').innerHTML, printing:classes.has('printing-receipt') });
      if (state.failPrint) throw new Error('Printer unavailable');
    } }, setTimeout() {} });
  await loadApp(context);
  const run = code => vm.runInContext(code, context);
  run("session.role='tenant'; openModal=(title,body,footer)=>{globalThis.modal={title,body,footer};}; showToast=(message,type)=>{globalThis.toast={message,type};};");
  return { run, element, state, classes };
}

test('only confirmed sample records receive unique demo receipt numbers', async () => {
  const repo = await fresh();
  const receipts = repo.listReceipts();
  assert.equal(receipts.length, repo.listPayments().filter(p => p.status === 'paid').length);
  assert.equal(new Set(receipts.map(receipt => receipt.number)).size, receipts.length);
  assert.ok(receipts.every(receipt => /^DEMO-RCT-\d{6}$/.test(receipt.number)));
  assert.equal(repo.getReceiptForPayment('TXN-2024-0819'), null);
  assert.equal(repo.getReceiptForPayment('TXN-2024-0805'), null);
  assert.equal(repo.getReceiptForPayment('missing'), null);
  assert.equal(repo.listReceipts(2).length, 0);
});

test('manual partial payments receive distinct receipts with balances frozen at allocation', async () => {
  const repo = await fresh();
  allocate(repo);
  const first = repo.getReceiptForPayment('RECEIPT-1');
  assert.equal(first.amount, 100000);
  assert.equal(first.invoiceAmount, 510000);
  assert.equal(first.balanceAfter, 410000);
  assert.equal(first.invoiceNumber, 'INV-0011');
  assert.equal(first.items.length, 3);
  allocate(repo, { ref:'RECEIPT-2', amount:410000 });
  const second = repo.getReceiptForPayment('RECEIPT-2');
  assert.notEqual(second.number, first.number);
  assert.equal(second.balanceAfter, 0);
  assert.equal(repo.getReceiptForPayment('RECEIPT-1').balanceAfter, 410000);
  assert.equal(repo.getInvoiceSummary(11).balance, 0);
});

test('evidence issues exactly one receipt on approval and none on rejection', async () => {
  const repo = await fresh();
  const before = repo.listReceipts().length;
  allocate(repo, { status:'pending', transferReference:'BANK-R1', evidenceFile:'sample.pdf' });
  assert.equal(repo.getReceiptForPayment('RECEIPT-1'), null);
  repo.reviewPayment('RECEIPT-1', 'paid', 'Sample confirmed');
  const receipt = repo.getReceiptForPayment('RECEIPT-1');
  repo.reviewPayment('RECEIPT-1', 'paid');
  assert.deepEqual(repo.getReceiptForPayment('RECEIPT-1'), receipt);
  assert.equal(repo.listReceipts().length, before + 1);
  allocate(repo, { ref:'RECEIPT-2', status:'pending', transferReference:'BANK-R2', evidenceFile:'sample2.pdf' });
  repo.reviewPayment('RECEIPT-2', 'rejected', 'Not matched');
  assert.equal(repo.getReceiptForPayment('RECEIPT-2'), null);
});

test('failed overpayments and stale approvals do not consume a receipt number', async () => {
  const repo = await fresh();
  const before = repo.listReceipts().length;
  allocate(repo, { status:'pending', amount:510000, transferReference:'BANK-R1', evidenceFile:'sample.pdf' });
  allocate(repo, { ref:'RECEIPT-2', amount:100000 });
  assert.throws(() => repo.reviewPayment('RECEIPT-1', 'paid'), /exceeds/);
  assert.throws(() => allocate(repo, { ref:'TOO-MUCH', amount:510000 }), /exceeds/);
  assert.equal(repo.listReceipts().length, before + 1);
  assert.equal(repo.getReceiptForPayment('RECEIPT-1'), null);
  allocate(repo, { ref:'RECEIPT-3', amount:100000 });
  assert.equal(repo.getReceiptForPayment('RECEIPT-3').id, before + 2);
});

test('receipt copies and profile, plaza, terms or lifecycle changes cannot rewrite a receipt', async () => {
  const repo = await fresh();
  allocate(repo);
  const expected = repo.getReceiptForPayment('RECEIPT-1');
  const copy = repo.getReceiptForPayment('RECEIPT-1');
  copy.amount = 1;
  copy.items[0].amount = 1;
  repo.listReceipts().at(-1).items[0].description = 'Changed';
  repo.updateTenant(6, { name:'Changed tenant' });
  repo.listPlazas()[0].name = 'Changed plaza';
  repo.updateTenancy(6, { rent:999999 });
  repo.endTenancy(6, 'Moved out');
  repo.removeTenant(6);
  assert.deepEqual(repo.getReceiptForPayment('RECEIPT-1'), expected);
  allocate(repo, { ref:'OLD-DEBT', amount:100000 });
  assert.equal(repo.getReceiptForPayment('OLD-DEBT').balanceAfter, 310000);
});

test('opening and printing a receipt never issues another number or changes balances', async () => {
  const { run, element, state, classes } = await demo();
  const before = run('JSON.stringify(repository.getLedgerSummary())');
  const count = run('repository.listReceipts().length');
  run("openPaymentRecord('TXN-2025-0841');");
  assert.match(run('modal.title'), /DEMO-RCT-/);
  assert.match(run('modal.body'), /NOT OFFICIAL/);
  assert.match(run('modal.footer'), /Print \/ Save as PDF/);
  run("printReceipt('TXN-2025-0841'); openPaymentRecord('TXN-2025-0841');");
  assert.equal(state.prints.length, 1);
  assert.equal(state.prints[0].printing, true);
  assert.match(state.prints[0].html, /Funmi Boutique/);
  assert.doesNotMatch(state.prints[0].html, /Jide Legal|TXN-2025-0840/);
  assert.equal(element('receipt-print-root').innerHTML, '');
  assert.equal(classes.has('printing-receipt'), false);
  assert.equal(run('repository.listReceipts().length'), count);
  assert.equal(run('JSON.stringify(repository.getLedgerSummary())'), before);
});

test('scope is rechecked on print, including after the role changes', async () => {
  const { run, state } = await demo();
  run("globalThis.modal=null; openPaymentRecord('TXN-2025-0840'); printReceipt('TXN-2025-0840'); printReceipt('TXN-2024-0819');");
  assert.equal(run('modal'), null);
  assert.equal(state.prints.length, 0);
  run("session.role='admin'; openPaymentRecord('TXN-2025-0840');");
  assert.match(run('modal.body'), /Jide Legal Services/);
  run("session.role='tenant'; printReceipt('TXN-2025-0840'); session.role='super'; printReceipt('TXN-2025-0841');");
  assert.equal(state.prints.length, 0);
});

test('print failures clear the temporary document and preserve the receipt for retry', async () => {
  const { run, element, state, classes } = await demo();
  state.failPrint = true;
  run("printReceipt('TXN-2025-0841');");
  assert.equal(element('receipt-print-root').innerHTML, '');
  assert.equal(classes.size, 0);
  assert.equal(run('toast.type'), 'error');
  state.failPrint = false;
  run("printReceipt('TXN-2025-0841');");
  assert.equal(state.prints.length, 2);
});

test('receipt labels and values escape text and tenant lists exclude other tenants', async () => {
  const { run, element } = await demo();
  run("repository.updateTenant(6,{name:'<img src=x onerror=alert(1)>'}); repository.listPlazas()[0].name='<script>plaza</script>'; globalThis.inv=repository.createInvoice({tenancyId:6,periodStart:'2027-01-01',periodEnd:'2027-12-31',dueDate:'2027-01-14',items:[{description:'<script>charge</script>',amount:10}]}); repository.addPayment({invoiceId:inv.id,ref:'ESCAPED',amount:10,date:'2026-11-02',method:'Cash',status:'paid'}); openPaymentRecord('ESCAPED'); renderReceipts();");
  assert.match(run('modal.body'), /&lt;script&gt;charge/);
  assert.match(run('modal.body'), /&lt;img/);
  assert.match(run('modal.body'), /&lt;script&gt;plaza/);
  assert.doesNotMatch(run('modal.body'), /<script>|<img/);
  assert.doesNotMatch(element('tenant-receipts-list').innerHTML, /TXN-2025-0840/);
  assert.match(element('tenant-receipts-list').innerHTML, /TXN-2025-0841/);
});

test('empty state is helpful and print CSS isolates the dedicated document', async () => {
  const { createReceiptActions } = await import('../js/features/receipts.js');
  const list = { innerHTML:'' };
  const previous = global.document;
  try {
    global.document = { getElementById:() => list };
    createReceiptActions({ repository:{ listReceipts:() => [] }, ui:{}, getRole:() => 'tenant' }).renderReceipts();
    assert.match(list.innerHTML, /Pending and rejected/);
  } finally { global.document = previous; }
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
  assert.match(html, /id="receipt-print-root"/);
  assert.match(css, /body\.printing-receipt > :not\(#receipt-print-root\)\s*\{ display: none !important;/);
  assert.match(css, /@media print/);
});
