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
const register = (repo, details = {}) => repo.registerDocument({ title:'D-09 sample lease', category:'lease',
  scope:'tenancy', tenancyId:6, fileName:'d09-demo.pdf', description:'Sample metadata only.', ...details });
async function demo() {
  const elements = new Map();
  const node = () => ({ value:'', innerHTML:'', textContent:'', style:{}, classList:{ add() {}, remove() {}, toggle() {} }, appendChild() {} });
  const element = id => {
    if (!elements.has(id)) elements.set(id, node());
    return elements.get(id);
  };
  const context = vm.createContext({ document:{ getElementById:element, querySelectorAll:() => [], createElement:node },
    window:{ innerWidth:1024, addEventListener() {} }, setTimeout() {} });
  await loadApp(context);
  const run = code => vm.runInContext(code, context);
  run("session.role='admin'; openModal=(title,body,footer)=>{globalThis.modal={title,body,footer};}; showToast=(message,type)=>{globalThis.toast={message,type};};");
  const fill = (values = {}) => {
    for (const [id,value] of Object.entries({ 'document-record-title':'D-09 sample lease', 'document-record-category':'lease',
      'document-record-scope':'tenancy', 'document-record-tenancy':'6', 'document-record-filename':'d09-demo.pdf',
      'document-record-description':'Sample metadata only.', 'document-record-visibility':'management', ...values })) element(id).value = value;
  };
  return { run, element, fill };
}

test('metadata registration defaults to management only and does not claim a stored file', async () => {
  const repo = await fresh();
  const record = register(repo);
  assert.equal(record.number, 'DEMO-DOC-0001');
  assert.equal(record.visibility, 'management');
  assert.equal(record.tenantId, 6);
  assert.equal(record.unit, 'D-09');
  assert.equal('url' in record, false);
  assert.equal('file' in record, false);
  assert.equal(repo.listTenantDocuments(6).length, 0);
  assert.equal(repo.getTenantDocument(record.id, 6), null);
});

test('shared tenancy documents belong to the stable original tenant and hide internal history', async () => {
  const repo = await fresh();
  repo.updateTenant(7, { name:'Funmi Boutique' });
  const record = register(repo, { visibility:'tenant' });
  assert.equal(repo.listTenantDocuments(6).length, 1);
  assert.equal(repo.listTenantDocuments(7).length, 0);
  assert.equal(repo.getTenantDocument(record.id, 7), null);
  const tenantView = repo.getTenantDocument(record.id, 6);
  assert.equal('visibilityHistory' in tenantView, false);
  assert.equal('withdrawalReason' in tenantView, false);
});

test('ending occupancy and replacing its tenant never transfers a lease document', async () => {
  const repo = await fresh();
  const record = register(repo, { visibility:'tenant' });
  repo.endTenancy(6, 'Moved out');
  repo.removeTenant(6);
  const replacement = repo.addTenant({ name:'New occupant', shop:'D-09', business:'Retail', rent:500000, start:'2026-11-03', expires:'2027-11-03' });
  assert.equal(repo.getTenantDocument(record.id, 6).tenant, 'Funmi Boutique');
  assert.equal(repo.getTenantDocument(record.id, replacement.id), null);
  assert.equal(repo.listTenantDocuments(replacement.id).length, 0);
  const historic = register(repo, { fileName:'d09-exit-demo.pdf' });
  assert.equal(historic.tenancyId, 6, 'Management can retain metadata for an ended agreement');
});

test('plaza rules use current membership, including new arrivals but excluding former occupants', async () => {
  const repo = await fresh();
  const rules = register(repo, { title:'Building rules', category:'rules', scope:'plaza', tenancyId:undefined, fileName:'rules-demo.pdf', visibility:'plaza' });
  assert.equal(repo.listTenantDocuments(6).length, 1);
  repo.endTenancy(6, 'Moved out');
  repo.removeTenant(6);
  const replacement = repo.addTenant({ name:'New occupant', shop:'D-09', business:'Retail', rent:500000, start:'2026-11-03', expires:'2027-11-03' });
  assert.equal(repo.getTenantDocument(rules.id, 6), null);
  assert.equal(repo.getTenantDocument(rules.id, replacement.id).title, 'Building rules');
  assert.equal(repo.getTenantDocument(rules.id, 999), null);
});

