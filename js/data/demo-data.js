export const DEMO_TENANT_ID = 6;
export const DEMO_PLAZA_ID = 1;
export const MAINTENANCE_STATUSES = { pending:'Pending', 'in-progress':'In progress', resolved:'Resolved', completed:'Completed' };
export const MAINTENANCE_CATEGORIES = ['Electrical', 'Plumbing', 'Structural / Walls', 'Roof / Ceiling', 'Doors / Windows', 'Cleaning', 'Security', 'Other'];
export const MAINTENANCE_PRIORITIES = ['Low', 'Medium', 'High', 'Emergency'];

// Each repository receives fresh sample records. Nothing here is customer data.
export function createDemoData() {
  const TENANT_SEEDS = [
    { id:1, name:'Adaeze Obi',          shop:'A-01', block:'A', business:'Fashion Retail',       rent:360000, start:'2022-01-10', expires:'2025-01-10', paid:true,  status:'expiring' },
    { id:2, name:'Biodun Stores',        shop:'A-04', block:'A', business:'Provisions / FMCG',    rent:300000, start:'2022-02-01', expires:'2025-02-01', paid:true,  status:'expiring' },
    { id:3, name:'Chidi Fabrics',        shop:'A-07', block:'A', business:'Textile & Fabrics',    rent:280000, start:'2023-03-15', expires:'2026-03-15', paid:true,  status:'active' },
    { id:4, name:'Damilola Electronics', shop:'A-10', block:'A', business:'Electronics & Gadgets',rent:420000, start:'2023-05-20', expires:'2026-05-20', paid:true,  status:'active' },
    { id:5, name:'Emeka POS Agent',      shop:'A-13', block:'A', business:'Financial Services',   rent:180000, start:'2023-08-01', expires:'2025-08-01', paid:false, status:'overdue' },
    { id:6, name:'Funmi Boutique',       shop:'D-09', block:'D', business:'Fashion & Accessories',rent:480000, start:'2022-01-14', expires:'2026-08-14', paid:true,  status:'active' },
    { id:7, name:'Grace Pharmacy',       shop:'B-03', block:'B', business:'Pharmacy & Health',    rent:540000, start:'2023-06-01', expires:'2026-06-01', paid:true,  status:'active' },
    { id:8, name:'Hassan Auto Parts',    shop:'B-06', block:'B', business:'Auto Parts & Tools',   rent:380000, start:'2022-11-01', expires:'2025-11-01', paid:true,  status:'active' },
    { id:9, name:'Ifeoma Catering',      shop:'B-09', block:'B', business:'Food & Catering',      rent:240000, start:'2023-04-10', expires:'2025-04-10', paid:false, status:'overdue' },
    { id:10,name:'Jide Legal Services',  shop:'B-12', block:'B', business:'Professional Services',rent:600000, start:'2023-07-01', expires:'2026-07-01', paid:true,  status:'active' },
    { id:11,name:'Kemi Baby World',      shop:'A-16', block:'A', business:'Baby Products',        rent:260000, start:'2024-01-01', expires:'2027-01-01', paid:true,  status:'active' },
    { id:12,name:'Leke Tailoring',       shop:'B-15', block:'B', business:'Tailoring & Alterations',rent:200000,start:'2024-03-01',expires:'2027-03-01', paid:true,  status:'active' },
  ];


  const UNITS = [];
  ['A', 'B'].forEach(block => {
    for (let number = 1; number <= 24; number += 1) {
      UNITS.push({ number:`${block}-${String(number).padStart(2, '0')}`, block, size:block === 'A' ? 30 : 45, suggestedRent:block === 'A' ? 300000 : 400000 });
    }
  });
  UNITS.push({ number:'D-09', block:'D', size:45, suggestedRent:480000 });

  const PAYMENTS = [
    { ref:'TXN-2025-0841', tenantId:6, tenant:'Funmi Boutique',       unit:'D-09', amount:480000, period:'2025', method:'Paystack',       date:'2025-01-05', status:'paid' },
    { ref:'TXN-2025-0840', tenantId:10,tenant:'Jide Legal Services',  unit:'B-12', amount:600000, period:'2025', method:'Bank Transfer',  date:'2025-01-04', status:'paid' },
    { ref:'TXN-2025-0839', tenantId:7, tenant:'Grace Pharmacy',       unit:'B-03', amount:540000, period:'2025', method:'Paystack',       date:'2025-01-03', status:'paid' },
    { ref:'TXN-2025-0838', tenantId:4, tenant:'Damilola Electronics', unit:'A-10', amount:420000, period:'2025', method:'Paystack',       date:'2025-01-02', status:'paid' },
    { ref:'TXN-2025-0837', tenantId:8, tenant:'Hassan Auto Parts',    unit:'B-06', amount:380000, period:'2025', method:'Bank Transfer',  date:'2024-12-30', status:'paid' },
    { ref:'TXN-2024-0819', tenantId:5, tenant:'Emeka POS Agent',      unit:'A-13', amount:180000, period:'2024', method:'Bank Transfer',  date:'2024-11-01', status:'pending' },
    { ref:'TXN-2024-0805', tenantId:9, tenant:'Ifeoma Catering',      unit:'B-09', amount:240000, period:'2024', method:'—',              date:'2024-09-10', status:'overdue' },
    { ref:'TXN-2025-0842', tenantId:3, tenant:'Chidi Fabrics',        unit:'A-07', amount:280000, period:'2025', method:'USSD',           date:'2025-01-06', status:'paid' },
    { ref:'TXN-2025-0843', tenantId:11,tenant:'Kemi Baby World',      unit:'A-16', amount:260000, period:'2025', method:'Paystack',       date:'2025-01-07', status:'paid' },
    { ref:'TXN-2025-0844', tenantId:12,tenant:'Leke Tailoring',       unit:'B-15', amount:200000, period:'2025', method:'Bank Transfer',  date:'2025-01-08', status:'paid' },
  ];

  const PLAZAS = [
    { id:1, name:'Sunshine Business Plaza', owner:'Chief Emeka Obi',      city:'Lagos',    units:48, tenants:41, plan:'Standard', status:'active', joined:'2024-03-15' },
    { id:2, name:'Adeyemi Shopping Complex',owner:'Alhaja A. Adeyemi',    city:'Ibadan',   units:32, tenants:29, plan:'Basic',    status:'active', joined:'2024-05-20' },
    { id:3, name:'Nwosu Commercial Plaza',  owner:'Engr. E. Nwosu',       city:'Enugu',    units:96, tenants:88, plan:'Premium',  status:'active', joined:'2024-01-10' },
    { id:4, name:'Eko Market Suites',       owner:'Mr. Tunde Afolabi',    city:'Lagos',    units:120,tenants:104,plan:'Premium',  status:'active', joined:'2023-11-05' },
    { id:5, name:'Abuja Grand Plaza',       owner:'Alhaji M. Ibrahim',    city:'Abuja',    units:60, tenants:52, plan:'Standard', status:'active', joined:'2024-07-22' },
    { id:6, name:'Delta Trade Center',      owner:'Chief A. Oghenekaro',  city:'Warri',    units:24, tenants:18, plan:'Basic',    status:'trial',  joined:'2025-01-01' },
    { id:7, name:'Kano Commercial Hub',     owner:'Alhaji S. Maigida',    city:'Kano',     units:40, tenants:35, plan:'Standard', status:'active', joined:'2024-09-14' },
    { id:8, name:'Calabar Suites',          owner:'Dr. E. Effiom',        city:'Calabar',  units:18, tenants:12, plan:'Basic',    status:'suspended',joined:'2024-04-30' },
  ];

  const SUB_PAYMENTS = [
    { plaza:'Sunshine Business Plaza', plan:'Standard', amount:35000, period:'Jan 2025', date:'2025-01-01', status:'paid' },
    { plaza:'Nwosu Commercial Plaza',  plan:'Premium',  amount:75000, period:'Jan 2025', date:'2025-01-01', status:'paid' },
    { plaza:'Eko Market Suites',       plan:'Premium',  amount:75000, period:'Jan 2025', date:'2025-01-01', status:'paid' },
    { plaza:'Adeyemi Shopping Complex',plan:'Basic',    amount:15000, period:'Jan 2025', date:'2025-01-01', status:'paid' },
    { plaza:'Abuja Grand Plaza',       plan:'Standard', amount:35000, period:'Jan 2025', date:'2025-01-01', status:'paid' },
    { plaza:'Kano Commercial Hub',     plan:'Standard', amount:35000, period:'Jan 2025', date:'2024-12-28', status:'paid' },
    { plaza:'Calabar Suites',          plan:'Basic',    amount:15000, period:'Dec 2024', date:'2024-12-01', status:'failed' },
  ];

  const PLANS = {
    basic:{ name:'Basic', price:15000, maxUnits:20, features:['Tenant management', 'Rent tracking', 'Online payments', 'Email notifications'] },
    standard:{ name:'Standard', price:35000, maxUnits:100, features:['Everything in Basic', 'Visual floor map', 'Bulk SMS reminders', 'Advanced reports', 'Maintenance requests'] },
    premium:{ name:'Premium', price:75000, maxUnits:null, features:['Everything in Standard', 'Multiple plazas', 'Custom branding', 'API access', 'Dedicated support'] },
  };

  const ADMIN_NOTIFICATIONS = [
    { type:'red',    text:'<strong>Adaeze Obi (A-01)</strong> lease expires in <strong>8 days</strong>. Immediate renewal action required.', time:'1 hour ago', unread:true },
    { type:'red',    text:'<strong>Biodun Stores (A-04)</strong> lease expires in <strong>25 days</strong>. Reminder sent.', time:'3 hours ago', unread:true },
    { type:'orange', text:'<strong>Emeka POS Agent (A-13)</strong> has an overdue payment of <strong>₦180,000</strong> for 2024.', time:'1 day ago', unread:true },
    { type:'orange', text:'<strong>Ifeoma Catering (B-09)</strong> has an overdue payment of <strong>₦240,000</strong> since September 2024.', time:'2 days ago', unread:true },
    { type:'green',  text:'<strong>Leke Tailoring (B-15)</strong> successfully paid ₦200,000 annual rent via bank transfer.', time:'3 days ago', unread:false },
    { type:'green',  text:'<strong>Kemi Baby World (A-16)</strong> successfully paid ₦260,000 via Paystack.', time:'4 days ago', unread:false },
    { type:'blue',   text:'<strong>Unit B-18</strong> is now vacant. Consider listing it to new prospects.', time:'1 week ago', unread:false },
  ];

  const TENANT_NOTIFICATIONS = [
    { type:'gold',   text:'Your lease expires in <strong>247 days</strong> (Aug 14, 2026). You can renew anytime from your portal.', time:'Today', unread:true },
    { type:'green',  text:'Your payment of <strong>₦480,000</strong> for 2025 annual rent has been confirmed. Receipt #TXN-2025-0841.', time:'Jan 5, 2025', unread:false },
    { type:'blue',   text:'Maintenance request <strong>#MR-004</strong> (Electrical) has been attended to and marked completed.', time:'Dec 20, 2024', unread:false },
  ];

  const MAINTENANCE_REQUESTS = [
    { id:'MR-004', category:'Electrical', subject:'Faulty light socket near entrance', priority:'Medium', date:'Dec 15, 2024', status:'resolved' },
    { id:'MR-003', category:'Plumbing',   subject:'Water leakage from ceiling corner', priority:'High',   date:'Nov 2, 2024',  status:'completed' },
    { id:'MR-002', category:'Structural', subject:'Cracked wall behind display shelf',  priority:'Low',    date:'Aug 10, 2024', status:'completed' },
  ];

  // Seed requests belong to the tenant represented by this demo portal.
  MAINTENANCE_REQUESTS.forEach(request => {
    request.tenantId = DEMO_TENANT_ID;
    request.tenant = 'Funmi Boutique';
    request.unit = 'D-09';
    request.description = '';
    request.managerNote = '';
  });

  // Separate people, physical shops, and the agreements linking them.
  const units = UNITS.map((unit, index) => ({ ...unit, id:index + 1, plazaId:DEMO_PLAZA_ID }));
  const tenants = TENANT_SEEDS.map(({ id, name, business }) => ({ id, plazaId:DEMO_PLAZA_ID, name, business, email:'', phone:'', archived:false }));
  const tenancies = TENANT_SEEDS.map(seed => ({
    id:seed.id, plazaId:DEMO_PLAZA_ID, tenantId:seed.id,
    unitId:units.find(unit => unit.number === seed.shop).id,
    rent:seed.rent, start:seed.start, expires:seed.expires,
    status:'active', endedAt:null, endReason:'',
    fees:seed.id === DEMO_TENANT_ID ? [{ description:'Service Charge', amount:24000 }, { description:'Waste Management Levy', amount:6000 }] : [],
  }));
  PAYMENTS.forEach(payment => {
    const tenancy = tenancies.find(item => item.tenantId === payment.tenantId && units.find(unit => unit.id === item.unitId).number === payment.unit);
    Object.assign(payment, { plazaId:tenancy.plazaId, tenancyId:tenancy.id, unitId:tenancy.unitId });
  });
  const demoTenancy = tenancies.find(tenancy => tenancy.tenantId === DEMO_TENANT_ID);
  MAINTENANCE_REQUESTS.forEach(request => Object.assign(request, { plazaId:DEMO_PLAZA_ID, tenancyId:demoTenancy.id, unitId:demoTenancy.unitId }));

  // Explicit calendar-year sample invoices preserve the original year labels.
  // This is fixture setup, not an automatic billing policy for new tenancies.
  const invoices = PAYMENTS.map((payment, index) => {
    payment.invoiceId = index + 1;
    if (payment.status === 'overdue') payment.source = 'legacy-obligation';
    return { id:index + 1, number:`INV-${String(index + 1).padStart(4, '0')}`, tenancyId:payment.tenancyId,
      tenantId:payment.tenantId, plazaId:payment.plazaId, unitId:payment.unitId, tenant:payment.tenant, unit:payment.unit,
      periodStart:`${payment.period}-01-01`, periodEnd:`${payment.period}-12-31`, dueDate:`${payment.period}-01-14`,
      items:[{ description:'Annual rent', amount:payment.amount }], issuedAt:`${payment.period}-01-01` };
  });
  invoices.push({ id:11, number:'INV-0011', tenancyId:demoTenancy.id, tenantId:DEMO_TENANT_ID, plazaId:DEMO_PLAZA_ID,
    unitId:demoTenancy.unitId, tenant:'Funmi Boutique', unit:'D-09', periodStart:'2026-01-01', periodEnd:'2026-12-31', dueDate:'2026-01-14',
    items:[{ description:'Annual rent', amount:480000 }, ...demoTenancy.fees.map(fee => ({ ...fee }))], issuedAt:'2026-01-01' });

  return { tenants, units, tenancies, invoices, payments:PAYMENTS, plazas:PLAZAS,
    subscriptionPayments:SUB_PAYMENTS, plans:PLANS, adminNotifications:ADMIN_NOTIFICATIONS,
    tenantNotifications:TENANT_NOTIFICATIONS, maintenanceRequests:MAINTENANCE_REQUESTS };
}
