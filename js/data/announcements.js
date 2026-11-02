import { DEMO_PLAZA_ID } from './demo-data.js';

// Demo publication records and read state. Real delivery/access require a server.
export function createAnnouncementStore(data) {
  const announcements = [];
  let nextId = 1;
  const recipients = (plazaId = DEMO_PLAZA_ID) => data.tenants
    .filter(tenant => tenant.plazaId === plazaId && !tenant.archived)
    .map(tenant => ({ tenantId:tenant.id, name:tenant.name, shops:data.tenancies
      .filter(tenancy => tenancy.plazaId === plazaId && tenancy.tenantId === tenant.id && tenancy.status === 'active')
      .map(tenancy => data.units.find(unit => unit.id === tenancy.unitId)?.number).filter(Boolean) }))
    .filter(tenant => tenant.shops.length > 0);
  const clone = announcement => ({ ...announcement,
    recipients:announcement.recipients.map(recipient => ({ ...recipient, shops:[...recipient.shops] })),
    readBy:announcement.readBy.map(read => ({ ...read })) });
  const belongsTo = (announcement, tenantId, plazaId) => announcement.plazaId === plazaId && announcement.recipients.some(recipient => recipient.tenantId === tenantId);
  const tenantView = (announcement, tenantId) => ({ id:announcement.id, plazaId:announcement.plazaId,
    title:announcement.title, body:announcement.body, publishedAt:announcement.publishedAt,
    readAt:announcement.readBy.find(read => read.tenantId === tenantId)?.readAt || null });
  return {
    getAnnouncementRecipients:recipients,
    listAnnouncements:(plazaId = DEMO_PLAZA_ID) => announcements.filter(item => item.plazaId === plazaId).map(clone),
    listTenantAnnouncements:(tenantId, plazaId = DEMO_PLAZA_ID) => announcements.filter(item => belongsTo(item, tenantId, plazaId)).map(item => tenantView(item, tenantId)),
    publishAnnouncement(details) {
      const plazaId = details.plazaId ?? DEMO_PLAZA_ID;
      if (!data.plazas.some(plaza => plaza.id === plazaId)) throw new Error('Choose an existing plaza.');
      if (typeof details.title !== 'string' || !details.title.trim() || details.title.trim().length > 120) throw new Error('Enter a subject of up to 120 characters.');
      if (typeof details.body !== 'string' || !details.body.trim() || details.body.trim().length > 3000) throw new Error('Enter a message of up to 3,000 characters.');
      if (!['all', 'selected'].includes(details.audience)) throw new Error('Choose all current tenants or selected tenants.');
      const eligible = recipients(plazaId);
      let selected = eligible;
      if (details.audience === 'selected') {
        if (!Array.isArray(details.tenantIds) || !details.tenantIds.length || details.tenantIds.some(id => !Number.isSafeInteger(id) || !eligible.some(tenant => tenant.tenantId === id))) throw new Error('Select current tenants in this plaza. Archived and unassigned tenants cannot receive new notices.');
        const ids = new Set(details.tenantIds);
        selected = eligible.filter(tenant => ids.has(tenant.tenantId));
      }
      if (!selected.length) throw new Error('There are no current tenants to receive this announcement.');
      const announcement = { id:nextId++, plazaId, title:details.title.trim(), body:details.body.trim(),
        audience:details.audience, recipients:selected, publishedAt:new Date().toISOString(), readBy:[] };
      announcements.push(announcement);
      return clone(announcement);
    },
    markAnnouncementRead(id, tenantId, plazaId = DEMO_PLAZA_ID) {
      const announcement = announcements.find(item => item.id === id);
      if (!announcement || !belongsTo(announcement, tenantId, plazaId)) throw new Error('Announcement not available to this tenant.');
      if (!announcement.readBy.some(read => read.tenantId === tenantId)) announcement.readBy.push({ tenantId, readAt:new Date().toISOString() });
      return tenantView(announcement, tenantId);
    },
  };
}
