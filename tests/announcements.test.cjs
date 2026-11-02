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
const publish = (repo, details = {}) => repo.publishAnnouncement({ title:'Water supply maintenance',
  body:'Water supply pauses on Saturday, 10am–12pm.\nContact management with questions.', audience:'all', ...details });
async function demo() {
  const elements = new Map();
  const inputs = [];
  const node = () => ({ value:'', innerHTML:'', textContent:'', style:{}, classList:{ add() {}, remove() {}, toggle() {} }, appendChild() {} });
  const element = id => {
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id);
  };
  const context = vm.createContext({ document:{ getElementById:element,
    querySelectorAll:selector => selector === 'input[name="announcement-recipient"]:checked' ? inputs.filter(input => input.checked) : [], createElement:node },
    window:{ innerWidth:1024, addEventListener() {} }, setTimeout() {} });
  await loadApp(context);
  const run = code => vm.runInContext(code, context);
  run("session.role='admin'; showToast=(message,type)=>{globalThis.toast={message,type};};");
  const fill = (values = {}) => {
    const fields = { 'announcement-audience':'all', 'announcement-title':'Water supply maintenance', 'announcement-body':'Saturday, 10am–12pm.\nContact management.', ...values };
    for (const [id, value] of Object.entries(fields)) element(id).value = value;
  };
  return { run, element, inputs, fill };
}

test('broadcast snapshots each active tenant once even with several shops', async () => {
  const repo = await fresh();
  repo.assignTenancy({ tenantId:6, plazaId:1, unitId:2, rent:100000, start:'2026-01-01', expires:'2027-01-01' });
  const notice = publish(repo);
  assert.equal(notice.recipients.length, 12);
  assert.equal(notice.recipients.filter(tenant => tenant.tenantId === 6).length, 1);
  assert.deepEqual(notice.recipients.find(tenant => tenant.tenantId === 6).shops, ['D-09', 'A-02']);
  assert.equal(repo.listTenantAnnouncements(6).length, 1);
});

test('new notices exclude archived and unassigned profiles', async () => {
  const repo = await fresh();
  repo.endTenancy(6, 'Vacated');
  repo.endTenancy(7, 'Vacated');
  repo.removeTenant(7);
  const notice = publish(repo);
  assert.equal(notice.recipients.length, 10);
  assert.ok(notice.recipients.every(tenant => ![6,7].includes(tenant.tenantId)));
  assert.throws(() => publish(repo, { audience:'selected', tenantIds:[6,7] }), /current tenants/);
});

test('selected audience deduplicates IDs and does not expose the notice to others', async () => {
  const repo = await fresh();
  const notice = publish(repo, { audience:'selected', tenantIds:[6,6,7] });
  assert.equal(notice.recipients.length, 2);
  assert.equal(repo.listTenantAnnouncements(6).length, 1);
  assert.equal(repo.listTenantAnnouncements(8).length, 0);
  assert.equal(repo.listTenantAnnouncements(6, 2).length, 0);
  assert.equal(repo.listAnnouncements(2).length, 0);
  assert.equal('recipients' in repo.listTenantAnnouncements(6)[0], false);
  assert.equal('readBy' in repo.listTenantAnnouncements(6)[0], false);
});

test('invalid text, audience and mixed recipient lists reject atomically without consuming an ID', async () => {
  const repo = await fresh();
  for (const details of [
    { title:' ' }, { title:'x'.repeat(121) }, { title:123 }, { body:'' }, { body:'x'.repeat(3001) },
    { body:null }, { audience:'email' }, { audience:'selected', tenantIds:[] },
    { audience:'selected', tenantIds:[6,999] }, { audience:'selected', tenantIds:['6'] },
    { audience:'selected', tenantIds:[NaN] }, { plazaId:999 }, { plazaId:2, audience:'selected', tenantIds:[6] },
  ]) assert.throws(() => publish(repo, details));
  assert.equal(repo.listAnnouncements().length, 0);
  assert.equal(publish(repo, { title:'  Maintenance  ', body:'  Sample notice  ' }).id, 1);
  assert.equal(repo.listAnnouncements()[0].title, 'Maintenance');
});

test('all tenants in an empty plaza fails rather than reporting a successful send', async () => {
  const repo = await fresh();
  assert.throws(() => publish(repo, { plazaId:2 }), /no current tenants/);
  assert.equal(repo.listAnnouncements(2).length, 0);
});

test('only a recipient can mark read and repeats retain the original timestamp', async () => {
  const repo = await fresh();
  const notice = publish(repo, { audience:'selected', tenantIds:[6,7] });
  assert.equal(repo.listTenantAnnouncements(6)[0].readAt, null);
  assert.throws(() => repo.markAnnouncementRead(notice.id, 8), /not available/);
  assert.throws(() => repo.markAnnouncementRead(notice.id, 6, 2), /not available/);
  assert.throws(() => repo.markAnnouncementRead(999, 6), /not available/);
  const read = repo.markAnnouncementRead(notice.id, 6);
  assert.ok(read.readAt);
  assert.equal(repo.markAnnouncementRead(notice.id, 6).readAt, read.readAt);
  assert.equal(repo.listAnnouncements()[0].readBy.length, 1);
  assert.equal(repo.listTenantAnnouncements(7)[0].readAt, null);
});

