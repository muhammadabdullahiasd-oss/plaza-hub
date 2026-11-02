const { test } = require('node:test');
const assert = require('node:assert/strict');

async function fresh() {
  const { createRepository } = await import('../js/data/repository.js');
  return createRepository();
}
const bill = (repo, overrides = {}) => repo.createInvoice({ tenancyId:6,
  periodStart:'2027-01-01', periodEnd:'2027-12-31', dueDate:'2027-01-14',
  items:[{ description:'Rent', amount:100 }], ...overrides });
const pay = (repo, invoiceId, overrides = {}) => repo.addPayment({ invoiceId, ref:'TEST-1',
  amount:40, status:'paid', date:'2027-01-14', ...overrides });
const evidence = (repo, invoiceId, overrides = {}) => pay(repo, invoiceId, {
  status:'pending', transferReference:'BANK-1', evidenceFile:'proof.pdf', ...overrides });

test('partial payments settle only their invoice and leave the other period intact', async () => {
  const repo = await fresh();
  const invoice = bill(repo);
  pay(repo, invoice.id);
  assert.equal(repo.getInvoiceSummary(invoice.id, '2027-01-14').status, 'partial');
  assert.equal(repo.getInvoiceSummary(invoice.id).balance, 60);
  assert.equal(repo.getInvoiceSummary(11).balance, 510000);
  assert.equal(repo.getInvoiceSummary(1).balance, 0);
  pay(repo, invoice.id, { ref:'TEST-2', amount:60 });
  assert.equal(repo.getInvoiceSummary(invoice.id).status, 'paid');
  assert.equal(repo.getInvoiceSummary(invoice.id).approved, 100);
  assert.throws(() => pay(repo, invoice.id, { ref:'EXTRA', amount:0.01 }), /exceeds/);
});

test('pending and rejected evidence never reduce a balance or create an approved record', async () => {
  const repo = await fresh();
  const invoice = bill(repo);
  const before = repo.getLedgerSummary();
  evidence(repo, invoice.id);
  assert.equal(repo.getInvoiceSummary(invoice.id).balance, 100);
  assert.equal(repo.getInvoiceSummary(invoice.id).pending, 40);
  assert.equal(repo.getLedgerSummary().collected, before.collected);
  assert.throws(() => repo.reviewPayment('TEST-1', 'rejected'), /rejection reason/);
  repo.reviewPayment('TEST-1', 'rejected', 'Reference does not match bank record');
  assert.equal(repo.getInvoiceSummary(invoice.id).pending, 0);
  assert.equal(repo.getInvoiceSummary(invoice.id).balance, 100);
  assert.equal(repo.listPayments()[0].reviewReason, 'Reference does not match bank record');
  assert.throws(() => repo.reviewPayment('TEST-1', 'paid'), /Only pending/);
});

test('approval rechecks capacity when other evidence or manual money settles first', async () => {
  const repo = await fresh();
  const invoice = bill(repo);
  evidence(repo, invoice.id, { amount:70 });
  evidence(repo, invoice.id, { ref:'TEST-2', transferReference:'BANK-2', amount:70 });
  assert.equal(repo.getInvoiceSummary(invoice.id).pending, 140);
  repo.reviewPayment('TEST-1', 'paid');
  const reviewedAt = repo.listPayments().find(p => p.ref === 'TEST-1').reviewedAt;
  repo.reviewPayment('TEST-1', 'paid');
  assert.equal(repo.getInvoiceSummary(invoice.id).approved, 70);
  assert.equal(repo.listPayments().find(p => p.ref === 'TEST-1').reviewedAt, reviewedAt);
  assert.throws(() => repo.reviewPayment('TEST-2', 'paid'), /exceeds/);
  assert.equal(repo.listPayments().find(p => p.ref === 'TEST-2').status, 'pending');
  pay(repo, invoice.id, { ref:'TEST-3', amount:30 });
  assert.throws(() => repo.reviewPayment('TEST-2', 'paid'), /exceeds/);
  assert.equal(repo.getInvoiceSummary(invoice.id).balance, 0);
});

test('bank references reject duplicates across invoices, casing and rejected evidence', async () => {
  const repo = await fresh();
  const invoice = bill(repo);
  evidence(repo, invoice.id, { transferReference:'  BANK-ABC  ' });
  repo.reviewPayment('TEST-1', 'rejected', 'Incorrect invoice');
  assert.throws(() => evidence(repo, 11, { ref:'TEST-2', transferReference:'bank-abc' }), /already been submitted/);
  assert.throws(() => pay(repo, invoice.id), /unique payment reference/);
  assert.equal(repo.listPayments().filter(p => p.ref.startsWith('TEST-')).length, 1);
});

test('money uses integer kobo and rejects negative, non-finite and fractional-kobo values', async () => {
  const repo = await fresh();
  const invoice = bill(repo, { items:[{ description:'First', amount:0.1 }, { description:'Second', amount:0.2 }] });
  assert.equal(repo.getInvoiceSummary(invoice.id).amount, 0.3);
  pay(repo, invoice.id, { amount:0.1 });
  assert.equal(repo.getInvoiceSummary(invoice.id).balance, 0.2);
  for (const amount of [0, -1, NaN, Infinity, 0.001, '0.1', Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => pay(repo, invoice.id, { amount }), /positive amount/);
  }
  pay(repo, invoice.id, { ref:'TEST-2', amount:0.2 });
  assert.equal(repo.getInvoiceSummary(invoice.id).balance, 0);
});

