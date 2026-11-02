import { DEMO_TENANT_ID, DEMO_PLAZA_ID } from '../data/demo-data.js';
import { escapeHtml, formatNaira, formatDate, payStatusBadge } from '../utils.js';
import { invoiceBadge } from './invoices.js';

export function createPaymentActions({ repository, ui, getRole, refresh }) {
  const ownInvoices = () => repository.listInvoiceSummaries().filter(invoice => invoice.tenantId === DEMO_TENANT_ID);
  const initialInvoice = ownInvoices().find(invoice => invoice.balance > 0) || ownInvoices()[0];
  let selectedTenancyId = initialInvoice?.tenancyId || repository.listTenancies(DEMO_TENANT_ID)[0]?.id;
  let selectedInvoiceId = initialInvoice?.id;
  const scopedInvoice = id => {
    const invoice = repository.getInvoiceSummary(id);
    return invoice?.plazaId === DEMO_PLAZA_ID && (getRole() === 'admin' || (getRole() === 'tenant' && invoice.tenantId === DEMO_TENANT_ID)) ? invoice : null;
  };
  const options = invoices => invoices.map(invoice => `<option value="${invoice.id}">${invoice.number} · ${escapeHtml(invoice.unit)} · ${escapeHtml(invoice.tenant)} · balance ${formatNaira(invoice.balance)}</option>`).join('');
  const run = operation => { try { operation(); } catch (error) { ui.showToast(error.message, 'error'); } };
  const submissions = invoiceId => {
    const payments = repository.listPayments().filter(payment => payment.invoiceId === invoiceId && payment.tenantId === DEMO_TENANT_ID && payment.source !== 'legacy-obligation');
    return `<h4 style="margin-top:20px;">Payment and evidence history</h4>${payments.map(payment => `<div class="lease-card" style="margin-top:10px;"><p>${escapeHtml(payment.ref)} · ${formatNaira(payment.amount)} · ${payStatusBadge(payment.status)}</p><p>${formatDate(payment.date)}${payment.reviewReason ? ` · ${escapeHtml(payment.reviewReason)}` : ''}</p></div>`).join('') || '<p>No submissions for this invoice yet.</p>'}`;
  };
  function getSelectedTenantTenancy() { return repository.getTenancyRow(selectedTenancyId); }
  function selectTenantTenancy(value) {
    const id = Number(value);
    if (!repository.listTenancies(DEMO_TENANT_ID).some(tenancy => tenancy.id === id)) return;
    selectedTenancyId = id;
    selectedInvoiceId = ownInvoices().find(invoice => invoice.tenancyId === id && invoice.balance > 0)?.id || ownInvoices().find(invoice => invoice.tenancyId === id)?.id;
    renderPayStep(1);
  }
  function selectTenantInvoice(value) {
    const invoice = ownInvoices().find(item => item.id === Number(value));
    if (!invoice || invoice.tenancyId !== selectedTenancyId) return;
    selectedInvoiceId = invoice.id;
    renderPayStep(1);
  }
  function renderPayStep(step) {
    if (getRole() !== 'tenant') return;
    const content = document.getElementById('pay-content');
    if (!content) return;
    [1, 2, 3].forEach(index => {
      const element = document.getElementById(`pstep-${index}`);
      element?.classList.remove('active', 'done');
      if (index === step) element?.classList.add('active');
      else if (index < step) element?.classList.add('done');
    });
    const invoice = scopedInvoice(selectedInvoiceId);
    const tenancies = repository.listTenancies(DEMO_TENANT_ID);
    const selectors = `<div class="form-group mb-16"><label class="form-label" for="tenant-payment-tenancy">Shop agreement</label><select class="form-input" id="tenant-payment-tenancy" onchange="selectTenantTenancy(this.value)">${tenancies.map(tenancy => `<option value="${tenancy.id}" ${tenancy.id === selectedTenancyId ? 'selected' : ''}>${escapeHtml(repository.getUnit(tenancy.unitId).number)} · ${escapeHtml(tenancy.status)}</option>`).join('')}</select></div>`;
    if (!invoice) { content.innerHTML = `<div class="card">${selectors}<h3>No invoice for this agreement</h3><p>Management must issue an invoice before a payment can be recorded. Existing history remains in My Receipts.</p></div>`; return; }
    if (step === 1) {
      const invoices = ownInvoices().filter(item => item.tenancyId === selectedTenancyId);
      content.innerHTML = `<div class="card">${selectors}<div class="form-group mb-16"><label class="form-label" for="tenant-payment-invoice">Invoice</label><select class="form-input" id="tenant-payment-invoice" onchange="selectTenantInvoice(this.value)">${invoices.map(item => `<option value="${item.id}" ${item.id === invoice.id ? 'selected' : ''}>${item.number} · ${formatDate(item.periodStart)} – ${formatDate(item.periodEnd)}</option>`).join('')}</select></div>
        <h3>${invoice.number} · Shop ${escapeHtml(invoice.unit)}</h3><p>Due ${formatDate(invoice.dueDate)} ${invoiceBadge(invoice.status)}</p>
        ${invoice.items.map(item => `<div class="lease-row"><span>${escapeHtml(item.description)}</span><strong>${formatNaira(item.amount)}</strong></div>`).join('')}
        <div class="lease-row"><span>Approved</span><strong>${formatNaira(invoice.approved)}</strong></div><div class="lease-row"><span>Outstanding</span><strong>${formatNaira(invoice.balance)}</strong></div><p class="maint-meta">Pending evidence: ${formatNaira(invoice.pending)}. Pending amounts do not reduce your balance.</p>
        <button class="btn btn-primary" style="margin-top:16px;" onclick="renderPayStep(2)" ${invoice.balance === 0 ? 'disabled' : ''}>Submit bank-transfer evidence</button>${submissions(invoice.id)}</div>`;
    } else if (step === 2 && invoice.balance > 0) {
      content.innerHTML = `<div class="card"><h3>Transfer Evidence — ${invoice.number}</h3><p>Shop ${escapeHtml(invoice.unit)} · Outstanding ${formatNaira(invoice.balance)}</p><p class="maint-meta">Demo only. Do not transfer money to sample account details. Real evidence storage and bank verification require a backend.</p>
        <div class="form-group mb-16"><label class="form-label" for="transfer-amount">Amount transferred (₦)</label><input class="form-input" id="transfer-amount" type="number" min="0.01" max="${invoice.balance}" step="0.01" value="${invoice.balance}"></div>
        <div class="form-group mb-16"><label class="form-label" for="transfer-reference">Bank reference</label><input class="form-input" id="transfer-reference" maxlength="120"></div>
        <div class="form-group mb-16"><label class="form-label" for="transfer-evidence">Receipt evidence</label><input class="form-input" id="transfer-evidence" type="file" accept="image/*,.pdf"><p class="maint-meta">Only the filename is kept in memory. The file is not uploaded or stored.</p></div>
        <button class="btn btn-ghost" onclick="renderPayStep(1)">Back</button> <button class="btn btn-primary" onclick="processPayment()">Submit for review</button></div>`;
    }
  }
  function selectPayMethod() { renderPayStep(2); }
  function processPayment() { submitTransferEvidence(); }
  function submitTransferEvidence() {
    if (getRole() !== 'tenant') return;
    run(() => {
      const invoice = scopedInvoice(selectedInvoiceId);
      if (!invoice) throw new Error('Choose one of your invoices.');
      const date = new Date().toISOString().slice(0, 10);
      const ref = `EVD-${date.slice(0,4)}-${String(repository.listPayments().filter(payment => payment.ref.startsWith(`EVD-${date.slice(0,4)}-`)).length + 1).padStart(3, '0')}`;
      const payment = repository.addPayment({ ref, invoiceId:invoice.id, tenantId:DEMO_TENANT_ID,
        amount:Number(document.getElementById('transfer-amount')?.value), date, method:'Bank Transfer', status:'pending', source:'evidence',
        transferReference:document.getElementById('transfer-reference')?.value.trim(), evidenceFile:document.getElementById('transfer-evidence')?.files[0]?.name });
      renderEvidenceSubmitted(payment);
      ui.showToast('Evidence submitted. The invoice balance is unchanged until approval.', 'success');
    });
  }
  function renderEvidenceSubmitted(payment) {
    const invoice = repository.getInvoiceSummary(payment.invoiceId);
    [1, 2, 3].forEach(index => {
      const element = document.getElementById(`pstep-${index}`);
      element?.classList.remove('active', 'done');
      element?.classList.add(index === 3 ? 'active' : 'done');
    });
    document.getElementById('pay-content').innerHTML = `<div class="card"><h3>Evidence Submitted for Review</h3><p>Reference ${escapeHtml(payment.ref)} · ${invoice.number} · Shop ${escapeHtml(payment.unit)}</p><p>Submitted amount: ${formatNaira(payment.amount)}</p><p>Invoice balance: ${formatNaira(invoice.balance)} (unchanged)</p><p class="maint-meta">No bank transfer has been verified and no receipt has been issued.</p><button class="btn btn-ghost" onclick="renderPayStep(1)">Back to invoices</button></div>`;
  }
  function openRecordPayment() {
    if (getRole() !== 'admin') return;
    const invoices = repository.listInvoiceSummaries().filter(invoice => invoice.balance > 0);
    if (!invoices.length) { ui.showToast('Issue an unpaid invoice before recording a payment.', 'error'); return; }
    ui.openModal('Record Confirmed Demo Payment', `<div class="form-group mb-16"><label class="form-label" for="manual-payment-invoice">Invoice</label><select class="form-input" id="manual-payment-invoice">${options(invoices)}</select></div>
      <div class="form-group mb-16"><label class="form-label" for="manual-payment-amount">Confirmed amount (₦)</label><input class="form-input" id="manual-payment-amount" type="number" min="0.01" step="0.01"></div>
      <div class="form-group mb-16"><label class="form-label" for="manual-payment-method">Method</label><select class="form-input" id="manual-payment-method"><option>Cash</option><option>Bank Transfer</option><option>Cheque</option></select></div>
      <div class="form-group"><label class="form-label" for="manual-payment-date">Payment date</label><input class="form-input" id="manual-payment-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><p class="maint-meta">Record only a confirmed sample payment. Partial amounts are allowed; credits and overpayments are not allocated in this MVP.</p>`,
      '<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="saveManualPayment()">Record payment</button>');
  }
  function saveManualPayment() {
    if (getRole() !== 'admin') return;
    run(() => {
      const invoiceId = Number(document.getElementById('manual-payment-invoice')?.value);
      if (!scopedInvoice(invoiceId)) throw new Error('Choose an invoice in this plaza.');
      const date = document.getElementById('manual-payment-date')?.value;
      const method = document.getElementById('manual-payment-method')?.value;
      if (!['Cash', 'Bank Transfer', 'Cheque'].includes(method)) throw new Error('Choose a supported payment method.');
      const year = date?.slice(0,4);
      const ref = `MAN-${year}-${String(repository.listPayments().filter(payment => payment.ref.startsWith(`MAN-${year}-`)).length + 1).padStart(3, '0')}`;
      repository.addPayment({ ref, invoiceId, amount:Number(document.getElementById('manual-payment-amount')?.value), method, date, status:'paid', source:'manual' });
      ui.closeModalDirect(); refresh(); ui.showToast('Confirmed demo payment allocated to the selected invoice.', 'success');
    });
  }
  function openPaymentReview(ref) {
    if (getRole() !== 'admin') return;
    const payment = repository.listPayments().find(item => item.ref === ref);
    const invoice = payment && scopedInvoice(payment.invoiceId);
    if (!invoice || payment.status !== 'pending') return;
    ui.openModal('Review Transfer Evidence', `<p>${invoice.number} · ${escapeHtml(payment.tenant)} · Shop ${escapeHtml(payment.unit)}</p><p>Amount: ${formatNaira(payment.amount)} · Remaining balance: ${formatNaira(invoice.balance)}</p><p>Bank reference: ${escapeHtml(payment.transferReference || 'Legacy sample')}</p><p>Evidence filename: ${escapeHtml(payment.evidenceFile || 'Legacy sample, no stored file')}</p><div class="form-group"><label class="form-label" for="payment-review-reason">Review note (required for rejection)</label><textarea class="form-input" id="payment-review-reason" maxlength="1000" rows="3"></textarea></div><p class="maint-meta">Demo decision only; the file is not uploaded and no real bank verification occurs.</p>`,
      `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-red" onclick="rejectPaymentEvidence('${payment.ref}')">Reject</button><button class="btn btn-primary" onclick="approvePaymentEvidence('${payment.ref}')">Approve</button>`);
  }
  function review(ref, decision) {
    if (getRole() !== 'admin') return;
    run(() => {
      const payment = repository.listPayments().find(item => item.ref === ref);
      if (!payment || !scopedInvoice(payment.invoiceId)) throw new Error('Payment not found in this plaza.');
      repository.reviewPayment(ref, decision, document.getElementById('payment-review-reason')?.value.trim() || '');
      ui.closeModalDirect(); refresh(); ui.showToast(decision === 'paid' ? 'Demo evidence approved and allocated once.' : 'Evidence rejected. Invoice balance is unchanged.', 'success');
    });
  }
  function approvePaymentEvidence(ref) { review(ref, 'paid'); }
  function rejectPaymentEvidence(ref) { review(ref, 'rejected'); }
  function openPaymentRecord(ref) {
    const payment = repository.listPayments().find(item => item.ref === ref);
    const invoice = payment && scopedInvoice(payment.invoiceId);
    if (!invoice || payment.status !== 'paid') return;
    ui.openModal('Approved Demo Payment Record', `<p>${escapeHtml(payment.ref)} · ${invoice.number}</p><p>Shop ${escapeHtml(payment.unit)} · ${formatNaira(payment.amount)} · ${formatDate(payment.date)}</p><p>Period: ${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}</p><p class="maint-meta">This is a demo record, not an official receipt. PDF generation and email delivery are not implemented.</p>`);
  }
  function renderReceipts() {
    const list = document.getElementById('tenant-receipts-list');
    if (!list) return;
    list.innerHTML = repository.listPayments().filter(payment => payment.tenantId === DEMO_TENANT_ID && payment.status === 'paid').map(payment => `<div class="receipt-item"><div class="receipt-info"><div class="receipt-name">Shop ${escapeHtml(payment.unit)} · ${escapeHtml(repository.getInvoice(payment.invoiceId)?.number || 'Legacy record')}</div><div class="receipt-date">${formatDate(payment.date)} · ${escapeHtml(payment.ref)} ${payStatusBadge(payment.status)}</div></div><div>${formatNaira(payment.amount)} <button class="btn btn-sm btn-ghost" onclick="openPaymentRecord('${payment.ref}')">View record</button></div></div>`).join('') || '<p>No approved payment records yet.</p>';
  }
  return { getSelectedTenantTenancy, selectTenantTenancy, selectTenantInvoice, renderPayStep, selectPayMethod, processPayment, submitTransferEvidence,
    renderEvidenceSubmitted, openRecordPayment, saveManualPayment, openPaymentReview, approvePaymentEvidence, rejectPaymentEvidence, renderReceipts, openPaymentRecord };
}