test('recipient snapshots survive renaming, closure and a new occupant without inheriting notices', async () => {
  const repo = await fresh();
  const notice = publish(repo);
  repo.updateTenant(6, { name:'Renamed Boutique' });
  repo.endTenancy(6, 'Vacated');
  repo.removeTenant(6);
  const replacement = repo.addTenant({ shop:'D-09', name:'New Occupant', business:'Retail', rent:480000, start:'2026-01-01', expires:'2027-01-01' });
  assert.equal(repo.listTenantAnnouncements(6).length, 1);
  assert.equal(repo.listTenantAnnouncements(replacement.id).length, 0);
  assert.deepEqual(repo.listAnnouncements()[0].recipients, notice.recipients);
  const next = publish(repo);
  assert.ok(next.recipients.some(tenant => tenant.tenantId === replacement.id));
  assert.ok(!next.recipients.some(tenant => tenant.tenantId === 6));
});

test('returned records and recipient/read arrays cannot change publication history', async () => {
  const repo = await fresh();
  const notice = publish(repo);
  notice.title = 'Changed';
  notice.recipients[0].shops.push('Z-99');
  notice.readBy.push({ tenantId:6 });
  repo.listAnnouncements()[0].recipients[0].name = 'Changed';
  repo.getAnnouncementRecipients()[0].shops.push('Z-98');
  const tenantView = repo.listTenantAnnouncements(6)[0];
  tenantView.readAt = 'fake';
  assert.equal(repo.listAnnouncements()[0].title, 'Water supply maintenance');
  assert.equal(repo.listAnnouncements()[0].recipients[0].name, 'Adaeze Obi');
  assert.deepEqual(repo.listAnnouncements()[0].recipients[0].shops, ['A-01']);
  assert.equal(repo.listAnnouncements()[0].readBy.length, 0);
  assert.equal(repo.listTenantAnnouncements(6)[0].readAt, null);
});

test('announcements never alter rents, issued invoices, payments or receipts', async () => {
  const repo = await fresh();
  const before = JSON.stringify([repo.listTenancies(), repo.listInvoices(), repo.listPayments(), repo.listReceipts()]);
  const notice = publish(repo, { title:'Rent review discussion', body:'Proposed rent review; this announcement does not change your agreement.' });
  repo.markAnnouncementRead(notice.id, 6);
  assert.equal(JSON.stringify([repo.listTenancies(), repo.listInvoices(), repo.listPayments(), repo.listReceipts()]), before);
});

test('repository instances do not share announcements', async () => {
  const first = await fresh(), second = await fresh();
  publish(first);
  assert.equal(second.listAnnouncements().length, 0);
});

test('plazas with identical shop numbers keep their recipients and read state separate', async () => {
  const { createDemoData } = await import('../js/data/demo-data.js');
  const { createRepository } = await import('../js/data/repository.js');
  const data = createDemoData();
  data.tenants.push({ id:99, plazaId:2, name:'Other Plaza Tenant', archived:false });
  data.units.push({ id:99, plazaId:2, number:'D-09' });
  data.tenancies.push({ id:99, plazaId:2, tenantId:99, unitId:99, status:'active' });
  const repo = createRepository(data);
  assert.equal(repo.getAnnouncementRecipients().some(tenant => tenant.tenantId === 99), false);
  assert.throws(() => publish(repo, { audience:'selected', tenantIds:[6,99] }), /current tenants/);
  const notice = publish(repo, { plazaId:2 });
  assert.deepEqual(notice.recipients.map(tenant => tenant.tenantId), [99]);
  assert.equal(repo.listAnnouncements().length, 0);
  assert.equal(repo.listTenantAnnouncements(6, 2).length, 0);
  assert.throws(() => repo.markAnnouncementRead(notice.id, 99, 1), /not available/);
  repo.markAnnouncementRead(notice.id, 99, 2);
  assert.ok(repo.listTenantAnnouncements(99, 2)[0].readAt);
});

test('publish form saves actual text, resets on success and rejects a repeated empty submission', async () => {
  const { run, element, fill } = await demo();
  fill();
  run('renderAdminNotifs(); publishAnnouncement({preventDefault(){globalThis.prevented=true;}});');
  assert.equal(run('prevented'), true);
  assert.equal(run('repository.listAnnouncements().length'), 1);
  assert.equal(run('repository.listAnnouncements()[0].recipients.length'), 12);
  assert.match(element('admin-announcement-list').innerHTML, /Saturday, 10am–12pm/);
  assert.equal(element('announcement-title').value, '');
  assert.equal(element('announcement-body').value, '');
  assert.match(run('toast.message'), /No email or SMS was sent/);
  run('publishAnnouncement();');
  assert.equal(run('repository.listAnnouncements().length'), 1);
  assert.equal(run('toast.type'), 'error');
});

