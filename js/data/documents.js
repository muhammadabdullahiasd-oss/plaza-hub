import { DEMO_PLAZA_ID } from './demo-data.js';

export const DOCUMENT_CATEGORIES = { lease:'Lease agreement', rules:'Plaza rules', inspection:'Inspection record', other:'Other' };

// Metadata only. No file bytes, filesystem paths or download URLs are stored.
export function createDocumentStore(data) {
  const documents = [];
  let nextId = 1;
  const clone = record => record ? { ...record, visibilityHistory:record.visibilityHistory.map(event => ({ ...event })) } : null;
  const find = (id, plazaId) => documents.find(record => record.id === id && record.plazaId === plazaId);
  const requireRecord = (id, plazaId) => {
    const record = find(id, plazaId);
    if (!record) throw new Error('Document record not found in this plaza.');
    return record;
  };
  const validateVisibility = (scope, visibility) => {
    if (!['management', scope === 'tenancy' ? 'tenant' : 'plaza'].includes(visibility)) throw new Error('Choose management-only access or the audience permitted by this record scope.');
  };
  const tenantCanView = (record, tenantId, plazaId) => {
    if (record.status !== 'active' || record.plazaId !== plazaId || record.visibility === 'management') return false;
    const tenant = data.tenants.find(item => item.id === tenantId && item.plazaId === plazaId);
    if (!tenant) return false;
    if (record.scope === 'tenancy') return record.visibility === 'tenant' && record.tenantId === tenantId;
    return record.visibility === 'plaza' && !tenant.archived && data.tenancies.some(tenancy => tenancy.tenantId === tenantId && tenancy.plazaId === plazaId && tenancy.status === 'active');
  };
  const tenantView = record => ({ id:record.id, number:record.number, plazaId:record.plazaId,
    title:record.title, category:record.category, fileName:record.fileName, description:record.description,
    scope:record.scope, tenantId:record.tenantId, tenancyId:record.tenancyId, unitId:record.unitId,
    tenant:record.tenant, unit:record.unit, visibility:record.visibility, createdAt:record.createdAt });
  return {
    listDocuments:(plazaId = DEMO_PLAZA_ID) => documents.filter(record => record.plazaId === plazaId).map(clone),
    getDocument:(id, plazaId = DEMO_PLAZA_ID) => clone(find(id, plazaId)),
    listTenantDocuments:(tenantId, plazaId = DEMO_PLAZA_ID) => documents.filter(record => tenantCanView(record, tenantId, plazaId)).map(tenantView),
    getTenantDocument:(id, tenantId, plazaId = DEMO_PLAZA_ID) => {
      const record = find(id, plazaId);
      return record && tenantCanView(record, tenantId, plazaId) ? tenantView(record) : null;
    },
    registerDocument(details) {
      const plazaId = details.plazaId ?? DEMO_PLAZA_ID;
      if (!data.plazas.some(plaza => plaza.id === plazaId)) throw new Error('Choose an existing plaza.');
      if (typeof details.title !== 'string' || !details.title.trim() || details.title.trim().length > 120) throw new Error('Enter a document title of up to 120 characters.');
      if (!Object.hasOwn(DOCUMENT_CATEGORIES, details.category)) throw new Error('Choose a document category.');
      if (!['tenancy', 'plaza'].includes(details.scope)) throw new Error('Choose a tenancy or plaza document scope.');
      if (details.category === 'lease' && details.scope !== 'tenancy') throw new Error('Link a lease agreement to a specific tenancy.');
      if (typeof details.fileName !== 'string' || !details.fileName.trim() || details.fileName.trim().length > 160 || /[\\/:*?"<>|\u0000-\u001f]/.test(details.fileName) || ['.', '..'].includes(details.fileName.trim())) throw new Error('Enter an example filename of up to 160 characters, without a path or URL.');
      const description = details.description ?? '';
      if (typeof description !== 'string' || description.trim().length > 2000) throw new Error('Keep the description within 2,000 characters.');
      const visibility = details.visibility ?? 'management';
      validateVisibility(details.scope, visibility);
      let tenancy = null, tenant = null, unit = null;
      if (details.scope === 'tenancy') {
        tenancy = data.tenancies.find(item => item.id === details.tenancyId && item.plazaId === plazaId);
        tenant = tenancy && data.tenants.find(item => item.id === tenancy.tenantId && item.plazaId === plazaId);
        unit = tenancy && data.units.find(item => item.id === tenancy.unitId && item.plazaId === plazaId);
        if (!tenancy || !tenant || !unit) throw new Error('Choose an existing tenancy in this plaza.');
      } else if (details.tenancyId != null) throw new Error('A plaza-wide record cannot also target a tenancy.');
      const fileName = details.fileName.trim();
      if (documents.some(record => record.plazaId === plazaId && record.status === 'active' && record.scope === details.scope && record.tenancyId === (tenancy?.id ?? null) && record.fileName.toLowerCase() === fileName.toLowerCase())) throw new Error('An active record with this filename already exists for this scope. Change its visibility or withdraw it before registering a replacement.');
      const id = nextId++, createdAt = new Date().toISOString();
      const record = { id, number:`DEMO-DOC-${String(id).padStart(4, '0')}`, plazaId,
        title:details.title.trim(), category:details.category, fileName, description:description.trim(), scope:details.scope,
        tenancyId:tenancy?.id ?? null, tenantId:tenant?.id ?? null, unitId:unit?.id ?? null,
        tenant:tenant?.name ?? '', unit:unit?.number ?? '', visibility, status:'active', createdAt,
        withdrawnAt:null, withdrawalReason:'', visibilityHistory:[{ from:null, to:visibility, changedAt:createdAt }] };
      documents.push(record);
      return clone(record);
    },
    setDocumentVisibility(id, visibility, plazaId = DEMO_PLAZA_ID) {
      const record = requireRecord(id, plazaId);
      if (record.status !== 'active') throw new Error('Withdrawn records cannot be shared. Register a replacement instead.');
      validateVisibility(record.scope, visibility);
      if (record.visibility !== visibility) {
        record.visibilityHistory.push({ from:record.visibility, to:visibility, changedAt:new Date().toISOString() });
        record.visibility = visibility;
      }
      return clone(record);
    },
    withdrawDocument(id, reason, plazaId = DEMO_PLAZA_ID) {
      const record = requireRecord(id, plazaId);
      if (record.status === 'withdrawn') return clone(record);
      if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) throw new Error('Enter a withdrawal reason of up to 500 characters.');
      Object.assign(record, { status:'withdrawn', withdrawalReason:reason.trim(), withdrawnAt:new Date().toISOString() });
      return clone(record);
    },
  };
}
