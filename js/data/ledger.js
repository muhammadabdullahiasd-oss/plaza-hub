import { isValidDateOnly } from '../utils.js';
import { DEMO_PLAZA_ID } from './demo-data.js';

// Store existing UI amounts in naira, but perform all arithmetic in integer kobo.
export function toKobo(amount) {
  const scaled = amount * 100;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(scaled)) || Math.abs(scaled - Math.round(scaled)) > 0.000001) throw new Error('Enter a positive amount with no more than two decimal places.');
  return Math.round(scaled);
}
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function createLedger(data) {
  let nextInvoiceId = Math.max(0, ...data.invoices.map(invoice => invoice.id)) + 1;
  const findInvoice = id => data.invoices.find(invoice => invoice.id === id);
  const totalKobo = invoice => invoice.items.reduce((sum, item) => sum + toKobo(item.amount), 0);
  const approvedKobo = id => data.payments.filter(payment => payment.invoiceId === id && payment.status === 'paid').reduce((sum, payment) => sum + toKobo(payment.amount), 0);
  const pendingKobo = id => data.payments.filter(payment => payment.invoiceId === id && payment.status === 'pending').reduce((sum, payment) => sum + toKobo(payment.amount), 0);
  const balanceKobo = invoice => totalKobo(invoice) - approvedKobo(invoice.id);
  const summary = (id, asOf = today()) => {
    const invoice = findInvoice(id);
    if (!invoice) return null;
    const billed = totalKobo(invoice), approved = approvedKobo(id), balance = billed - approved;
    const overdue = balance > 0 && invoice.dueDate < asOf;
    return { ...invoice, amount:billed / 100, approved:approved / 100, pending:pendingKobo(id) / 100, balance:balance / 100, overdue,
      status:balance === 0 ? 'paid' : overdue ? 'overdue' : approved > 0 ? 'partial' : 'unpaid' };
  };
  const cloneInvoice = invoice => invoice ? { ...invoice, items:invoice.items.map(item => ({ ...item })) } : null;
  const summaryRows = (plazaId = DEMO_PLAZA_ID, asOf) => data.invoices.filter(invoice => invoice.plazaId === plazaId).map(invoice => ({ ...summary(invoice.id, asOf), items:invoice.items.map(item => ({ ...item })) }));
  const requireCapacity = (invoice, amountKobo) => {
    if (amountKobo > balanceKobo(invoice)) throw new Error('Payment exceeds this invoice’s remaining balance. Split the transfer or resolve credits separately.');
  };
  const validateLink = (invoice, payment) => {
    for (const key of ['tenantId', 'tenancyId', 'unitId', 'plazaId']) if (payment[key] !== undefined && payment[key] !== invoice[key]) throw new Error('Payment does not match the invoice assignment.');
  };
  // Receipts are issued once on confirmation, never when a view is opened.
  // Their balances describe that allocation, not today's outstanding balance.
  const receipts = [];
  let nextReceiptId = 1;
  const cloneReceipt = receipt => receipt ? { ...receipt, items:receipt.items.map(item => ({ ...item })) } : null;
  function issueReceipt(payment, remainingKobo) {
    if (payment.status !== 'paid' || receipts.some(receipt => receipt.paymentRef === payment.ref)) return;
    const invoice = findInvoice(payment.invoiceId);
    if (!invoice) return;
    const id = nextReceiptId++;
    receipts.push({ id, number:`DEMO-RCT-${String(id).padStart(6, '0')}`, paymentRef:payment.ref,
      invoiceId:invoice.id, invoiceNumber:invoice.number, tenantId:invoice.tenantId, tenancyId:invoice.tenancyId,
      unitId:invoice.unitId, plazaId:invoice.plazaId,
      plaza:data.plazas.find(plaza => plaza.id === invoice.plazaId)?.name || 'Demo plaza',
      tenant:invoice.tenant, unit:invoice.unit, periodStart:invoice.periodStart, periodEnd:invoice.periodEnd,
      items:invoice.items.map(item => ({ ...item })), invoiceAmount:totalKobo(invoice) / 100,
      amount:payment.amount, balanceAfter:remainingKobo / 100, paymentDate:payment.date, method:payment.method,
      issuedAt:new Date().toISOString() });
  }
  // Import approved sample records in payment-date order. No real receipts exist.
  const importedAllocations = new Map();
  data.payments.filter(payment => payment.status === 'paid' && findInvoice(payment.invoiceId))
    .slice().sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref)).forEach(payment => {
      const allocated = (importedAllocations.get(payment.invoiceId) || 0) + toKobo(payment.amount);
      importedAllocations.set(payment.invoiceId, allocated);
      issueReceipt(payment, totalKobo(findInvoice(payment.invoiceId)) - allocated);
    });

  return {
    listReceipts:(plazaId = DEMO_PLAZA_ID) => receipts.filter(receipt => receipt.plazaId === plazaId).map(cloneReceipt),
    getReceiptForPayment:ref => cloneReceipt(receipts.find(receipt => receipt.paymentRef === ref)),
    listInvoices:(plazaId = DEMO_PLAZA_ID) => data.invoices.filter(invoice => invoice.plazaId === plazaId).map(cloneInvoice),
    getInvoice:id => cloneInvoice(findInvoice(id)),
    getInvoiceSummary:(id, asOf) => { const result = summary(id, asOf); return result ? { ...result, items:result.items.map(item => ({ ...item })) } : null; },
    listInvoiceSummaries:summaryRows,
    createInvoice(details) {
      const tenancy = data.tenancies.find(item => item.id === details.tenancyId);
      if (!tenancy || tenancy.status === 'cancelled') throw new Error('Choose an existing, non-cancelled tenancy.');
      const plazaId = details.plazaId ?? DEMO_PLAZA_ID;
      if (tenancy.plazaId !== plazaId) throw new Error('Choose a tenancy in this plaza.');
      const { periodStart, periodEnd, dueDate } = details;
      if (![periodStart, periodEnd, dueDate].every(isValidDateOnly) || periodEnd < periodStart) throw new Error('Enter a valid period start, period end, and due date.');
      if (data.invoices.some(invoice => invoice.tenancyId === tenancy.id && periodStart <= invoice.periodEnd && periodEnd >= invoice.periodStart)) throw new Error('This tenancy already has an invoice overlapping that period. Include all period charges in one invoice.');
      if (!Array.isArray(details.items) || details.items.length < 1 || details.items.length > 20) throw new Error('Provide between 1 and 20 invoice line items.');
      const items = details.items.map(item => {
        if (typeof item.description !== 'string' || !item.description.trim() || item.description.trim().length > 120) throw new Error('Each line item needs a description of up to 120 characters.');
        toKobo(item.amount);
        return { description:item.description.trim(), amount:item.amount };
      });
      if (!Number.isSafeInteger(items.reduce((sum, item) => sum + toKobo(item.amount), 0))) throw new Error('Invoice amount is too large.');
      const id = nextInvoiceId++;
      const invoice = { id, number:`INV-${String(id).padStart(4, '0')}`, tenantId:tenancy.tenantId, tenancyId:tenancy.id, plazaId,
        unitId:tenancy.unitId, tenant:data.tenants.find(tenant => tenant.id === tenancy.tenantId).name,
        unit:data.units.find(unit => unit.id === tenancy.unitId).number, periodStart, periodEnd, dueDate, items, issuedAt:today() };
      data.invoices.push(invoice);
      return cloneInvoice(invoice);
    },
    addPayment(details) {
      const invoice = findInvoice(details.invoiceId);
      if (!invoice) throw new Error('Choose an invoice before recording a payment.');
      validateLink(invoice, details);
      if (!['paid', 'pending'].includes(details.status)) throw new Error('New payments must be confirmed manual records or pending evidence.');
      const amountKobo = toKobo(details.amount);
      requireCapacity(invoice, amountKobo);
      if (!isValidDateOnly(details.date)) throw new Error('Enter a valid payment date.');
      if (typeof details.ref !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(details.ref.trim()) || data.payments.some(payment => payment.ref === details.ref.trim())) throw new Error('Use a unique payment reference containing letters, digits, hyphens or underscores.');
      const reference = details.transferReference?.trim();
      if (details.status === 'pending' && (!reference || !details.evidenceFile)) throw new Error('Provide a bank reference and evidence filename.');
      if (reference && (reference.length > 120 || data.payments.some(payment => payment.plazaId === invoice.plazaId && payment.transferReference?.trim().toLowerCase() === reference.toLowerCase()))) throw new Error('That bank reference has already been submitted or is invalid.');
      const payment = { ...details, ref:details.ref.trim(), transferReference:reference,
        tenantId:invoice.tenantId, tenancyId:invoice.tenancyId, unitId:invoice.unitId, plazaId:invoice.plazaId,
        tenant:invoice.tenant, unit:invoice.unit, period:`${invoice.periodStart} – ${invoice.periodEnd}`,
        ...(details.status === 'paid' ? { reviewedAt:new Date().toISOString(), reviewReason:'Confirmed manual demo record' } : {}) };
      data.payments.unshift(payment);
      if (payment.status === 'paid') issueReceipt(payment, balanceKobo(invoice));
      return { ...payment };
    },
    reviewPayment(ref, decision, note = '') {
      const payment = data.payments.find(item => item.ref === ref);
      if (!payment || !['paid', 'rejected'].includes(decision)) throw new Error('Choose a valid payment and review decision.');
      if (payment.status === decision) return { ...payment }; // Repeated clicks must not allocate twice.
      if (payment.status !== 'pending') throw new Error('Only pending evidence can be reviewed. Confirmed records cannot be overwritten.');
      if (typeof note !== 'string' || note.length > 1000 || (decision === 'rejected' && !note.trim())) throw new Error('Provide a rejection reason and keep notes within 1,000 characters.');
      const invoice = findInvoice(payment.invoiceId);
      if (!invoice) throw new Error('This evidence must be linked to an invoice before review.');
      if (decision === 'paid') requireCapacity(invoice, toKobo(payment.amount));
      Object.assign(payment, { status:decision, reviewReason:note.trim(), reviewedAt:new Date().toISOString() });
      if (decision === 'paid') issueReceipt(payment, balanceKobo(invoice));
      return { ...payment };
    },
    getLedgerSummary(plazaId = DEMO_PLAZA_ID, asOf) {
      const invoices = summaryRows(plazaId, asOf);
      const sum = key => invoices.reduce((total, invoice) => total + Math.round(invoice[key] * 100), 0) / 100;
      return { billed:sum('amount'), collected:sum('approved'), outstanding:sum('balance'), pending:sum('pending'),
        overdue:invoices.filter(invoice => invoice.overdue).reduce((total, invoice) => total + Math.round(invoice.balance * 100), 0) / 100,
        overdueCount:invoices.filter(invoice => invoice.overdue).length, invoiceCount:invoices.length,
        collectionRate:sum('amount') ? Math.round(sum('approved') / sum('amount') * 100) : 0 };
    },
  };
}
