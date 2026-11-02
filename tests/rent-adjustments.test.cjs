const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadApp } = require('./helpers/load-app.cjs');

async function fresh() {
  const { createDemoData } = await import('../js/data/demo-data.js');
  const { createRentAdjustmentStore } = await import('../js/data/rent-adjustments.js');
  const { createRepository } = await import('../js/data/repository.js');
  const data = createDemoData();
  let day = '2026-11-02';
  const store = createRentAdjustmentStore(data, () => day);
  return { data, store, repo:createRepository(data), setDay:value => { day = value; } };
}
const publish = (store, overrides = {}) => store.publishRentAdjustment({ tenancyId:6, newRent:500000,
  effectiveDate:'2026-12-02', minimumNoticeDays:30, reason:'Annual rent review for the occupied shop.', ...overrides });

async function demo() {
  let timestamp = Date.parse('2026-11-02T12:00:00Z');
  class DemoDate extends Date {
    constructor(...args) { super(...(args.length ? args : [timestamp])); }
    static now() { return timestamp; }
  }
  const elements = new Map();
  const node = () => ({ value:'', innerHTML:'', textContent:'', style:{}, classList:{ add() {}, remove() {}, toggle() {} }, appendChild() {} });
  const element = id => {
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id);
  };
  const context = vm.createContext({ Date:DemoDate, document:{ getElementById:element, querySelectorAll:() => [], createElement:node },
    window:{ innerWidth:1024, addEventListener() {} }, setTimeout() {} });
  await loadApp(context);
  const run = code => vm.runInContext(code, context);
  run("session.role='admin'; openModal=(title,body,footer)=>{globalThis.modal={title,body,footer};}; showToast=(message,type)=>{globalThis.toast={message,type};};");
  const fill = (values = {}) => {
    for (const [key,value] of Object.entries({ 'rent-notice-tenancy':'6', 'rent-notice-new':'500000',
      'rent-notice-date':'2026-12-02', 'rent-notice-days':'30', 'rent-notice-reason':'Annual rent review.', ...values })) element(key).value = value;
  };
  return { run, element, fill, setDay:day => { timestamp = Date.parse(`${day}T12:00:00Z`); } };
}

test('publishing snapshots old/new annual rent, reason and explicit advance policy without applying', async () => {
  const { store, repo } = await fresh();
  const notice = publish(store);
  assert.equal(notice.oldRent, 480000);
  assert.equal(notice.newRent, 500000);
  assert.equal(notice.advanceDays, 30);
  assert.equal(notice.minimumNoticeDays, 30);
  assert.equal(notice.noticeDate, '2026-11-02');
  assert.equal(notice.state, 'scheduled');
  assert.equal(repo.getTenancy(6).rent, 480000);
  assert.equal(notice.canApply, false);
  assert.throws(() => store.applyRentAdjustment(notice.id), /effective date has not arrived/);
});

test('effective date applies exactly once to just that agreement and retains financial history', async () => {
  const { store, repo, setDay } = await fresh();
  const before = JSON.stringify([repo.listInvoices(), repo.listPayments(), repo.listReceipts()]);
  const notice = publish(store);
  setDay('2026-12-01');
  assert.equal(store.getRentAdjustment(notice.id).canApply, false);
  setDay('2026-12-02');
  assert.equal(store.getRentAdjustment(notice.id).state, 'ready');
  const applied = store.applyRentAdjustment(notice.id);
  assert.equal(repo.getTenancy(6).rent, 500000);
  assert.equal(repo.getTenancy(7).rent, 540000);
  assert.equal(applied.status, 'applied');
  assert.deepEqual(store.applyRentAdjustment(notice.id), applied);
  assert.equal(JSON.stringify([repo.listInvoices(), repo.listPayments(), repo.listReceipts()]), before);
  assert.equal(repo.getInvoiceSummary(11).amount, 510000);
  assert.throws(() => store.cancelRentAdjustment(notice.id, 'Undo'), /cannot be cancelled/);
  const later = publish(store, { newRent:520000, effectiveDate:'2027-01-01' });
  setDay('2027-01-01');
  store.applyRentAdjustment(later.id);
  store.applyRentAdjustment(notice.id);
  assert.equal(repo.getTenancy(6).rent, 520000, 'Replaying an earlier applied notice must not undo a later change');
});

