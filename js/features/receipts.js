import { DEMO_PLAZA_ID, DEMO_TENANT_ID } from '../data/demo-data.js';
import { escapeHtml, formatNaira, formatDate } from '../utils.js';

export function createReceiptActions({ repository, ui, getRole }) {
  const scopedReceipt = ref => {
    const receipt = repository.getReceiptForPayment(ref);
    return receipt?.plazaId === DEMO_PLAZA_ID && (getRole() === 'admin' || (getRole() === 'tenant' && receipt.tenantId === DEMO_TENANT_ID)) ? receipt : null;
  };
  function receiptMarkup(receipt) {
    const row = (label, value) => `<div class="receipt-detail"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
    return `<article class="receipt-document" aria-label="Demo receipt ${escapeHtml(receipt.number)}">
      <header class="receipt-heading"><p class="receipt-demo-label">DEMO RECEIPT · NOT OFFICIAL</p><h2>PlazaHub</h2><p>${escapeHtml(receipt.plaza)}</p><strong>${escapeHtml(receipt.number)}</strong></header>
      <dl class="receipt-details">
        ${row('Tenant / business', receipt.tenant)}${row('Shop', receipt.unit)}
        ${row('Payment reference', receipt.paymentRef)}${row('Invoice', receipt.invoiceNumber)}
        ${row('Billing period', `${formatDate(receipt.periodStart)} – ${formatDate(receipt.periodEnd)}`)}
        ${row('Payment date', formatDate(receipt.paymentDate))}${row('Method', receipt.method)}
        ${row('Demo issue date', formatDate(receipt.issuedAt.slice(0, 10)))}
      </dl>
      <h3>Invoice charges</h3><dl class="receipt-details">${receipt.items.map(item => row(item.description, formatNaira(item.amount))).join('')}</dl>
      <dl class="receipt-totals">
        ${row('Invoice total', formatNaira(receipt.invoiceAmount))}
        ${row('Amount received in this demo payment', formatNaira(receipt.amount))}
        ${row('Balance after this payment', formatNaira(receipt.balanceAfter))}
      </dl>
      <p class="receipt-footnote">This balance is a snapshot immediately after this payment. Later payments appear on separate receipts.</p>
      <p class="receipt-disclaimer">Sample data only. This browser-generated demo is not an official receipt, proof of a real bank transfer, or a tax document. Numbers and records reset when the page is refreshed.</p>
    </article>`;
  }
  function openPaymentRecord(ref) {
    const receipt = scopedReceipt(ref);
    if (!receipt) return;
    ui.openModal(`Demo Receipt ${receipt.number}`, receiptMarkup(receipt),
      `<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button><button class="btn btn-primary" onclick="printReceipt('${receipt.paymentRef}')">Print / Save as PDF</button>`);
  }
  function printReceipt(ref) {
    const receipt = scopedReceipt(ref);
    if (!receipt) return;
    const root = document.getElementById('receipt-print-root');
    if (!root || typeof window.print !== 'function') { ui.showToast('Printing is unavailable in this browser.', 'error'); return; }
    // Print only a freshly scoped snapshot; no pop-up window or file upload.
    root.innerHTML = receiptMarkup(receipt);
    document.body.classList.add('printing-receipt');
    try { window.print(); }
    catch { ui.showToast('Could not open printing. Try again from the receipt.', 'error'); }
    finally {
      document.body.classList.remove('printing-receipt');
      root.innerHTML = '';
    }
  }
  function renderReceipts() {
    const list = document.getElementById('tenant-receipts-list');
    if (!list) return;
    const receipts = repository.listReceipts().filter(receipt => receipt.tenantId === DEMO_TENANT_ID).reverse();
    list.innerHTML = receipts.map(receipt => `<div class="receipt-item"><div class="receipt-info"><div class="receipt-name">${escapeHtml(receipt.number)} · Shop ${escapeHtml(receipt.unit)}</div><div class="receipt-date">${formatDate(receipt.paymentDate)} · ${escapeHtml(receipt.paymentRef)} · ${escapeHtml(receipt.invoiceNumber)}</div></div><div class="receipt-actions"><strong>${formatNaira(receipt.amount)}</strong><button class="btn btn-sm btn-ghost" onclick="openPaymentRecord('${receipt.paymentRef}')">View receipt</button></div></div>`).join('') || '<p>No demo receipts yet. Pending and rejected submissions do not receive receipts.</p>';
  }
  return { openPaymentRecord, printReceipt, renderReceipts };
}
