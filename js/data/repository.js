import { createDemoData } from './demo-data.js';

// In-memory data access. List results are live records for rendering; callers
// should use the operations below for writes. An API adapter can replace this later.
export function createRepository(data = createDemoData()) {
  const historicalIds = [...data.tenants.map(t => t.id), ...data.payments.map(p => p.tenantId), ...data.maintenanceRequests.map(r => r.tenantId)];
  let nextTenantId = Math.max(0, ...historicalIds.filter(Number.isSafeInteger)) + 1;
  const findTenant = id => data.tenants.find(tenant => tenant.id === id);
  const requireVacancy = (shop, tenantId) => {
    if (!data.units.some(unit => unit.number === shop)) throw new Error('Choose an existing shop unit.');
    if (data.tenants.some(tenant => tenant.id !== tenantId && tenant.shop === shop)) throw new Error('That unit is already occupied.');
  };

  return {
    listTenants:() => data.tenants,
    listUnits:() => data.units,
    listPayments:() => data.payments,
    listPlazas:() => data.plazas,
    listSubscriptionPayments:() => data.subscriptionPayments,
    getPlans:() => data.plans,
    listAdminNotifications:() => data.adminNotifications,
    listTenantNotifications:() => data.tenantNotifications,
    listMaintenanceRequests:() => data.maintenanceRequests,
    getTenant:findTenant,

    addTenant(details) {
      requireVacancy(details.shop);
      const tenant = { ...details, id:nextTenantId++, paid:false };
      data.tenants.push(tenant);
      return tenant;
    },
    updateTenant(id, details) {
      const tenant = findTenant(id);
      if (!tenant) throw new Error('Tenant not found.');
      if (details.shop !== undefined && details.shop !== tenant.shop) throw new Error('Keep the existing unit when editing a tenant.');
      requireVacancy(tenant.shop, id);
      // A profile update must never overwrite identity or payment state.
      const editable = ['name', 'email', 'phone', 'business', 'rent', 'start', 'expires', 'status'];
      editable.forEach(key => { if (Object.hasOwn(details, key)) tenant[key] = details[key]; });
      return tenant;
    },
    removeTenant(id) {
      const index = data.tenants.findIndex(tenant => tenant.id === id);
      return index < 0 ? null : data.tenants.splice(index, 1)[0];
    },
    getTenantApprovedAmount(id) {
      return data.payments.filter(payment => payment.tenantId === id && payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
    },
    addUnit(unit) {
      if (data.units.some(item => item.number === unit.number)) throw new Error('That unit already exists.');
      data.units.push(unit);
      return unit;
    },
    addPayment(payment) {
      data.payments.unshift(payment);
      return payment;
    },
    updatePayment(ref, details) {
      const payment = data.payments.find(item => item.ref === ref);
      if (!payment) return null;
      Object.assign(payment, details);
      return payment;
    },
    addMaintenanceRequest(request) {
      data.maintenanceRequests.unshift(request);
      return request;
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