test('decreases and exact kobo values work and unchanged rent or invalid money rejects', async () => {
  const { store, repo, setDay } = await fresh();
  for (const newRent of [480000, 0, -1, NaN, Infinity, 450000.001, '450000']) assert.throws(() => publish(store, { newRent }));
  const notice = publish(store, { newRent:450000.25 });
  setDay('2026-12-02');
  store.applyRentAdjustment(notice.id);
  assert.equal(repo.getTenancy(6).rent, 450000.25);
});

test('invalid dates, too little advance, missing policy and invalid reasons reject without partial records', async () => {
  const { store } = await fresh();
  for (const details of [
    { effectiveDate:'2026-11-02' }, { effectiveDate:'2026-11-01' }, { effectiveDate:'2027-02-30' },
    { effectiveDate:'2026-11-30' }, { effectiveDate:'' }, { minimumNoticeDays:undefined },
    { minimumNoticeDays:0 }, { minimumNoticeDays:1.5 }, { minimumNoticeDays:3651 },
    { minimumNoticeDays:'30' }, { reason:'' }, { reason:' ' }, { reason:'x'.repeat(1001) },
    { tenancyId:999 }, { plazaId:2 },
  ]) assert.throws(() => publish(store, details));
  assert.equal(store.listRentAdjustments().length, 0);
  assert.equal(publish(store).number, 'DEMO-RENT-0001');
});

test('calendar-day advance remains correct across a leap day', async () => {
  const { store, setDay } = await fresh();
  setDay('2028-02-28');
  const notice = publish(store, { effectiveDate:'2028-03-01', minimumNoticeDays:2 });
  assert.equal(notice.advanceDays, 2);
});

test('one open notice per tenancy and cancellation retains history before a replacement', async () => {
  const { store, repo, setDay } = await fresh();
  const first = publish(store);
  assert.throws(() => publish(store), /already has an open/);
  assert.throws(() => store.cancelRentAdjustment(first.id, ' '), /cancellation reason/);
  const cancelled = store.cancelRentAdjustment(first.id, 'Incorrect amount; replacement follows.');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(repo.getTenancy(6).rent, 480000);
  const next = publish(store, { newRent:490000 });
  assert.notEqual(first.number, next.number);
  setDay('2026-12-02');
  assert.throws(() => store.applyRentAdjustment(first.id), /Only an open/);
  store.applyRentAdjustment(next.id);
  assert.equal(store.getRentAdjustment(first.id).oldRent, 480000);
  assert.equal(repo.getTenancy(6).rent, 490000);
});

test('term corrections block stale application until explicit cancellation and republication', async () => {
  for (const correction of [{ rent:490000 }, { expires:'2028-01-01' }, { start:'2022-01-15' }]) {
    const { store, repo, setDay } = await fresh();
    const notice = publish(store);
    repo.updateTenancy(6, correction);
    setDay('2026-12-02');
    assert.equal(store.getRentAdjustment(notice.id).state, 'blocked');
    assert.throws(() => store.applyRentAdjustment(notice.id), /terms changed/);
    assert.equal(store.getRentAdjustment(notice.id).status, 'scheduled');
    store.cancelRentAdjustment(notice.id, 'Terms corrected');
    assert.equal(store.getRentAdjustment(notice.id).status, 'cancelled');
  }
});