test('scope, audience, filenames and text validate atomically before assigning an ID', async () => {
  const repo = await fresh();
  for (const details of [
    { title:'' }, { title:' ' }, { title:'x'.repeat(121) }, { title:123 }, { category:'missing' },
    { scope:'missing' }, { scope:'plaza', tenancyId:undefined }, { scope:'plaza', category:'rules' },
    { visibility:'plaza' }, { visibility:'unknown' }, { tenancyId:999 }, { plazaId:2 }, { plazaId:999 },
    { fileName:'' }, { fileName:'..' }, { fileName:'C:\\private.pdf' }, { fileName:'../private.pdf' },
    { fileName:'https://example.com/file.pdf' }, { fileName:'javascript:alert(1)' }, { fileName:'x'.repeat(161) },
    { fileName:'bad\nfile.pdf' }, { description:'x'.repeat(2001) }, { description:123 },
  ]) assert.throws(() => register(repo, details));
  assert.equal(repo.listDocuments().length, 0);
  assert.equal(register(repo).id, 1);
});

test('duplicate active filenames reject per scope and a withdrawn replacement gets a new identity', async () => {
  const repo = await fresh();
  const first = register(repo);
  assert.throws(() => register(repo, { fileName:' D09-DEMO.PDF ' }), /already exists/);
  const other = register(repo, { tenancyId:7 });
  assert.notEqual(other.id, first.id);
  repo.withdrawDocument(first.id, 'Superseded sample');
  const replacement = register(repo);
  assert.notEqual(replacement.id, first.id);
  assert.equal(repo.getDocument(first.id).status, 'withdrawn');
});

test('visibility changes revoke tenant lookup immediately and retain copied history', async () => {
  const repo = await fresh();
  const record = register(repo);
  repo.setDocumentVisibility(record.id, 'tenant');
  assert.ok(repo.getTenantDocument(record.id, 6));
  repo.setDocumentVisibility(record.id, 'tenant');
  assert.equal(repo.getDocument(record.id).visibilityHistory.length, 2);
  repo.setDocumentVisibility(record.id, 'management');
  assert.equal(repo.getTenantDocument(record.id, 6), null);
  const copy = repo.getDocument(record.id);
  copy.title = 'Changed';
  copy.visibilityHistory[0].to = 'tenant';
  repo.listDocuments()[0].visibilityHistory.push({ to:'tenant' });
  assert.equal(repo.getDocument(record.id).title, 'D-09 sample lease');
  assert.equal(repo.getDocument(record.id).visibilityHistory.length, 3);
  assert.equal(repo.getDocument(record.id).visibilityHistory[0].to, 'management');
  assert.throws(() => repo.setDocumentVisibility(record.id, 'plaza'), /permitted/);
});

test('withdrawal requires a reason, removes tenant visibility and preserves admin history', async () => {
  const repo = await fresh();
  const record = register(repo, { visibility:'tenant' });
  assert.throws(() => repo.withdrawDocument(record.id, ''), /withdrawal reason/);
  assert.throws(() => repo.withdrawDocument(record.id, 'x'.repeat(501)), /withdrawal reason/);
  const withdrawn = repo.withdrawDocument(record.id, 'Superseded by corrected metadata');
  assert.equal(repo.getTenantDocument(record.id, 6), null);
  assert.equal(repo.listTenantDocuments(6).length, 0);
  assert.equal(repo.getDocument(record.id).withdrawalReason, 'Superseded by corrected metadata');
  assert.deepEqual(repo.withdrawDocument(record.id, 'Repeated click'), withdrawn);
  assert.throws(() => repo.setDocumentVisibility(record.id, 'tenant'), /Withdrawn/);
});

