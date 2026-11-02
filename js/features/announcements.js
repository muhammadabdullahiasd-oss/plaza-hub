import { DEMO_PLAZA_ID, DEMO_TENANT_ID } from '../data/demo-data.js';
import { escapeHtml } from '../utils.js';

export function createAnnouncementActions({ repository, ui, getRole }) {
  const selectedIds = () => [...document.querySelectorAll('input[name="announcement-recipient"]:checked')].map(input => Number(input.value));
  const publishedDate = value => new Date(value).toLocaleString('en-NG', { dateStyle:'medium', timeStyle:'short' });
  const content = notice => `<h3>${escapeHtml(notice.title)}</h3><p class="announcement-date">Published ${escapeHtml(publishedDate(notice.publishedAt))} · Demo in-app notice</p><p class="announcement-message">${escapeHtml(notice.body)}</p>`;
  function updateAnnouncementIndicators() {
    const dot = document.getElementById('topbar-announcement-dot');
    if (dot) dot.style.display = getRole() === 'tenant' && repository.listTenantAnnouncements(DEMO_TENANT_ID).some(notice => !notice.readAt) ? 'block' : 'none';
  }
  function updateAnnouncementAudience() {
    if (getRole() !== 'admin') return;
    const selected = document.getElementById('announcement-audience')?.value === 'selected';
    const picker = document.getElementById('announcement-recipients');
    if (picker) { picker.hidden = !selected; picker.disabled = !selected; }
    const eligible = repository.getAnnouncementRecipients();
    const count = selected ? new Set(selectedIds().filter(id => eligible.some(tenant => tenant.tenantId === id))).size : eligible.length;
    const summary = document.getElementById('announcement-audience-summary');
    if (summary) summary.textContent = `${count} current tenant${count === 1 ? '' : 's'} selected. Recipient list is saved when published.`;
  }
  function renderAdminAnnouncements() {
    if (getRole() !== 'admin') return;
    const checked = new Set(selectedIds());
    const picker = document.getElementById('announcement-recipient-options');
    if (picker) picker.innerHTML = repository.getAnnouncementRecipients().map(tenant => `<label class="announcement-recipient" for="announcement-recipient-${tenant.tenantId}"><input id="announcement-recipient-${tenant.tenantId}" name="announcement-recipient" type="checkbox" value="${tenant.tenantId}" ${checked.has(tenant.tenantId) ? 'checked' : ''} onchange="updateAnnouncementAudience()"><span>${escapeHtml(tenant.name)} · ${tenant.shops.map(escapeHtml).join(', ')}</span></label>`).join('') || '<p>No current tenants. Assign a shop before publishing a notice.</p>';
    updateAnnouncementAudience();
    const notices = repository.listAnnouncements().reverse();
    const summary = document.getElementById('admin-announcement-summary');
    if (summary) summary.textContent = `${notices.length} published demo announcement${notices.length === 1 ? '' : 's'}`;
    const list = document.getElementById('admin-announcement-list');
    if (list) list.innerHTML = notices.map(notice => `<article class="announcement-card">${content(notice)}<p>${notice.recipients.length} recipient${notice.recipients.length === 1 ? '' : 's'} · ${notice.readBy.length} marked read in this demo</p><details><summary>Recipient list at publication</summary><ul>${notice.recipients.map(tenant => `<li>${escapeHtml(tenant.name)} · ${tenant.shops.map(escapeHtml).join(', ')} · ${notice.readBy.some(read => read.tenantId === tenant.tenantId) ? 'Marked read' : 'Unread'}</li>`).join('')}</ul></details></article>`).join('') || '<p>No published announcements yet. Use the form to publish a demo notice.</p>';
  }
  function publishAnnouncement(event) {
    event?.preventDefault();
    if (getRole() !== 'admin') return;
    try {
      const notice = repository.publishAnnouncement({ plazaId:DEMO_PLAZA_ID,
        title:document.getElementById('announcement-title')?.value,
        body:document.getElementById('announcement-body')?.value,
        audience:document.getElementById('announcement-audience')?.value,
        tenantIds:selectedIds() });
      document.getElementById('announcement-title').value = '';
      document.getElementById('announcement-body').value = '';
      document.querySelectorAll('input[name="announcement-recipient"]:checked').forEach(input => { input.checked = false; });
      renderAdminAnnouncements();
      updateAnnouncementIndicators();
      ui.showToast(`Demo announcement published to ${notice.recipients.length} tenant${notice.recipients.length === 1 ? '' : 's'}. No email or SMS was sent.`, 'success');
    } catch (error) { ui.showToast(error.message, 'error'); }
  }
  function renderTenantAnnouncements() {
    if (getRole() !== 'tenant') return;
    const notices = repository.listTenantAnnouncements(DEMO_TENANT_ID).reverse();
    const unread = notices.filter(notice => !notice.readAt).length;
    const summary = document.getElementById('tenant-announcement-summary');
    if (summary) summary.textContent = `${unread} unread · ${notices.length} demo announcement${notices.length === 1 ? '' : 's'}`;
    const list = document.getElementById('tenant-announcement-list');
    if (list) list.innerHTML = notices.map(notice => `<article class="announcement-card ${notice.readAt ? '' : 'announcement-unread'}">${content(notice)}${notice.readAt ? '<span class="badge badge-gray">Marked read in this demo</span>' : `<button type="button" class="btn btn-sm btn-ghost" onclick="markAnnouncementRead(${notice.id})">Mark as read</button>`}</article>`).join('') || '<p>No announcements addressed to you yet. New management notices will appear here.</p>';
    updateAnnouncementIndicators();
  }
  function markAnnouncementRead(id) {
    if (getRole() !== 'tenant') return;
    try {
      repository.markAnnouncementRead(id, DEMO_TENANT_ID);
      renderTenantAnnouncements();
    } catch (error) { ui.showToast(error.message, 'error'); }
  }
  return { renderAdminAnnouncements, renderTenantAnnouncements, updateAnnouncementAudience,
    updateAnnouncementIndicators, publishAnnouncement, markAnnouncementRead };
}