test('closure, archive and a replacement occupant cannot inherit a rent change', async () => {
  const { store, repo, setDay } = await fresh();
  const notice = publish(store);
  repo.endTenancy(6, 'Vacated');
  repo.removeTenant(6);
  const replacement = repo.addTenant({ shop:'D-09', name:'New Occupant', business:'Retail', rent:600000, start:'2026-11-02', expires:'2027-11-02' });
  setDay('2026-12-02');
  assert.throws(() => store.applyRentAdjustment(notice.id), /no longer active/);
  assert.equal(store.listTenantRentAdjustments(replacement.id).length, 0);
  assert.equal(store.listTenantRentAdjustments(6).length, 1);
  assert.equal(repo.listActiveTenancies(replacement.id)[0].rent, 600000);
  assert.throws(() => publish(store), /active shop agreement/);
});

test('notices cannot take effect before a future agreement begins', async () => {
  const { store, repo } = await fresh();
  const extra = repo.assignTenancy({ tenantId:6, plazaId:1, unitId:2, rent:100000, start:'2027-01-01', expires:'2028-01-01' });
  assert.throws(() => publish(store, { tenancyId:extra.id, effectiveDate:'2026-12-02' }), /agreement start/);
});

test('read state belongs to the recipient and updated lifecycle status becomes unread again', async () => {
  const { store, setDay } = await fresh();
  const notice = publish(store);
  assert.throws(() => store.markRentAdjustmentRead(notice.id, 7), /not addressed/);
  const read = store.markRentAdjustmentRead(notice.id, 6);
  assert.equal(store.markRentAdjustmentRead(notice.id, 6).readAt, read.readAt);
  setDay('2026-12-02');
  store.applyRentAdjustment(notice.id);
  const applied = store.getRentAdjustment(notice.id);
  assert.equal(applied.readAt, null);
  assert.equal(applied.publishedReadAt, read.readAt);
  assert.ok(store.markRentAdjustmentRead(notice.id, 6).statusReadAt);
  assert.equal(store.listTenantRentAdjustments(7).length, 0);
});

test('returned snapshots are copies and plaza operations cannot cross scope', async () => {
  const { store, repo, setDay } = await fresh();
  const notice = publish(store);
  repo.updateTenant(6, { name:'Renamed Boutique' });
  assert.equal(store.getRentAdjustment(notice.id).tenant, 'Funmi Boutique');
  notice.newRent = 1;
  store.listRentAdjustments()[0].effectiveDate = '2026-01-01';
  store.listTenantRentAdjustments(6)[0].oldRent = 1;
  assert.equal(store.getRentAdjustment(notice.id).newRent, 500000);
  assert.equal(store.getRentAdjustment(notice.id).oldRent, 480000);
  assert.equal(store.listRentAdjustments(2).length, 0);
  assert.equal(store.getRentAdjustment(notice.id, 2), null);
  setDay('2026-12-02');
  assert.throws(() => store.applyRentAdjustment(notice.id, 2), /this plaza/);
  assert.throws(() => store.cancelRentAdjustment(notice.id, 'Reason', 2), /this plaza/);
  assert.throws(() => store.markRentAdjustmentRead(notice.id, 6, 2), /this plaza/);
  store.applyRentAdjustment(notice.id);
  assert.equal(repo.getTenancy(6).rent, 500000, 'A profile rename must not block a valid notice');
});

test('UI publishes a future notice, shows it to the tenant and blocks early application', async () => {
  const { run, element, fill } = await demo();
  fill();
  run('openManageTenancies(6);');
  assert.match(run('modal.body'), /openPublishRentAdjustment\(6\)/);
  run('openPublishRentAdjustment(6);');
  assert.match(run('modal.body'), /rent-notice-days/);
  run('publishRentAdjustment({preventDefault(){globalThis.prevented=true;}});');
  assert.equal(run('prevented'), true);
  assert.equal(run('repository.getTenancy(6).rent'), 480000);
  assert.match(element('admin-rent-notice-list').innerHTML, /DEMO-RENT-0001/);
  assert.match(run('modal.footer'), /disabled/);
  run('applyRentAdjustment(1);');
  assert.equal(run('toast.type'), 'error');
  run("session.role='tenant'; renderTenantNotifs();");
  assert.match(element('tenant-rent-notice-list').innerHTML, /480,000.*500,000/);
  assert.equal(element('topbar-announcement-dot').style.display, 'block');
  run('markRentAdjustmentRead(1);');
  assert.equal(element('topbar-announcement-dot').style.display, 'none');
});