test('plazas with identical shop labels cannot share document identities or tenant lookup', async () => {
  const { createDemoData } = await import('../js/data/demo-data.js');
  const { createRepository } = await import('../js/data/repository.js');
  const data = createDemoData();
  data.tenants.push({ id:99, plazaId:2, name:'Other plaza occupant', archived:false });
  data.units.push({ id:99, plazaId:2, number:'D-09' });
  data.tenancies.push({ id:99, plazaId:2, tenantId:99, unitId:99, status:'active' });
  const repo = createRepository(data);
  const record = register(repo, { plazaId:2, tenancyId:99, visibility:'tenant' });
  assert.equal(repo.listDocuments().length, 0);
  assert.equal(repo.getDocument(record.id), null);
  assert.equal(repo.getTenantDocument(record.id, 6, 2), null);
  assert.ok(repo.getTenantDocument(record.id, 99, 2));
  assert.throws(() => repo.setDocumentVisibility(record.id, 'management', 1), /this plaza/);
  assert.throws(() => repo.withdrawDocument(record.id, 'Reason', 1), /this plaza/);
  assert.throws(() => register(repo, { tenancyId:99 }), /this plaza/);
});

test('metadata snapshots survive profile and term edits without modifying financial records', async () => {
  const repo = await fresh();
  const before = JSON.stringify([repo.listInvoices(), repo.listPayments(), repo.listReceipts()]);
  const record = register(repo, { visibility:'tenant' });
  repo.updateTenant(6, { name:'Renamed Boutique' });
  repo.updateTenancy(6, { rent:510000 });
  assert.equal(repo.getDocument(record.id).tenant, 'Funmi Boutique');
  repo.getTenantDocument(record.id, 6).title = 'Changed';
  assert.equal(repo.getDocument(record.id).title, 'D-09 sample lease');
  assert.equal(JSON.stringify([repo.listInvoices(), repo.listPayments(), repo.listReceipts()]), before);
});

test('repositories have independent document records', async () => {
  const first = await fresh(), second = await fresh();
  register(first);
  assert.equal(second.listDocuments().length, 0);
});

test('admin registers real form values and tenant only sees the record after explicit sharing', async () => {
  const { run, element, fill } = await demo();
  fill();
  run('openManageTenancies(6);');
  assert.match(run('modal.body'), /openRegisterDocument\(6\)/);
  run('openRegisterDocument(6);');
  assert.match(run('modal.body'), /value="6" selected/);
  run('saveDocumentRecord({preventDefault(){globalThis.prevented=true;}});');
  assert.equal(run('prevented'), true);
  assert.match(element('admin-document-list').innerHTML, /D-09 sample lease/);
  assert.match(run('modal.body'), /No file exists|no file exists/);
  run("session.role='tenant'; renderTenantDocuments(); globalThis.modal=null; openDocumentRecord(1);");
  assert.equal(run('modal'), null);
  assert.match(element('tenant-document-list').innerHTML, /No permitted/);
  element('document-visibility-choice').value = 'tenant';
  run("session.role='admin'; openDocumentVisibility(1); saveDocumentVisibility(1); session.role='tenant'; renderTenantDocuments(); openDocumentRecord(1);");
  assert.match(element('tenant-document-list').innerHTML, /d09-demo.pdf/);
  assert.match(run('modal.body'), /Funmi Boutique/);
  assert.doesNotMatch(run('modal.body'), /Demo visibility history/);
});

test('scope changes reset visibility and plaza records do not carry a hidden tenancy target', async () => {
  const { run, element, fill } = await demo();
  fill({ 'document-record-scope':'plaza', 'document-record-category':'rules', 'document-record-visibility':'tenant' });
  run('updateDocumentScope();');
  assert.equal(element('document-record-visibility').value, 'management');
  assert.equal(element('document-record-tenancy-group').hidden, true);
  assert.equal(element('document-record-tenancy').disabled, true);
  element('document-record-visibility').value = 'plaza';
  run('saveDocumentRecord();');
  assert.equal(run('repository.getDocument(1).tenancyId'), null);
  assert.equal(run('repository.listTenantDocuments(6).length'), 1);
});