test('invoice due date is inclusive and overdue status uses the unpaid remainder', async () => {
  const repo = await fresh();
  const invoice = bill(repo);
  assert.equal(repo.getInvoiceSummary(invoice.id, '2027-01-14').overdue, false);
  assert.equal(repo.getInvoiceSummary(invoice.id, '2027-01-15').overdue, true);
  pay(repo, invoice.id);
  assert.equal(repo.getInvoiceSummary(invoice.id, '2027-01-15').status, 'overdue');
  assert.equal(repo.getInvoiceSummary(invoice.id, '2027-01-15').balance, 60);
  pay(repo, invoice.id, { ref:'TEST-2', amount:60 });
  assert.equal(repo.getInvoiceSummary(invoice.id, '2027-01-15').overdue, false);
});

test('invalid dates, duplicate periods, missing items and foreign assignments cannot issue bills', async () => {
  const repo = await fresh();
  const before = repo.listInvoices().length;
  for (const details of [
    { periodStart:'2027-02-30' }, { periodEnd:'2026-12-31' }, { dueDate:'bad' },
    { tenancyId:999 }, { plazaId:2 }, { items:[] },
    { items:[{ description:' ', amount:100 }] }, { items:[{ description:'Rent', amount:-1 }] },
    { periodStart:'2026-12-31', periodEnd:'2027-02-01' },
  ]) assert.throws(() => bill(repo, details));
  assert.equal(repo.listInvoices().length, before);
  const invoice = bill(repo);
  assert.equal(invoice.number, 'INV-0012');
  assert.throws(() => bill(repo), /overlapping/);
  assert.throws(() => bill(repo, { periodStart:'2027-12-31', periodEnd:'2028-01-31' }), /overlapping/);
  assert.equal(bill(repo, { periodStart:'2028-01-01', periodEnd:'2028-12-31' }).id, 13);
});

test('payments require an invoice and reject mismatched identity, invalid dates and overpayments', async () => {
  const repo = await fresh();
  const invoice = bill(repo);
  for (const details of [
    { invoiceId:undefined }, { invoiceId:999 }, { tenantId:7 }, { tenancyId:7 },
    { unitId:1 }, { plazaId:2 }, { status:'rejected' }, { date:'2027-02-30' },
    { ref:"bad'handler" }, { amount:100.01 },
  ]) assert.throws(() => pay(repo, invoice.id, details));
  assert.throws(() => evidence(repo, invoice.id, { evidenceFile:'' }), /evidence filename/);
  assert.throws(() => evidence(repo, invoice.id, { transferReference:' ' }), /bank reference/);
  assert.equal(repo.getInvoiceSummary(invoice.id).balance, 100);
});

test('invoice snapshots survive profile/term changes, closure, archiving and returned-copy edits', async () => {
  const repo = await fresh();
  const invoice = bill(repo);
  repo.updateTenant(6, { name:'Renamed Boutique' });
  repo.updateTenancy(6, { rent:999999, expires:'2028-01-01' });
  invoice.items[0].amount = 1;
  repo.getInvoiceSummary(invoice.id).items[0].description = 'Changed';
  repo.listInvoiceSummaries()[0].items[0].amount = 1;
  repo.listInvoices().at(-1).dueDate = '2000-01-01';
  assert.equal(repo.getInvoice(invoice.id).tenant, 'Funmi Boutique');
  assert.equal(repo.getInvoice(invoice.id).items[0].description, 'Rent');
  assert.equal(repo.getInvoiceSummary(invoice.id).amount, 100);
  assert.equal(repo.getInvoice(invoice.id).dueDate, '2027-01-14');
  repo.endTenancy(6, 'Moved out');
  repo.removeTenant(6);
  const payment = pay(repo, invoice.id);
  payment.amount = 1;
  repo.listPayments()[0].amount = 2;
  assert.equal(repo.listPayments()[0].tenant, 'Funmi Boutique');
  assert.equal(repo.getInvoiceSummary(invoice.id).balance, 60);
  assert.throws(() => repo.updatePayment('TEST-1', { amount:1 }), /immutable/);
});

test('a new tenancy has no invented bill and plaza totals equal invoice allocations', async () => {
  const repo = await fresh();
  const before = repo.getLedgerSummary(1, '2027-01-15');
  const tenancy = repo.assignTenancy({ tenantId:6, plazaId:1, unitId:2, rent:800000, start:'2026-01-01', expires:'2027-01-01' });
  assert.deepEqual(repo.getLedgerSummary(1, '2027-01-15'), before);
  assert.equal(repo.listInvoices().filter(i => i.tenancyId === tenancy.id).length, 0);
  const invoice = bill(repo);
  pay(repo, invoice.id);
  evidence(repo, invoice.id, { ref:'TEST-2' });
  const after = repo.getLedgerSummary(1, '2027-01-15');
  assert.equal(after.billed, before.billed + 100);
  assert.equal(after.collected, before.collected + 40);
  assert.equal(after.outstanding, before.outstanding + 60);
  assert.equal(after.overdue, before.overdue + 60);
  assert.equal(after.pending, before.pending + 40);
  assert.equal(repo.listInvoices(2).length, 0);
  assert.equal(repo.getLedgerSummary(2).collectionRate, 0);
});