test('selected audience publishes only checked tenants and keeps drafts on validation error', async () => {
  const { run, element, inputs, fill } = await demo();
  fill({ 'announcement-audience':'selected' });
  run('updateAnnouncementAudience(); publishAnnouncement();');
  assert.equal(element('announcement-recipients').hidden, false);
  assert.equal(element('announcement-title').value, 'Water supply maintenance');
  assert.equal(run('repository.listAnnouncements().length'), 0);
  inputs.push({ value:'7', checked:true });
  run('updateAnnouncementAudience(); publishAnnouncement();');
  assert.equal(run('repository.listTenantAnnouncements(6).length'), 0);
  assert.equal(run('repository.listTenantAnnouncements(7).length'), 1);
  assert.equal(inputs[0].checked, false);
  assert.match(element('admin-announcement-list').innerHTML, /Grace Pharmacy/);
});

test('tenant notification flow shows unread indicators and read status updates admin history', async () => {
  const { run, element, fill } = await demo();
  fill();
  run("publishAnnouncement(); session.role='tenant'; navTo('tenant-dashboard');");
  assert.equal(element('topbar-announcement-dot').style.display, 'block');
  run("navTo('notifications');");
  assert.equal(run('session.page'), 'tenant-notifications');
  assert.match(element('tenant-announcement-summary').textContent, /1 unread/);
  assert.match(element('tenant-announcement-list').innerHTML, /Mark as read/);
  run('markAnnouncementRead(1); markAnnouncementRead(1);');
  assert.equal(element('topbar-announcement-dot').style.display, 'none');
  assert.match(element('tenant-announcement-summary').textContent, /0 unread/);
  assert.doesNotMatch(element('tenant-announcement-list').innerHTML, /onclick="markAnnouncementRead/);
  run("session.role='admin'; renderAdminNotifs();");
  assert.match(element('admin-announcement-list').innerHTML, /1 marked read/);
});

test('nonrecipients see an empty state and cannot mark another tenant notice read', async () => {
  const { run, element, inputs, fill } = await demo();
  fill({ 'announcement-audience':'selected', 'announcement-body':'PRIVATE-TO-GRACE' });
  inputs.push({ value:'7', checked:true });
  run("publishAnnouncement(); session.role='tenant'; renderTenantNotifs(); markAnnouncementRead(1);");
  assert.doesNotMatch(element('tenant-announcement-list').innerHTML, /PRIVATE-TO-GRACE/);
  assert.match(element('tenant-announcement-list').innerHTML, /No announcements addressed/);
  assert.equal(run('repository.listAnnouncements()[0].readBy.length'), 0);
  assert.equal(run('toast.type'), 'error');
});

test('tenant and platform-admin presentation cannot publish or mark read for the demo tenant', async () => {
  const { run, fill } = await demo();
  fill();
  run("session.role='tenant'; publishAnnouncement(); session.role='super'; publishAnnouncement();");
  assert.equal(run('repository.listAnnouncements().length'), 0);
  run("session.role='admin'; publishAnnouncement(); markAnnouncementRead(1); session.role='super'; markAnnouncementRead(1); updateAnnouncementIndicators();");
  assert.equal(run('repository.listAnnouncements()[0].readBy.length'), 0);
});

test('announcement and recipient text renders as text with line breaks preserved', async () => {
  const { run, element, fill } = await demo();
  fill({ 'announcement-title':'<img src=x onerror=alert(1)>', 'announcement-body':'First line\n<script>alert(1)</script>' });
  run("repository.updateTenant(6,{name:'<svg onload=alert(1)>'}); publishAnnouncement(); session.role='tenant'; renderTenantNotifs();");
  assert.match(element('tenant-announcement-list').innerHTML, /&lt;img/);
  assert.match(element('tenant-announcement-list').innerHTML, /First line\n&lt;script&gt;/);
  assert.doesNotMatch(element('tenant-announcement-list').innerHTML, /<script>|<img/);
  assert.match(element('admin-announcement-list').innerHTML, /&lt;svg/);
  run("session.role='admin'; renderAdminNotifs();");
  assert.match(element('announcement-recipient-options').innerHTML, /&lt;svg/);
});

test('form labels, sample-history separation and notification counts replace misleading mock send', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const id of ['announcement-audience', 'announcement-title', 'announcement-body']) assert.match(html, new RegExp(`for="${id}"`));
  assert.match(html, /<fieldset[^>]*id="announcement-recipients"[^>]*hidden disabled/);
  assert.match(html, /Sample Operational Alerts/);
  assert.match(html, /Sample Activity History/);
  assert.doesNotMatch(html, /Bulk reminder sent to 5 tenants|3 unread|5 new/);
});