test('UI date-boundary application updates agreement displays but leaves invoices and receipts unchanged', async () => {
  const { run, element, fill, setDay } = await demo();
  fill();
  const before = run('JSON.stringify([repository.listInvoices(), repository.listPayments(), repository.listReceipts()])');
  run('publishRentAdjustment();');
  setDay('2026-12-02');
  run('renderAdminRentAdjustments(); openRentAdjustmentNotice(1);');
  assert.doesNotMatch(run('modal.footer'), /disabled/);
  run('applyRentAdjustment(1); applyRentAdjustment(1);');
  assert.equal(run('repository.getTenancy(6).rent'), 500000);
  assert.match(element('tenant-rent-total').textContent, /500,000/);
  assert.equal(run('JSON.stringify([repository.listInvoices(), repository.listPayments(), repository.listReceipts()])'), before);
});

test('cancellation requires a reason and remains visible as an unread update', async () => {
  const { run, element, fill } = await demo();
  fill();
  run("publishRentAdjustment(); session.role='tenant'; markRentAdjustmentRead(1); session.role='admin'; openCancelRentAdjustment(1); cancelRentAdjustment(1);");
  assert.equal(run('repository.getRentAdjustment(1).status'), 'scheduled');
  element('rent-notice-cancel-reason').value = 'Review postponed by management';
  run("cancelRentAdjustment(1); session.role='tenant'; renderTenantNotifs(); openRentAdjustmentNotice(1);");
  assert.match(element('tenant-rent-notice-list').innerHTML, /Cancelled/);
  assert.match(run('modal.body'), /Review postponed/);
  assert.equal(element('topbar-announcement-dot').style.display, 'block');
  assert.equal(run('repository.getTenancy(6).rent'), 480000);
});

test('tenant and platform-admin presentation cannot publish/apply/cancel or read another tenant notice', async () => {
  const { run, fill } = await demo();
  fill();
  run("session.role='tenant'; publishRentAdjustment(); session.role='super'; publishRentAdjustment();");
  assert.equal(run('repository.listRentAdjustments().length'), 0);
  run("session.role='admin'; publishRentAdjustment(); session.role='tenant'; applyRentAdjustment(1); cancelRentAdjustment(1);");
  assert.equal(run('repository.getRentAdjustment(1).status'), 'scheduled');
  fill({ 'rent-notice-tenancy':'7' });
  run("session.role='admin'; publishRentAdjustment(); session.role='tenant'; globalThis.modal=null; openRentAdjustmentNotice(2); markRentAdjustmentRead(2);");
  assert.equal(run('modal'), null);
  assert.equal(run('repository.getRentAdjustment(2).readAt'), null);
  run("session.role='super'; applyRentAdjustment(1); cancelRentAdjustment(1); markRentAdjustmentRead(1);");
  assert.equal(run('repository.getRentAdjustment(1).status'), 'scheduled');
});

test('UI escapes notice text, preserves invalid drafts and rejects a second open notice', async () => {
  const { run, element, fill } = await demo();
  fill({ 'rent-notice-reason':'<img src=x onerror=alert(1)>', 'rent-notice-days':'31' });
  run('publishRentAdjustment();');
  assert.equal(run('repository.listRentAdjustments().length'), 0);
  assert.equal(element('rent-notice-reason').value, '<img src=x onerror=alert(1)>');
  element('rent-notice-days').value = '30';
  run('publishRentAdjustment(); publishRentAdjustment(); openRentAdjustmentNotice(1);');
  assert.equal(run('repository.listRentAdjustments().length'), 1);
  assert.match(run('modal.body'), /&lt;img/);
  assert.doesNotMatch(run('modal.body'), /<img/);
});