test('search/category/status filters preserve actions while tenant search excludes private metadata', async () => {
  const { run, element, fill } = await demo();
  fill({ 'document-record-visibility':'tenant' });
  run("saveDocumentRecord(); repository.registerDocument({title:'PRIVATE-TITLE',category:'other',scope:'tenancy',tenancyId:6,fileName:'secret.pdf'}); repository.registerDocument({title:'OTHER-TENANT',category:'lease',scope:'tenancy',tenancyId:7,visibility:'tenant',fileName:'other.pdf'});");
  element('admin-document-search').value = 'd09';
  element('admin-document-category').value = 'lease';
  run('renderAdminDocuments();');
  assert.match(element('admin-document-list').innerHTML, /openDocumentRecord\(1\)/);
  assert.doesNotMatch(element('admin-document-list').innerHTML, /PRIVATE-TITLE|OTHER-TENANT/);
  run("session.role='tenant'; renderTenantDocuments();");
  assert.match(element('tenant-document-summary').textContent, /1 permitted/);
  assert.doesNotMatch(element('tenant-document-list').innerHTML, /PRIVATE-TITLE|OTHER-TENANT/);
  element('tenant-document-search').value = 'PRIVATE-TITLE';
  run('renderTenantDocuments();');
  assert.match(element('tenant-document-summary').textContent, /0 shown/);
  assert.doesNotMatch(element('tenant-document-list').innerHTML, /PRIVATE-TITLE/);
});

test('withdrawal form validates the reason and stale tenant detail lookup fails after withdrawal', async () => {
  const { run, element, fill } = await demo();
  fill({ 'document-record-visibility':'tenant' });
  run('saveDocumentRecord(); openWithdrawDocument(1); withdrawDocument(1);');
  assert.equal(run('repository.getDocument(1).status'), 'active');
  element('document-withdraw-reason').value = 'Replaced sample';
  run('withdrawDocument(1);');
  assert.equal(run('repository.getDocument(1).status'), 'withdrawn');
  element('admin-document-status').value = 'withdrawn';
  run('renderAdminDocuments();');
  assert.match(element('admin-document-list').innerHTML, /Withdrawn/);
  run("session.role='tenant'; renderTenantDocuments(); globalThis.modal=null; openDocumentRecord(1);");
  assert.equal(run('modal'), null);
  assert.doesNotMatch(element('tenant-document-list').innerHTML, /d09-demo.pdf/);
});

test('role presentation blocks document mutations and platform-admin operational lookup', async () => {
  const { run, element, fill } = await demo();
  fill();
  run("session.role='tenant'; saveDocumentRecord(); session.role='super'; saveDocumentRecord(); openRegisterDocument();");
  assert.equal(run('repository.listDocuments().length'), 0);
  run("session.role='admin'; saveDocumentRecord(); session.role='tenant'; saveDocumentVisibility(1); withdrawDocument(1); session.role='super'; saveDocumentVisibility(1); withdrawDocument(1); globalThis.modal=null; openDocumentRecord(1);");
  assert.equal(run('modal'), null);
  assert.equal(run('repository.getDocument(1).visibility'), 'management');
  assert.equal(run('repository.getDocument(1).status'), 'active');
  assert.equal(element('document-record-title').value, 'D-09 sample lease');
});

test('document values render as escaped text and invalid drafts are retained', async () => {
  const { run, element, fill } = await demo();
  fill({ 'document-record-title':'<script>Title</script>', 'document-record-description':'Line one\n<img src=x onerror=alert(1)>', 'document-record-filename':'../invalid.pdf' });
  run('saveDocumentRecord();');
  assert.equal(run('repository.listDocuments().length'), 0);
  assert.equal(element('document-record-title').value, '<script>Title</script>');
  element('document-record-filename').value = 'safe-demo.pdf';
  run('saveDocumentRecord();');
  assert.match(run('modal.body'), /&lt;script&gt;Title/);
  assert.match(run('modal.body'), /Line one\n&lt;img/);
  assert.doesNotMatch(run('modal.body'), /<script>|<img/);
});

test('new document routes have labels and lease placeholders no longer claim downloads or email', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /id="page-admin-documents"/);
  assert.match(html, /id="page-tenant-documents"/);
  for (const id of ['admin-document-search', 'tenant-document-search', 'admin-document-status']) assert.match(html, new RegExp(`for="${id}"`));
  assert.doesNotMatch(html, /A copy has been sent to your email|Download PDF|Renewal request submitted|Either party may terminate this lease/);
});
