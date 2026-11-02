import { DEMO_PLAZA_ID } from '../data/demo-data.js';
import { escapeHtml, formatNaira, formatDate } from '../utils.js';

export function createTenancyActions({ repository, ui, refresh, getRole }) {
  const allowed = () => getRole() === 'admin';
  const scopedTenant = id => {
    const tenant = repository.getTenant(id);
    return tenant?.plazaId === DEMO_PLAZA_ID ? tenant : null;
  };
  const scopedTenancy = id => {
    const tenancy = repository.getTenancy(id);
    return tenancy?.plazaId === DEMO_PLAZA_ID ? tenancy : null;
  };
  const finish = (tenantId, message) => {
    refresh();
    openManageTenancies(tenantId);
    ui.showToast(message, 'success');
  };
  const runChange = operation => {
    try { operation(); } catch (error) { ui.showToast(error.message, 'error'); }
  };

  function openManageTenancies(tenantId) {
    if (!allowed()) return;
    const tenant = scopedTenant(tenantId);
    if (!tenant) return;
    const history = repository.listTenancies(tenantId);
    const cards = [...history].reverse().map(tenancy => {
      const unit = repository.getUnit(tenancy.unitId);
      return `<article class="lease-card mb-16">
        <div class="flex justify-between mb-8"><strong>Shop ${escapeHtml(unit.number)}</strong><span class="badge ${tenancy.status === 'active' ? 'badge-blue' : 'badge-gray'}">${tenancy.status === 'active' ? 'Occupied' : escapeHtml(tenancy.status)}</span></div>
        <p>${formatNaira(tenancy.rent)} annual rent · ${formatDate(tenancy.start)} – ${formatDate(tenancy.expires)}</p>
        <button class="btn btn-sm btn-ghost" onclick="openRegisterDocument(${tenancy.id})">Register document metadata</button>
        ${tenancy.status !== 'active' ? `<p class="maint-description">Closed ${formatDate(tenancy.endedAt)}: ${escapeHtml(tenancy.endReason)}</p>` : `<div class="flex gap-8 wrap" style="margin-top:12px;"><button class="btn btn-sm btn-ghost" onclick="openEditTenancy(${tenancy.id})">Edit terms</button><button class="btn btn-sm btn-ghost" onclick="openPublishRentAdjustment(${tenancy.id})">Issue rent notice</button><button class="btn btn-sm btn-red" onclick="openEndTenancy(${tenancy.id})">End assignment</button></div>`}
      </article>`;
    }).join('') || '<p class="maint-desc">No shop assignments yet.</p>';
    ui.openModal(`Shop history — ${tenant.name}`, cards,
      `<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button>${!tenant.archived ? `<button class="btn btn-primary" onclick="openAssignTenancy(${tenant.id})">Assign another shop</button>` : ''}`);
  }

  function openAssignTenancy(tenantId = 0, preferredUnitId = 0) {
    if (!allowed()) return;
    const tenants = repository.listTenants().filter(tenant => !tenant.archived);
    const available = repository.listUnits().filter(unit => !repository.listActiveTenancies().some(tenancy => tenancy.unitId === unit.id));
    if (!tenants.length || !available.length) { ui.showToast('An active tenant profile and a vacant shop are required.', 'error'); return; }
    ui.openModal('Assign Shop to Existing Tenant', `
      <div class="form-group mb-16"><label class="form-label" for="assignment-tenant">Tenant</label><select class="form-input" id="assignment-tenant"><option value="">Choose a tenant</option>${tenants.map(tenant => `<option value="${tenant.id}" ${tenant.id === tenantId ? 'selected' : ''}>${escapeHtml(tenant.name)}</option>`).join('')}</select></div>
      <div class="form-group mb-16"><label class="form-label" for="assignment-unit">Vacant shop</label><select class="form-input" id="assignment-unit">${available.map(unit => `<option value="${unit.id}" ${unit.id === preferredUnitId ? 'selected' : ''}>${escapeHtml(unit.number)}</option>`).join('')}</select></div>
      ${termsForm('assignment')}`,
      '<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="saveAssignment()">Assign shop</button>');
  }

  function termsForm(prefix, tenancy = {}) {
    return `<div class="form-group mb-16"><label class="form-label" for="${prefix}-rent">Annual rent (₦)</label><input class="form-input" id="${prefix}-rent" type="number" min="1" value="${tenancy.rent ?? ''}"></div>
      <div class="form-grid-2"><div class="form-group"><label class="form-label" for="${prefix}-start">Lease start</label><input class="form-input" id="${prefix}-start" type="date" value="${tenancy.start || ''}"></div><div class="form-group"><label class="form-label" for="${prefix}-end">Lease end</label><input class="form-input" id="${prefix}-end" type="date" value="${tenancy.expires || ''}"></div></div>`;
  }
  function readTerms(prefix) {
    return { rent:Number(document.getElementById(`${prefix}-rent`).value), start:document.getElementById(`${prefix}-start`).value, expires:document.getElementById(`${prefix}-end`).value };
  }
  function saveAssignment() {
    if (!allowed()) return;
    runChange(() => {
      const tenantId = Number(document.getElementById('assignment-tenant').value);
      if (!scopedTenant(tenantId)) throw new Error('Choose a tenant in this plaza.');
      repository.assignTenancy({ tenantId, unitId:Number(document.getElementById('assignment-unit').value), plazaId:DEMO_PLAZA_ID, ...readTerms('assignment') });
      finish(tenantId, 'Shop assigned for this demo session.');
    });
  }
  function openEditTenancy(id) {
    if (!allowed()) return;
    const tenancy = scopedTenancy(id);
    if (!tenancy || tenancy.status !== 'active') return;
    ui.openModal('Correct Current Tenancy Terms', `${termsForm('tenancy', tenancy)}<p class="maint-meta">Correct demo terms here. Use Issue Rent Notice for a planned rent change. Correcting rent or dates blocks application of an existing open notice until it is cancelled and replaced. Recorded payments are unchanged. Ended agreements are read-only.</p>`,
      `<button class="btn btn-ghost" onclick="openManageTenancies(${tenancy.tenantId})">Cancel</button><button class="btn btn-primary" onclick="saveTenancyTerms(${id})">Save terms</button>`);
  }
  function saveTenancyTerms(id) {
    if (!allowed() || !scopedTenancy(id)) return;
    runChange(() => {
      const tenancy = repository.updateTenancy(id, readTerms('tenancy'));
      finish(tenancy.tenantId, 'Demo tenancy terms updated.');
    });
  }
  function openEndTenancy(id) {
    if (!allowed()) return;
    const tenancy = scopedTenancy(id);
    if (!tenancy || tenancy.status !== 'active') return;
    ui.openModal('End Shop Assignment', `<p>Ending this assignment makes shop ${escapeHtml(repository.getUnit(tenancy.unitId).number)} available immediately. The agreement, payments, and maintenance history are retained.</p><p class="maint-meta">A future-starting assignment will be marked cancelled.</p><div class="form-group"><label class="form-label" for="tenancy-end-reason">Reason</label><textarea class="form-input" id="tenancy-end-reason" maxlength="500" rows="3"></textarea></div>`,
      `<button class="btn btn-ghost" onclick="openManageTenancies(${tenancy.tenantId})">Cancel</button><button class="btn btn-red" onclick="endTenancy(${id})">End assignment now</button>`);
  }
  function endTenancy(id) {
    if (!allowed() || !scopedTenancy(id)) return;
    runChange(() => {
      const tenancy = repository.endTenancy(id, document.getElementById('tenancy-end-reason').value);
      finish(tenancy.tenantId, 'Assignment closed. Shop is now vacant.');
    });
  }
  return { openManageTenancies, openAssignTenancy, saveAssignment, openEditTenancy, saveTenancyTerms, openEndTenancy, endTenancy };
}
