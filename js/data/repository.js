import { createDemoData, DEMO_PLAZA_ID } from './demo-data.js';
import { daysUntil, isValidDateOnly } from '../utils.js';
import { createLedger } from './ledger.js';
import { createAnnouncementStore } from './announcements.js';
import { createRentAdjustmentStore } from './rent-adjustments.js';

// In-memory data access. Financial queries return copies; older profile/unit
// queries return live records by convention. Use operations below for writes.
export function createRepository(data = createDemoData()) {
  const ledger = createLedger(data);
  const announcementStore = createAnnouncementStore(data);
  const rentAdjustments = createRentAdjustmentStore(data);
  const historicalIds = [...data.tenants.map(t => t.id), ...data.payments.map(p => p.tenantId), ...data.maintenanceRequests.map(r => r.tenantId)];
  let nextTenantId = Math.max(0, ...historicalIds.filter(Number.isSafeInteger)) + 1;
  let nextTenancyId = Math.max(0, ...data.tenancies.map(t => t.id)) + 1;
  let nextUnitId = Math.max(0, ...data.units.map(unit => unit.id)) + 1;
  const findTenant = id => data.tenants.find(tenant => tenant.id === id);
  const findTenancy = id => data.tenancies.find(tenancy => tenancy.id === id);
  const findUnit = id => data.units.find(unit => unit.id === id);
  function syncPlazaStats(plazaId) {
    const plaza = data.plazas.find(item => item.id === plazaId);
    if (!plaza) return;
    plaza.units = data.units.filter(unit => unit.plazaId === plazaId).length;
    plaza.tenants = new Set(data.tenancies.filter(t => t.plazaId === plazaId && t.status === 'active').map(t => t.tenantId)).size;
  }
  const active = (tenantId, plazaId = DEMO_PLAZA_ID) => data.tenancies.filter(t => t.plazaId === plazaId && t.status === 'active' && (tenantId === undefined || t.tenantId === tenantId));
  const requireVacancy = (unitId, plazaId) => {
    const unit = findUnit(unitId);
    if (!unit || unit.plazaId !== plazaId) throw new Error('Choose an existing shop unit in this plaza.');
    if (active(undefined, plazaId).some(t => t.unitId === unitId)) throw new Error('That unit is already occupied.');
    return unit;
  };
  const validateTerms = ({ rent, start, expires }) => {
    if (!Number.isFinite(rent) || rent <= 0 || !isValidDateOnly(start) || !isValidDateOnly(expires) || expires <= start) throw new Error('Enter positive rent and valid lease dates, with the end after the start.');
  };
  const requireAssignment = id => {
    const tenancy = findTenancy(id);
    if (!tenancy || tenancy.status !== 'active' || findTenant(tenancy.tenantId)?.archived) throw new Error('Choose an active shop assignment.');
    return tenancy;
  };
  const row = tenancy => {
    const tenant = findTenant(tenancy.tenantId);
    const unit = findUnit(tenancy.unitId);
    const days = daysUntil(tenancy.expires);
    return { ...tenant, ...tenancy, id:tenant.id, tenancyId:tenancy.id, shop:unit.number, block:unit.block,
      lifecycle:tenancy.status, status:days < 0 ? 'overdue' : days <= 60 ? 'expiring' : 'active' };
  };
  const assign = details => {
    const tenant = findTenant(details.tenantId);
    if (!tenant || tenant.archived || tenant.plazaId !== details.plazaId) throw new Error('Choose an active tenant in this plaza.');
    requireVacancy(details.unitId, details.plazaId);
    validateTerms(details);
    const tenancy = { id:nextTenancyId++, tenantId:tenant.id, unitId:details.unitId, plazaId:details.plazaId,
      rent:details.rent, start:details.start, expires:details.expires, fees:[], status:'active', endedAt:null, endReason:'' };
    data.tenancies.push(tenancy);
    syncPlazaStats(details.plazaId);
    return tenancy;
  };
  syncPlazaStats(DEMO_PLAZA_ID);

  return {
    ...ledger,
    ...announcementStore,
    ...rentAdjustments,
    listTenants:(plazaId = DEMO_PLAZA_ID) => data.tenants.filter(t => t.plazaId === plazaId),
    listUnits:(plazaId = DEMO_PLAZA_ID) => data.units.filter(unit => unit.plazaId === plazaId),
    listPayments:(plazaId = DEMO_PLAZA_ID) => data.payments.filter(payment => payment.plazaId === plazaId).map(payment => ({ ...payment })),
    listPlazas:() => data.plazas,
    listSubscriptionPayments:() => data.subscriptionPayments,
    getPlans:() => data.plans,
    listAdminNotifications:() => data.adminNotifications,
    listTenantNotifications:() => data.tenantNotifications,
    listMaintenanceRequests:(plazaId = DEMO_PLAZA_ID) => data.maintenanceRequests.filter(request => request.plazaId === plazaId),
    getTenant:findTenant,
    getUnit:findUnit,
    getTenancy:findTenancy,
    getTenancyRow:id => findTenancy(id) ? row(findTenancy(id)) : null,
    listTenancies:(tenantId, plazaId = DEMO_PLAZA_ID) => data.tenancies.filter(t => t.plazaId === plazaId && (tenantId === undefined || t.tenantId === tenantId)),
    listActiveTenancies:active,
    listOccupancies:(plazaId = DEMO_PLAZA_ID) => active(undefined, plazaId).map(row),
    assignTenancy:assign,
    updateTenancy(id, details) {
      const tenancy = requireAssignment(id);
      for (const key of ['unitId', 'tenantId', 'plazaId']) if (details[key] !== undefined && details[key] !== tenancy[key]) throw new Error('End the existing tenancy before moving its assignment.');
      const terms = { rent:details.rent ?? tenancy.rent, start:details.start ?? tenancy.start, expires:details.expires ?? tenancy.expires };
      validateTerms(terms);
      Object.assign(tenancy, terms);
      return tenancy;
    },
    endTenancy(id, reason) {
      const tenancy = requireAssignment(id);
      if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) throw new Error('Enter an ending reason of up to 500 characters.');
      const today = new Date().toISOString().slice(0, 10);
      Object.assign(tenancy, { status:tenancy.start > today ? 'cancelled' : 'ended', endedAt:today, endReason:reason.trim() });
      syncPlazaStats(tenancy.plazaId);
      return tenancy;
    },

    addTenant(details) {
      const plazaId = details.plazaId ?? DEMO_PLAZA_ID;
      const unit = data.units.find(unit => unit.plazaId === plazaId && unit.number === details.shop);
      requireVacancy(unit?.id, plazaId);
      validateTerms(details);
      const tenant = { id:nextTenantId++, plazaId, name:details.name, business:details.business, email:details.email || '', phone:details.phone || '', archived:false };
      data.tenants.push(tenant);
      assign({ ...details, plazaId, tenantId:tenant.id, unitId:unit.id });
      return tenant;
    },
    updateTenant(id, details) {
      const tenant = findTenant(id);
      if (!tenant) throw new Error('Tenant not found.');
      if (tenant.archived) throw new Error('Archived tenant profiles are read-only.');
      if (details.shop !== undefined) throw new Error('Use Manage Shops to edit an assignment.');
      const editable = ['name', 'email', 'phone', 'business'];
      editable.forEach(key => { if (Object.hasOwn(details, key)) tenant[key] = details[key]; });
      return tenant;
    },
    removeTenant(id) {
      const tenant = findTenant(id);
      if (!tenant) return null;
      if (active(id, tenant.plazaId).length) throw new Error('End all active shop assignments before archiving this tenant.');
      tenant.archived = true;
      return tenant;
    },
    getTenantApprovedAmount(id) {
      return data.payments.filter(payment => payment.tenantId === id && payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
    },
    getTenancyApprovedAmount(id) {
      return data.payments.filter(payment => payment.tenancyId === id && payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
    },
    addUnit(unit) {
      const plazaId = unit.plazaId ?? DEMO_PLAZA_ID;
      if (!data.plazas.some(plaza => plaza.id === plazaId)) throw new Error('Plaza not found.');
      if (data.units.some(item => item.plazaId === plazaId && item.number === unit.number)) throw new Error('That unit already exists.');
      const record = { ...unit, id:nextUnitId++, plazaId };
      data.units.push(record);
      syncPlazaStats(plazaId);
      return record;
    },
    updatePayment(ref, details) {
      if (Object.keys(details).some(key => !['status', 'reviewReason'].includes(key))) throw new Error('Payment identities and amounts are immutable.');
      return ledger.reviewPayment(ref, details.status, details.reviewReason || '');
    },
    addMaintenanceRequest(request) {
      const tenancy = requireAssignment(request.tenancyId);
      if (request.tenantId !== undefined && request.tenantId !== tenancy.tenantId) throw new Error('Request tenant does not match the assignment.');
      const record = { ...request, tenantId:tenancy.tenantId, plazaId:tenancy.plazaId, unitId:tenancy.unitId, unit:findUnit(tenancy.unitId).number, tenant:findTenant(tenancy.tenantId).name };
      data.maintenanceRequests.unshift(record);
      return record;
    },
    updateMaintenanceRequest(id, details) {
      const request = data.maintenanceRequests.find(item => item.id === id);
      if (!request) return null;
      Object.assign(request, details);
      return request;
    },
    addPlaza(details) {
      const plaza = { ...details, id:Math.max(0, ...data.plazas.map(item => item.id)) + 1 };
      data.plazas.unshift(plaza);
      return plaza;
    },
    setPlazaSuspended(id, suspend) {
      const plaza = data.plazas.find(item => item.id === id);
      if (!plaza || typeof suspend !== 'boolean' || suspend === (plaza.status === 'suspended')) return plaza;
      if (suspend) {
        plaza.resumeStatus = plaza.status;
        plaza.status = 'suspended';
      } else {
        plaza.status = ['active', 'trial', 'expired'].includes(plaza.resumeStatus) ? plaza.resumeStatus : 'active';
        delete plaza.resumeStatus;
      }
      return plaza;
    },
    updatePlan(key, details) {
      if (!Object.hasOwn(data.plans, key)) return null;
      Object.assign(data.plans[key], details);
      return data.plans[key];
    },
  };
}

export const repository = createRepository();
