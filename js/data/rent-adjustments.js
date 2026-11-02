import { DEMO_PLAZA_ID } from './demo-data.js';
import { isValidDateOnly } from '../utils.js';
import { toKobo } from './ledger.js';

const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
// Injecting the date function lets tests cross an effective date without waiting.
export function createRentAdjustmentStore(data, getToday = localToday) {
  const notices = [];
  let nextId = 1;
  const find = (id, plazaId) => notices.find(notice => notice.id === id && notice.plazaId === plazaId);
  function applicationState(notice) {
    if (notice.status !== 'scheduled') return { state:notice.status, canApply:false, applicationMessage:'' };
    const tenancy = data.tenancies.find(item => item.id === notice.tenancyId);
    const tenant = data.tenants.find(item => item.id === notice.tenantId);
    if (!tenancy || tenancy.status !== 'active' || !tenant || tenant.archived || tenant.plazaId !== notice.plazaId || tenancy.tenantId !== notice.tenantId || tenancy.unitId !== notice.unitId || tenancy.plazaId !== notice.plazaId) return { state:'blocked', canApply:false, applicationMessage:'The original shop assignment is no longer active. Cancel this notice.' };
    if (tenancy.rent !== notice.oldRent || tenancy.start !== notice.leaseStart || tenancy.expires !== notice.leaseEnd) return { state:'blocked', canApply:false, applicationMessage:'Agreement terms changed after publication. Cancel and publish a fresh notice.' };
    if (getToday() < notice.effectiveDate) return { state:'scheduled', canApply:false, applicationMessage:'The effective date has not arrived. Current rent is unchanged.' };
    return { state:'ready', canApply:true, applicationMessage:'Effective date reached. Management must explicitly apply the change.' };
  }
  const view = notice => ({ ...notice, ...applicationState(notice),
    readAt:notice.status === 'scheduled' ? notice.publishedReadAt : notice.statusReadAt });
  const requireNotice = (id, plazaId) => {
    const notice = find(id, plazaId);
    if (!notice) throw new Error('Rent notice not found in this plaza.');
    return notice;
  };
  return {
    listRentAdjustments:(plazaId = DEMO_PLAZA_ID) => notices.filter(notice => notice.plazaId === plazaId).map(view),
    listTenantRentAdjustments:(tenantId, plazaId = DEMO_PLAZA_ID) => notices.filter(notice => notice.plazaId === plazaId && notice.tenantId === tenantId).map(view),
    getRentAdjustment:(id, plazaId = DEMO_PLAZA_ID) => { const notice = find(id, plazaId); return notice ? view(notice) : null; },
    publishRentAdjustment(details) {
      const plazaId = details.plazaId ?? DEMO_PLAZA_ID;
      const tenancy = data.tenancies.find(item => item.id === details.tenancyId && item.plazaId === plazaId);
      const tenant = tenancy && data.tenants.find(item => item.id === tenancy.tenantId && item.plazaId === plazaId);
      const unit = tenancy && data.units.find(item => item.id === tenancy.unitId && item.plazaId === plazaId);
      if (!tenancy || tenancy.status !== 'active' || !tenant || tenant.archived || !unit || !data.plazas.some(plaza => plaza.id === plazaId)) throw new Error('Choose an active shop agreement in this plaza.');
      if (notices.some(notice => notice.tenancyId === tenancy.id && notice.status === 'scheduled')) throw new Error('This agreement already has an open rent notice. Cancel it before publishing a replacement.');
      const oldKobo = toKobo(tenancy.rent), newKobo = toKobo(details.newRent);
      if (oldKobo === newKobo) throw new Error('New annual rent must differ from the current rent.');
      const noticeDate = getToday();
      if (!isValidDateOnly(details.effectiveDate) || details.effectiveDate <= noticeDate || details.effectiveDate < tenancy.start) throw new Error('Choose a future effective date on or after the agreement start.');
      const minimumNoticeDays = details.minimumNoticeDays;
      if (!Number.isSafeInteger(minimumNoticeDays) || minimumNoticeDays < 1 || minimumNoticeDays > 3650) throw new Error('Enter a demo advance-notice requirement between 1 and 3,650 whole days.');
      const advanceDays = Math.round((Date.parse(`${details.effectiveDate}T00:00:00Z`) - Date.parse(`${noticeDate}T00:00:00Z`)) / 86400000);
      if (advanceDays < minimumNoticeDays) throw new Error(`Effective date provides ${advanceDays} days; the entered demo policy requires ${minimumNoticeDays}.`);
      if (typeof details.reason !== 'string' || !details.reason.trim() || details.reason.trim().length > 1000) throw new Error('Enter a reason of up to 1,000 characters.');
      const id = nextId++;
      const notice = { id, number:`DEMO-RENT-${String(id).padStart(4, '0')}`, plazaId,
        tenantId:tenancy.tenantId, tenancyId:tenancy.id, unitId:tenancy.unitId,
        tenant:tenant.name, unit:unit.number,
        oldRent:tenancy.rent, newRent:details.newRent, leaseStart:tenancy.start, leaseEnd:tenancy.expires,
        effectiveDate:details.effectiveDate, noticeDate, minimumNoticeDays, advanceDays,
        reason:details.reason.trim(), status:'scheduled', publishedAt:new Date().toISOString(),
        appliedAt:null, cancelledAt:null, cancellationReason:'', publishedReadAt:null, statusReadAt:null };
      notices.push(notice);
      return view(notice);
    },
    applyRentAdjustment(id, plazaId = DEMO_PLAZA_ID) {
      const notice = requireNotice(id, plazaId);
      if (notice.status === 'applied') return view(notice);
      if (notice.status !== 'scheduled') throw new Error('Only an open rent notice can be applied.');
      const state = applicationState(notice);
      if (!state.canApply) throw new Error(state.applicationMessage);
      data.tenancies.find(tenancy => tenancy.id === notice.tenancyId).rent = notice.newRent;
      Object.assign(notice, { status:'applied', appliedAt:new Date().toISOString() });
      return view(notice);
    },
    cancelRentAdjustment(id, reason, plazaId = DEMO_PLAZA_ID) {
      const notice = requireNotice(id, plazaId);
      if (notice.status === 'cancelled') return view(notice);
      if (notice.status !== 'scheduled') throw new Error('An applied rent change cannot be cancelled. Publish a new notice for a later change.');
      if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) throw new Error('Enter a cancellation reason of up to 500 characters.');
      Object.assign(notice, { status:'cancelled', cancellationReason:reason.trim(), cancelledAt:new Date().toISOString() });
      return view(notice);
    },
    markRentAdjustmentRead(id, tenantId, plazaId = DEMO_PLAZA_ID) {
      const notice = requireNotice(id, plazaId);
      if (notice.tenantId !== tenantId) throw new Error('This rent notice is not addressed to this tenant.');
      const field = notice.status === 'scheduled' ? 'publishedReadAt' : 'statusReadAt';
      if (!notice[field]) notice[field] = new Date().toISOString();
      return view(notice);
    },
  };
}
