import { DEMO_PLAZA_ID, DEMO_TENANT_ID } from '../data/demo-data.js';
import { escapeHtml, formatDate, formatNaira } from '../utils.js';

export function createRentAdjustmentActions({ repository, ui, getRole, refresh, updateIndicators }) {
  const scoped = id => {
    const notice = repository.getRentAdjustment(id);
    return notice && (getRole() === 'admin' || (getRole() === 'tenant' && notice.tenantId === DEMO_TENANT_ID)) ? notice : null;
  };
  const stateLabel = notice => ({ scheduled:'Scheduled — rent unchanged', ready:'Ready for management application', blocked:'Blocked — agreement changed', applied:'Applied in demo', cancelled:'Cancelled' })[notice.state];
  const status = notice => `<span class="badge badge-${notice.state === 'applied' ? 'green' : notice.state === 'cancelled' ? 'gray' : 'orange'}">${stateLabel(notice)}</span>`;
  const run = operation => { try { operation(); } catch (error) { ui.showToast(error.message, 'error'); } };
  const summary = notice => `<h3>${escapeHtml(notice.number)} · Shop ${escapeHtml(notice.unit)}</h3><p>${escapeHtml(notice.tenant)}</p>
    <p>${formatNaira(notice.oldRent)} → ${formatNaira(notice.newRent)} annual rent · Effective ${formatDate(notice.effectiveDate)}</p><p>${status(notice)}</p>`;
  function openPublishRentAdjustment(preferredId = 0) {
    if (getRole() !== 'admin') return;
    const tenancies = repository.listActiveTenancies().filter(tenancy => !repository.getTenant(tenancy.tenantId).archived);
    if (!tenancies.length) { ui.showToast('Assign a shop before publishing a rent notice.', 'error'); return; }
    if (preferredId && !tenancies.some(tenancy => tenancy.id === preferredId)) return;
    ui.openModal('Publish Demo Rent Adjustment', `<form id="rent-notice-form" onsubmit="publishRentAdjustment(event); return false;">
      <div class="form-group mb-16"><label class="form-label" for="rent-notice-tenancy">Tenant / shop agreement</label><select class="form-input" id="rent-notice-tenancy" onchange="updateRentAdjustmentPreview()">${tenancies.map(tenancy => `<option value="${tenancy.id}" ${tenancy.id === preferredId ? 'selected' : ''}>${escapeHtml(repository.getTenant(tenancy.tenantId).name)} · ${escapeHtml(repository.getUnit(tenancy.unitId).number)}</option>`).join('')}</select></div>
      <p class="maint-meta mb-16" id="rent-notice-current" aria-live="polite"></p>
      <div class="form-group mb-16"><label class="form-label" for="rent-notice-new">New annual rent (₦)</label><input class="form-input" id="rent-notice-new" type="number" min="0.01" step="0.01" required></div>
      <div class="form-group mb-16"><label class="form-label" for="rent-notice-date">Future effective date</label><input class="form-input" id="rent-notice-date" type="date" required></div>
      <div class="form-group mb-16"><label class="form-label" for="rent-notice-days">Minimum advance days required by your demo policy</label><input class="form-input" id="rent-notice-days" type="number" min="1" max="3650" step="1" required><p class="maint-meta">Enter an explicit demo requirement. No legal or contractual notice period is assumed.</p></div>
      <div class="form-group mb-16"><label class="form-label" for="rent-notice-reason">Reason / explanation to tenant</label><textarea class="form-input" id="rent-notice-reason" rows="4" maxlength="1000" required></textarea></div>
      <p class="maint-meta mb-16">Publishing leaves current rent unchanged. Management must apply the notice on or after its effective date. Issued invoices, fees, payments and receipts are unchanged. This is a demo notice, not proof of delivery, agreement, or a lease renewal.</p>
      <button type="submit" class="btn btn-primary">Publish demo rent notice</button></form>`,
      '<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button>');
    updateRentAdjustmentPreview();
  }
  function updateRentAdjustmentPreview() {
    if (getRole() !== 'admin') return;
    const tenancy = repository.getTenancy(Number(document.getElementById('rent-notice-tenancy')?.value));
    const label = document.getElementById('rent-notice-current');
    if (label) label.textContent = tenancy?.plazaId === DEMO_PLAZA_ID ? `Current annual rent: ${formatNaira(tenancy.rent)}. Increases and decreases are supported.` : 'Choose an agreement in this plaza.';
  }
  function publishRentAdjustment(event) {
    event?.preventDefault();
    if (getRole() !== 'admin') return;
    run(() => {
      const notice = repository.publishRentAdjustment({ plazaId:DEMO_PLAZA_ID,
        tenancyId:Number(document.getElementById('rent-notice-tenancy')?.value),
        newRent:Number(document.getElementById('rent-notice-new')?.value), effectiveDate:document.getElementById('rent-notice-date')?.value,
        minimumNoticeDays:Number(document.getElementById('rent-notice-days')?.value), reason:document.getElementById('rent-notice-reason')?.value });
      refresh(); openRentAdjustmentNotice(notice.id);
      ui.showToast('Demo rent notice published. Current rent and issued invoices are unchanged.', 'success');
    });
  }
  function openRentAdjustmentNotice(id) {
    const notice = scoped(id);
    if (!notice) return;
    const actions = getRole() === 'admin' && notice.status === 'scheduled' ? `<button class="btn btn-red" onclick="openCancelRentAdjustment(${id})">Cancel notice</button><button class="btn btn-primary" onclick="applyRentAdjustment(${id})" ${notice.canApply ? '' : 'disabled'}>Apply new rent now</button>` : '';
    ui.openModal(`Demo Rent Notice ${notice.number}`, `${summary(notice)}
      <p>Published ${formatDate(notice.noticeDate)} · ${notice.advanceDays} calendar days in advance · Entered minimum ${notice.minimumNoticeDays} days</p>
      <p class="announcement-message">${escapeHtml(notice.reason)}</p>
      ${notice.applicationMessage ? `<p class="maint-meta">${escapeHtml(notice.applicationMessage)}</p>` : ''}
      ${notice.appliedAt ? `<p>Applied ${formatDate(notice.appliedAt.slice(0, 10))}. Existing bills and receipts were retained.</p>` : ''}
      ${notice.cancelledAt ? `<p class="announcement-message">Cancelled ${formatDate(notice.cancelledAt.slice(0, 10))}: ${escapeHtml(notice.cancellationReason)}</p>` : ''}
      <p class="maint-meta">Demo only. Marking read is not acceptance or evidence of legally sufficient notice. The effective date does not extend the lease. No automatic billing, fee change or proration occurs.</p>`,
      `<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button>${actions}`);
  }
  function applyRentAdjustment(id) {
    if (getRole() !== 'admin' || !scoped(id)) return;
    run(() => {
      repository.applyRentAdjustment(id);
      refresh(); openRentAdjustmentNotice(id);
      ui.showToast('Demo annual rent updated once. Existing invoices and receipts are unchanged.', 'success');
    });
  }
  function openCancelRentAdjustment(id) {
    if (getRole() !== 'admin') return;
    const notice = scoped(id);
    if (!notice || notice.status !== 'scheduled') return;
    ui.openModal('Cancel Demo Rent Notice', `${summary(notice)}<div class="form-group"><label class="form-label" for="rent-notice-cancel-reason">Cancellation reason</label><textarea class="form-input" id="rent-notice-cancel-reason" rows="3" maxlength="500"></textarea></div><p class="maint-meta">The original notice and cancellation remain visible to its tenant. Current rent will be unchanged.</p>`,
      `<button class="btn btn-ghost" onclick="openRentAdjustmentNotice(${id})">Back</button><button class="btn btn-red" onclick="cancelRentAdjustment(${id})">Confirm cancellation</button>`);
  }
  function cancelRentAdjustment(id) {
    if (getRole() !== 'admin' || !scoped(id)) return;
    run(() => {
      repository.cancelRentAdjustment(id, document.getElementById('rent-notice-cancel-reason')?.value);
      refresh(); openRentAdjustmentNotice(id); ui.showToast('Demo notice cancelled; rent is unchanged.', 'success');
    });
  }
  function renderAdminRentAdjustments() {
    if (getRole() !== 'admin') return;
    const list = document.getElementById('admin-rent-notice-list');
    if (list) list.innerHTML = repository.listRentAdjustments().reverse().map(notice => `<article class="announcement-card">${summary(notice)}<p>${notice.readAt ? 'Current status marked read in demo' : 'Current status unread'}</p><button class="btn btn-sm btn-ghost" onclick="openRentAdjustmentNotice(${notice.id})">Review notice</button></article>`).join('') || '<p>No rent adjustment notices yet. Choose an agreement to record a future change.</p>';
    updateIndicators();
  }
  function renderTenantRentAdjustments() {
    if (getRole() !== 'tenant') return;
    const list = document.getElementById('tenant-rent-notice-list');
    if (list) list.innerHTML = repository.listTenantRentAdjustments(DEMO_TENANT_ID).reverse().map(notice => `<article class="announcement-card ${notice.readAt ? '' : 'announcement-unread'}">${summary(notice)}<button class="btn btn-sm btn-ghost" onclick="openRentAdjustmentNotice(${notice.id})">View notice</button> ${notice.readAt ? '<span class="badge badge-gray">Current status marked read</span>' : `<button class="btn btn-sm btn-ghost" onclick="markRentAdjustmentRead(${notice.id})">Mark as read</button>`}</article>`).join('') || '<p>No rent adjustment notices addressed to you.</p>';
    updateIndicators();
  }
  function markRentAdjustmentRead(id) {
    if (getRole() !== 'tenant' || !scoped(id)) return;
    run(() => { repository.markRentAdjustmentRead(id, DEMO_TENANT_ID); renderTenantRentAdjustments(); });
  }
  return { openPublishRentAdjustment, updateRentAdjustmentPreview, publishRentAdjustment, openRentAdjustmentNotice,
    applyRentAdjustment, openCancelRentAdjustment, cancelRentAdjustment, renderAdminRentAdjustments,
    renderTenantRentAdjustments, markRentAdjustmentRead };
}
