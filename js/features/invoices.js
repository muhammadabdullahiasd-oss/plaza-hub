import { DEMO_PLAZA_ID, DEMO_TENANT_ID } from '../data/demo-data.js';
import { escapeHtml, formatNaira, formatDate } from '../utils.js';

export function invoiceBadge(status) {
  const colors = { paid:'green', partial:'blue', unpaid:'orange', overdue:'red' };
  return `<span class="badge badge-${colors[status] || 'gray'}">${escapeHtml(status)}</span>`;
}

export function createInvoiceActions({ repository, ui, getRole, refresh }) {
  const scoped = id => {
    const invoice = repository.getInvoiceSummary(id);
    return invoice?.plazaId === DEMO_PLAZA_ID && (getRole() === 'admin' || (getRole() === 'tenant' && invoice.tenantId === DEMO_TENANT_ID)) ? invoice : null;
  };
  function renderInvoiceList() {
    const body = document.getElementById('invoices-tbody');
    if (!body || getRole() !== 'admin') return;
    body.innerHTML = repository.listInvoiceSummaries().map(invoice => `<tr>
      <td>${invoice.number}</td><td>${escapeHtml(invoice.tenant)}<div class="cell-sub">Shop ${escapeHtml(invoice.unit)}</div></td>
      <td>${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}</td><td>${formatDate(invoice.dueDate)}</td>
      <td>${formatNaira(invoice.amount)}</td><td>${formatNaira(invoice.approved)}</td><td>${formatNaira(invoice.balance)}</td><td>${invoiceBadge(invoice.status)}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="openInvoiceDetails(${invoice.id})">View</button></td>
    </tr>`).join('') || '<tr><td colspan="9">No invoices yet. Issue an invoice for a tenancy to start tracking its balance.</td></tr>';
  }
  function openCreateInvoice() {
    if (getRole() !== 'admin') return;
    const rows = repository.listTenancies().filter(tenancy => tenancy.status !== 'cancelled').map(tenancy => repository.getTenancyRow(tenancy.id));
    if (!rows.length) { ui.showToast('Register a tenancy before issuing an invoice.', 'error'); return; }
    ui.openModal('Issue Demo Invoice', `
      <div class="form-group mb-16"><label class="form-label" for="invoice-tenancy">Tenant / shop agreement</label><select class="form-input" id="invoice-tenancy">${rows.map(row => `<option value="${row.tenancyId}">${escapeHtml(row.name)} · ${escapeHtml(row.shop)} · ${escapeHtml(row.lifecycle)}</option>`).join('')}</select></div>
      <div class="form-grid-2 mb-16"><div class="form-group"><label class="form-label" for="invoice-start">Billing period start</label><input class="form-input" id="invoice-start" type="date"></div><div class="form-group"><label class="form-label" for="invoice-end">Billing period end (inclusive)</label><input class="form-input" id="invoice-end" type="date"></div></div>
      <div class="form-group mb-16"><label class="form-label" for="invoice-due">Payment due date</label><input class="form-input" id="invoice-due" type="date"></div>
      <div class="form-grid-2 mb-16"><div class="form-group"><label class="form-label" for="invoice-description">Charge description</label><input class="form-input" id="invoice-description" maxlength="120" value="Rent"></div><div class="form-group"><label class="form-label" for="invoice-amount">Amount (₦)</label><input class="form-input" id="invoice-amount" type="number" min="0.01" step="0.01"></div></div>
      <div class="form-grid-2"><div class="form-group"><label class="form-label" for="invoice-extra-label">Additional charge (optional)</label><input class="form-input" id="invoice-extra-label" maxlength="120" placeholder="e.g. Service charge"></div><div class="form-group"><label class="form-label" for="invoice-extra-amount">Additional amount (₦)</label><input class="form-input" id="invoice-extra-amount" type="number" min="0.01" step="0.01"></div></div>
      <p class="maint-meta">Issued invoices retain these amounts and dates. Use one invoice for all charges in a period. This is a browser-only demonstration, not an official document.</p>`,
      '<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="saveInvoice()">Issue invoice</button>');
  }
  function saveInvoice() {
    if (getRole() !== 'admin') return;
    try {
      const extraLabel = document.getElementById('invoice-extra-label').value.trim();
      const extraAmount = document.getElementById('invoice-extra-amount').value;
      const items = [{ description:document.getElementById('invoice-description').value, amount:Number(document.getElementById('invoice-amount').value) }];
      if (extraLabel || extraAmount) items.push({ description:extraLabel, amount:Number(extraAmount) });
      const invoice = repository.createInvoice({ tenancyId:Number(document.getElementById('invoice-tenancy').value), plazaId:DEMO_PLAZA_ID,
        periodStart:document.getElementById('invoice-start').value, periodEnd:document.getElementById('invoice-end').value,
        dueDate:document.getElementById('invoice-due').value, items });
      refresh();
      openInvoiceDetails(invoice.id);
      ui.showToast(`Demo invoice ${invoice.number} issued.`, 'success');
    } catch (error) { ui.showToast(error.message, 'error'); }
  }
  function openInvoiceDetails(id) {
    const invoice = scoped(id);
    if (!invoice) return;
    ui.openModal(`Demo Invoice ${invoice.number}`, `
      <div class="lease-card mb-16"><p>${escapeHtml(invoice.tenant)} · Shop ${escapeHtml(invoice.unit)}</p><p>Period: ${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}</p><p>Due: ${formatDate(invoice.dueDate)}</p></div>
      ${invoice.items.map(item => `<div class="lease-row"><span>${escapeHtml(item.description)}</span><strong>${formatNaira(item.amount)}</strong></div>`).join('')}
      <div class="lease-row"><span>Invoiced</span><strong>${formatNaira(invoice.amount)}</strong></div>
      <div class="lease-row"><span>Approved payments</span><strong>${formatNaira(invoice.approved)}</strong></div>
      <div class="lease-row"><span>Outstanding</span><strong>${formatNaira(invoice.balance)}</strong></div>
      <div class="lease-row"><span>Pending evidence (not deducted)</span><strong>${formatNaira(invoice.pending)}</strong></div>
      <p style="margin-top:12px;">${invoiceBadge(invoice.status)}</p><p class="maint-meta">This record is a demo invoice. It is not a payment receipt or confirmation of a bank transfer.</p>`);
  }
  return { renderInvoiceList, openCreateInvoice, saveInvoice, openInvoiceDetails };
}
