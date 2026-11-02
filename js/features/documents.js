import { DEMO_PLAZA_ID, DEMO_TENANT_ID } from '../data/demo-data.js';
import { DOCUMENT_CATEGORIES } from '../data/documents.js';
import { escapeHtml, formatDate } from '../utils.js';

const visibilityLabel = value => ({ management:'Management only', tenant:'Original tenancy tenant', plaza:'Current plaza tenants' })[value] || value;
const visibilityOptions = (scope, current = 'management') => ['management', scope === 'tenancy' ? 'tenant' : 'plaza'].map(value => `<option value="${value}" ${value === current ? 'selected' : ''}>${visibilityLabel(value)}</option>`).join('');
export function createDocumentActions({ repository, ui, getRole }) {
  const run = operation => { try { operation(); } catch (error) { ui.showToast(error.message, 'error'); } };
  const scoped = id => getRole() === 'admin' ? repository.getDocument(id) : getRole() === 'tenant' ? repository.getTenantDocument(id, DEMO_TENANT_ID) : null;
  const refresh = () => { renderAdminDocuments(); renderTenantDocuments(); };
  const matches = (record, prefix) => {
    const query = document.getElementById(`${prefix}-document-search`)?.value.trim().toLowerCase() || '';
    const category = document.getElementById(`${prefix}-document-category`)?.value || 'all';
    return (category === 'all' || record.category === category) && [record.number, record.title, record.fileName, record.tenant, record.unit, DOCUMENT_CATEGORIES[record.category]].join(' ').toLowerCase().includes(query);
  };
  function renderAdminDocuments() {
    if (getRole() !== 'admin') return;
    const list = document.getElementById('admin-document-list');
    if (!list) return;
    const status = document.getElementById('admin-document-status')?.value || 'active';
    const records = repository.listDocuments();
    const shown = records.filter(record => (status === 'all' || record.status === status) && matches(record, 'admin')).reverse();
    const summary = document.getElementById('admin-document-summary');
    if (summary) summary.textContent = `${shown.length} shown · ${records.length} demo metadata records`;
    list.innerHTML = shown.map(record => `<article class="announcement-card"><h3>${escapeHtml(record.title)}</h3><p>${escapeHtml(record.number)} · ${DOCUMENT_CATEGORIES[record.category]} · ${record.scope === 'tenancy' ? `${escapeHtml(record.tenant)} / Shop ${escapeHtml(record.unit)}` : 'Plaza-wide'}</p><p>${escapeHtml(record.fileName)} · ${visibilityLabel(record.visibility)} · ${record.status === 'withdrawn' ? 'Withdrawn' : 'Active'}</p><div class="flex gap-8 wrap"><button class="btn btn-sm btn-ghost" onclick="openDocumentRecord(${record.id})">View record</button>${record.status === 'active' ? `<button class="btn btn-sm btn-ghost" onclick="openDocumentVisibility(${record.id})">Change visibility</button><button class="btn btn-sm btn-red" onclick="openWithdrawDocument(${record.id})">Withdraw</button>` : ''}</div></article>`).join('') || '<p>No document records match. Register a sample record or adjust the filters.</p>';
  }
  function renderTenantDocuments() {
    if (getRole() !== 'tenant') return;
    const list = document.getElementById('tenant-document-list');
    if (!list) return;
    // Filter permitted records first, so search/counts cannot reveal private metadata.
    const records = repository.listTenantDocuments(DEMO_TENANT_ID);
    const shown = records.filter(record => matches(record, 'tenant')).reverse();
    const summary = document.getElementById('tenant-document-summary');
    if (summary) summary.textContent = `${shown.length} shown · ${records.length} permitted demo records`;
    list.innerHTML = shown.map(record => `<article class="announcement-card"><h3>${escapeHtml(record.title)}</h3><p>${DOCUMENT_CATEGORIES[record.category]} · ${record.scope === 'tenancy' ? `Shop ${escapeHtml(record.unit)} · Tenancy #${record.tenancyId}` : 'Plaza-wide rules / information'}</p><p>${escapeHtml(record.fileName)} · Metadata only</p><button class="btn btn-sm btn-ghost" onclick="openDocumentRecord(${record.id})">View record</button></article>`).join('') || '<p>No permitted document records match. Management must share a record with you before it appears here.</p>';
  }
  function openRegisterDocument(preferredTenancyId = 0) {
    if (getRole() !== 'admin') return;
    const tenancies = repository.listTenancies();
    if (preferredTenancyId && !tenancies.some(tenancy => tenancy.id === preferredTenancyId)) return;
    ui.openModal('Register Demo Document Metadata', `<form id="document-record-form" onsubmit="saveDocumentRecord(event); return false;">
      <div class="form-group mb-16"><label class="form-label" for="document-record-title">Title</label><input class="form-input" id="document-record-title" required maxlength="120" placeholder="e.g. D-09 sample lease record"></div>
      <div class="form-group mb-16"><label class="form-label" for="document-record-category">Category</label><select class="form-input" id="document-record-category">${Object.entries(DOCUMENT_CATEGORIES).map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></div>
      <div class="form-group mb-16"><label class="form-label" for="document-record-scope">Record scope</label><select class="form-input" id="document-record-scope" onchange="updateDocumentScope()"><option value="tenancy">Specific tenancy</option><option value="plaza">Plaza-wide information</option></select></div>
      <div class="form-group mb-16" id="document-record-tenancy-group"><label class="form-label" for="document-record-tenancy">Tenant / shop agreement</label><select class="form-input" id="document-record-tenancy">${tenancies.map(tenancy => `<option value="${tenancy.id}" ${tenancy.id === preferredTenancyId ? 'selected' : ''}>${escapeHtml(repository.getTenant(tenancy.tenantId).name)} · ${escapeHtml(repository.getUnit(tenancy.unitId).number)} · ${escapeHtml(tenancy.status)}</option>`).join('')}</select></div>
      <div class="form-group mb-16"><label class="form-label" for="document-record-visibility">Visibility</label><select class="form-input" id="document-record-visibility">${visibilityOptions('tenancy')}</select></div>
      <div class="form-group mb-16"><label class="form-label" for="document-record-filename">Example filename (metadata only)</label><input class="form-input" id="document-record-filename" required maxlength="160" placeholder="d09-lease-demo.pdf"></div>
      <div class="form-group mb-16"><label class="form-label" for="document-record-description">Description shown with the record (optional)</label><textarea class="form-input" id="document-record-description" rows="3" maxlength="2000"></textarea></div>
      <p class="maint-meta mb-16">Use made-up details only. No file is uploaded or stored. Visibility defaults to management only and resets when scope changes. Lease records require a specific tenancy; shared tenancy records stay with its original tenant. Shared plaza records are available to current tenants, including future arrivals.</p>
      <button type="submit" class="btn btn-primary">Register metadata</button></form>`, '<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button>');
  }
  function updateDocumentScope() {
    if (getRole() !== 'admin') return;
    const scope = document.getElementById('document-record-scope')?.value;
    const group = document.getElementById('document-record-tenancy-group');
    if (group) group.hidden = scope !== 'tenancy';
    const tenancy = document.getElementById('document-record-tenancy');
    if (tenancy) tenancy.disabled = scope !== 'tenancy';
    const visibility = document.getElementById('document-record-visibility');
    if (visibility) { visibility.innerHTML = visibilityOptions(scope); visibility.value = 'management'; }
  }
  function saveDocumentRecord(event) {
    event?.preventDefault();
    if (getRole() !== 'admin') return;
    run(() => {
      const scope = document.getElementById('document-record-scope')?.value;
      const record = repository.registerDocument({ plazaId:DEMO_PLAZA_ID, scope,
        tenancyId:scope === 'tenancy' ? Number(document.getElementById('document-record-tenancy')?.value) : undefined,
        title:document.getElementById('document-record-title')?.value, category:document.getElementById('document-record-category')?.value,
        fileName:document.getElementById('document-record-filename')?.value, description:document.getElementById('document-record-description')?.value,
        visibility:document.getElementById('document-record-visibility')?.value });
      for (const [id,value] of [['admin-document-search',''], ['admin-document-category','all'], ['admin-document-status','active']]) {
        const field = document.getElementById(id); if (field) field.value = value;
      }
      refresh(); openDocumentRecord(record.id);
      ui.showToast('Demo metadata registered. No file was uploaded.', 'success');
    });
  }
  function openDocumentRecord(id) {
    const record = scoped(id);
    if (!record) { ui.showToast('Document record is not available in this view.', 'error'); return; }
    const management = getRole() === 'admin';
    ui.openModal(`Demo Document ${record.number}`, `<h3>${escapeHtml(record.title)}</h3><div class="lease-card">
      <p>${DOCUMENT_CATEGORIES[record.category]} · ${record.scope === 'tenancy' ? `${escapeHtml(record.tenant)} · Shop ${escapeHtml(record.unit)} · Tenancy #${record.tenancyId}` : 'Plaza-wide information'}</p>
      <p>Example filename: ${escapeHtml(record.fileName)}</p><p>Registered ${formatDate(record.createdAt.slice(0,10))}</p><p>Visibility: ${visibilityLabel(record.visibility)}</p></div>
      <p class="announcement-message">${escapeHtml(record.description || 'No description provided.')}</p>
      ${management && record.status === 'withdrawn' ? `<p class="announcement-message">Withdrawn ${formatDate(record.withdrawnAt.slice(0,10))}: ${escapeHtml(record.withdrawalReason)}</p>` : ''}
      ${management ? `<details><summary>Demo visibility history</summary><ul>${record.visibilityHistory.map(event => `<li>${event.from ? visibilityLabel(event.from) : 'Registered'} → ${visibilityLabel(event.to)} · ${formatDate(event.changedAt.slice(0,10))}</li>`).join('')}</ul></details>` : ''}
      <p class="maint-meta">Metadata only: no file exists here to preview, download or email. This is not an uploaded or signed document. Real files require authenticated server access and secure storage.</p>`);
  }
  function openDocumentVisibility(id) {
    if (getRole() !== 'admin') return;
    const record = repository.getDocument(id);
    if (!record || record.status !== 'active') return;
    ui.openModal('Change Demo Document Visibility', `<p>${escapeHtml(record.title)} · ${escapeHtml(record.fileName)}</p><div class="form-group"><label class="form-label" for="document-visibility-choice">Visibility</label><select class="form-input" id="document-visibility-choice">${visibilityOptions(record.scope, record.visibility)}</select></div><p class="maint-meta">${record.scope === 'tenancy' ? `Shared access is limited to the original tenant for agreement #${record.tenancyId}. A new shop occupant does not inherit it.` : 'Shared plaza information is visible to current assigned tenants, including later arrivals, until withdrawn or made management-only.'} These are demo presentation rules.</p>`,
      `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="saveDocumentVisibility(${id})">Save visibility</button>`);
  }
  function saveDocumentVisibility(id) {
    if (getRole() !== 'admin') return;
    run(() => {
      repository.setDocumentVisibility(id, document.getElementById('document-visibility-choice')?.value);
      refresh(); openDocumentRecord(id); ui.showToast('Demo visibility updated.', 'success');
    });
  }
  function openWithdrawDocument(id) {
    if (getRole() !== 'admin') return;
    const record = repository.getDocument(id);
    if (!record || record.status !== 'active') return;
    ui.openModal('Withdraw Demo Document Record', `<p>${escapeHtml(record.title)} · ${escapeHtml(record.fileName)}</p><p>Withdrawal removes this record from tenant views and retains its admin history.</p><div class="form-group"><label class="form-label" for="document-withdraw-reason">Reason</label><textarea class="form-input" id="document-withdraw-reason" rows="3" maxlength="500"></textarea></div>`,
      `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-red" onclick="withdrawDocument(${id})">Confirm withdrawal</button>`);
  }
  function withdrawDocument(id) {
    if (getRole() !== 'admin') return;
    run(() => {
      repository.withdrawDocument(id, document.getElementById('document-withdraw-reason')?.value);
      refresh(); openDocumentRecord(id); ui.showToast('Record withdrawn from tenant views; admin history retained.', 'success');
    });
  }
  return { renderAdminDocuments, renderTenantDocuments, openRegisterDocument, updateDocumentScope, saveDocumentRecord,
    openDocumentRecord, openDocumentVisibility, saveDocumentVisibility, openWithdrawDocument, withdrawDocument };
}
