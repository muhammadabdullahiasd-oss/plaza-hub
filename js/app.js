
/* ============================================================
   STATE
   ============================================================ */
let currentRole = 'super';  // super | admin | tenant
let currentPage = '';
let payStep = 1;
let loginRole = 'super';
let selectedPaymentMethod = 'provider';
const DEMO_TENANT_NAME = 'Funmi Boutique';

/* ============================================================
   SAMPLE DATA
   ============================================================ */
const TENANTS = [
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
  { ref:'TXN-2025-0841', tenant:'Funmi Boutique',       unit:'D-09', amount:480000, period:'2025', method:'Paystack',       date:'2025-01-05', status:'paid' },
  { ref:'TXN-2025-0840', tenant:'Jide Legal Services',  unit:'B-12', amount:600000, period:'2025', method:'Bank Transfer',  date:'2025-01-04', status:'paid' },
  { ref:'TXN-2025-0839', tenant:'Grace Pharmacy',       unit:'B-03', amount:540000, period:'2025', method:'Paystack',       date:'2025-01-03', status:'paid' },
  { ref:'TXN-2025-0838', tenant:'Damilola Electronics', unit:'A-10', amount:420000, period:'2025', method:'Paystack',       date:'2025-01-02', status:'paid' },
  { ref:'TXN-2025-0837', tenant:'Hassan Auto Parts',    unit:'B-06', amount:380000, period:'2025', method:'Bank Transfer',  date:'2024-12-30', status:'paid' },
  { ref:'TXN-2024-0819', tenant:'Emeka POS Agent',      unit:'A-13', amount:180000, period:'2024', method:'Bank Transfer',  date:'2024-11-01', status:'pending' },
  { ref:'TXN-2024-0805', tenant:'Ifeoma Catering',      unit:'B-09', amount:240000, period:'2024', method:'—',              date:'2024-09-10', status:'overdue' },
  { ref:'TXN-2025-0842', tenant:'Chidi Fabrics',        unit:'A-07', amount:280000, period:'2025', method:'USSD',           date:'2025-01-06', status:'paid' },
  { ref:'TXN-2025-0843', tenant:'Kemi Baby World',      unit:'A-16', amount:260000, period:'2025', method:'Paystack',       date:'2025-01-07', status:'paid' },
  { ref:'TXN-2025-0844', tenant:'Leke Tailoring',       unit:'B-15', amount:200000, period:'2025', method:'Bank Transfer',  date:'2025-01-08', status:'paid' },
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
  request.tenant = DEMO_TENANT_NAME;
  request.unit = 'D-09';
  request.description = '';
  request.managerNote = '';
});
const MAINTENANCE_STATUSES = { pending:'Pending', 'in-progress':'In progress', resolved:'Resolved', completed:'Completed' };
const MAINTENANCE_CATEGORIES = ['Electrical', 'Plumbing', 'Structural / Walls', 'Roof / Ceiling', 'Doors / Windows', 'Cleaning', 'Security', 'Other'];
const MAINTENANCE_PRIORITIES = ['Low', 'Medium', 'High', 'Emergency'];

/* ============================================================
   NAV CONFIG PER ROLE
   ============================================================ */
const NAV_CONFIG = {
  super: [
    { label:'Main', items:[
      { icon:'📊', text:'Dashboard',           page:'super-dashboard' },
      { icon:'🏢', text:'Plazas',              page:'super-plazas' },
      { icon:'💎', text:'Subscriptions',       page:'super-subscriptions' },
      { icon:'💵', text:'Platform Revenue',    page:'super-revenue' },
    ]},
    { label:'System', items:[
      { icon:'⚙️', text:'Settings',            page:'super-settings' },
      { icon:'🚪', text:'Sign Out',             page:'logout' },
    ]},
  ],
  admin: [
    { label:'Management', items:[
      { icon:'📊', text:'Dashboard',           page:'admin-dashboard' },
      { icon:'👥', text:'Tenants',             page:'admin-tenants',      badge:'3' },
      { icon:'🏪', text:'Units & Shops',       page:'admin-units' },
      { icon:'💳', text:'Payments',            page:'admin-payments' },
    ]},
    { label:'Services', items:[
      { icon:'🔧', text:'Maintenance', page:'admin-maintenance' },
    ]},
    { label:'Analytics', items:[
      { icon:'📈', text:'Reports',             page:'admin-reports' },
      { icon:'🔔', text:'Notifications',       page:'admin-notifications', badge:'5' },
    ]},
    { label:'Account', items:[
      { icon:'⚙️', text:'Settings',            page:'admin-settings' },
      { icon:'🚪', text:'Sign Out',             page:'logout' },
    ]},
  ],
  tenant: [
    { label:'My Account', items:[
      { icon:'🏠', text:'Dashboard',           page:'tenant-dashboard' },
      { icon:'💳', text:'Pay Fees',            page:'tenant-pay' },
      { icon:'🧾', text:'My Receipts',         page:'tenant-receipts' },
    ]},
    { label:'Services', items:[
      { icon:'🔧', text:'Maintenance',         page:'tenant-maintenance' },
      { icon:'📄', text:'My Lease',            page:'tenant-lease' },
      { icon:'🔔', text:'Notifications',       page:'tenant-notifications', badge:'3' },
    ]},
    { label:'Account', items:[
      { icon:'🚪', text:'Sign Out',             page:'logout' },
    ]},
  ],
};

const ROLE_DEFAULTS = { super:'super-dashboard', admin:'admin-dashboard', tenant:'tenant-dashboard' };

const ROLE_USER = {
  super:  { name:'Super Admin', role:'Platform Owner',  initial:'S', bg:'rgba(139,92,246,0.2)',  color:'var(--purple)' },
  admin:  { name:'Emeka Obi',   role:'Plaza Admin',     initial:'E', bg:'rgba(59,130,246,0.2)',  color:'var(--accent2)' },
  tenant: { name:'Funmi Boutique',role:'Shop D-09',     initial:'F', bg:'rgba(245,158,11,0.2)',  color:'var(--gold)' },
};

/* ============================================================
   PAGE / ROLE SWITCHING
   ============================================================ */
function showLanding() {
  hideAll(); document.getElementById('page-landing').style.display = 'block';
}
function showLogin(role) {
  hideAll(); document.getElementById('page-login').style.display = 'block';
  switchLoginTab(role || 'super');
}
function showRegister() {
  hideAll(); document.getElementById('page-register').style.display = 'block';
}
function hideAll() {
  document.getElementById('page-landing').style.display = 'none';
  document.getElementById('page-login').style.display = 'none';
  document.getElementById('page-register').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
}

function switchLoginTab(role) {
  loginRole = role;
  ['super','admin','tenant'].forEach(r => {
    document.getElementById('ltab-'+r).classList.toggle('active', r===role);
  });
  const labels = { super:'Sign In as Super Admin', admin:'Sign In as Plaza Admin', tenant:'Sign In as Tenant' };
  document.getElementById('login-submit-btn').textContent = labels[role];
}

function doLogin() {
  switchRole(loginRole);
  hideAll();
  document.getElementById('app-shell').style.display = 'block';
  showToast('Demo dashboard opened. No authentication was performed.', 'info');
}

function doRegister() {
  showToast('Opening the admin demo. No account was created.', 'info');
  setTimeout(() => { switchRole('admin'); hideAll(); document.getElementById('app-shell').style.display = 'block'; }, 1500);
}

function switchRole(role) {
  currentRole = role;
  // Role switcher buttons
  ['super','admin','tenant'].forEach(r => {
    document.getElementById('rbtn-'+r)?.classList.toggle('active', r===role);
  });
  // Sidebar user info
  const u = ROLE_USER[role];
  document.getElementById('sidebar-avatar').style.background = u.bg;
  document.getElementById('sidebar-avatar').style.color = u.color;
  document.getElementById('sidebar-avatar').textContent = u.initial;
  document.getElementById('sidebar-username').textContent = u.name;
  document.getElementById('sidebar-userrole').textContent = u.role;
  document.getElementById('topbar-avatar').style.background = u.bg;
  document.getElementById('topbar-avatar').style.color = u.color;
  document.getElementById('topbar-avatar').textContent = u.initial;
  // Build sidebar
  buildSidebar(role);
  // Navigate to default page
  navTo(ROLE_DEFAULTS[role]);
}

function buildSidebar(role) {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';
  NAV_CONFIG[role].forEach(group => {
    const grp = document.createElement('div');
    grp.className = 'nav-group';
    grp.innerHTML = `<div class="nav-group-label">${group.label}</div>`;
    group.items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'nav-item';
      el.id = 'nav-'+item.page;
      el.innerHTML = `<span class="nav-icon">${item.icon}</span>${item.text}${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}`;
      el.onclick = () => { if(item.page === 'logout') { showLanding(); } else { navTo(item.page); } };
      grp.appendChild(el);
    });
    nav.appendChild(grp);
  });
}

function navTo(page) {
  if (page === 'notifications') {
    page = currentRole === 'tenant' ? 'tenant-notifications' : currentRole === 'admin' ? 'admin-notifications' : 'super-settings';
  }
  if (page === 'settings') {
    page = currentRole === 'tenant' ? 'tenant-lease' : currentRole === 'admin' ? 'admin-settings' : 'super-settings';
  }
  currentPage = page;
  // Hide all app pages
  document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-'+page);
  if (target) target.classList.add('active');
  // Update active nav
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const navEl = document.getElementById('nav-'+page);
  if (navEl) navEl.classList.add('active');
  // Update topbar title
  const titles = {
    'super-dashboard':'Dashboard', 'super-plazas':'Plazas Management',
    'super-subscriptions':'Subscriptions & Plans', 'super-revenue':'Platform Revenue',
    'super-settings':'Settings',
    'admin-dashboard':'Dashboard', 'admin-tenants':'Tenants',
    'admin-units':'Units & Shops', 'admin-payments':'Payments',
    'admin-reports':'Reports', 'admin-notifications':'Notifications',
    'admin-settings':'Settings', 'admin-maintenance':'Maintenance Requests',
    'tenant-dashboard':'My Dashboard', 'tenant-pay':'Pay Fees',
    'tenant-receipts':'My Receipts', 'tenant-maintenance':'Maintenance Requests',
    'tenant-lease':'My Lease', 'tenant-notifications':'Notifications',
  };
  document.getElementById('topbar-title').textContent = titles[page] || 'PlazaHub';
  // Render dynamic content
  renderPage(page);
}

/* ============================================================
   PAGE RENDERERS
   ============================================================ */
function renderPage(page) {
  switch(page) {
    case 'super-dashboard':    renderSuperDashboard(); break;
    case 'super-plazas':       renderPlazasList(); break;
    case 'super-subscriptions':renderSubPayments(); renderPlanCards(); break;
    case 'super-revenue':      renderSuperRevenue(); break;
    case 'admin-dashboard':    renderAdminDashboard(); break;
    case 'admin-tenants':      renderTenants(TENANTS); break;
    case 'admin-units':        renderUnits(); break;
    case 'admin-payments':     renderPayments(); break;
    case 'admin-reports':      renderReports(); break;
    case 'admin-notifications':renderAdminNotifs(); break;
    case 'admin-maintenance':  renderAdminMaintenance(); break;
    case 'tenant-dashboard':   renderTenantDashboard(); break;
    case 'tenant-pay':         renderPayStep(1); break;
    case 'tenant-receipts':    renderReceipts(); break;
    case 'tenant-maintenance': renderMaintenance(); break;
    case 'tenant-notifications':renderTenantNotifs(); break;
  }
}

/* ---- Super Admin ---- */
function renderSuperDashboard() {
  renderPlazaSummary();
  // Recent plazas table
  const tbody = document.getElementById('super-recent-plazas');
  if (!tbody) return;
  tbody.innerHTML = [...PLAZAS].sort((a, b) => b.joined.localeCompare(a.joined) || b.id - a.id).slice(0,5).map(p => `
    <tr>
      <td><div class="cell-user"><div class="avatar" style="background:rgba(59,130,246,0.15);color:var(--accent2);">${escapeHtml(p.name[0])}</div><div><div class="cell-name">${escapeHtml(p.name)}</div><div class="cell-sub">${escapeHtml(p.city)}</div></div></div></td>
      <td>${escapeHtml(p.owner)}</td>
      <td>${escapeHtml(p.city)}</td>
      <td>${p.units}</td>
      <td><span class="badge ${p.plan==='Premium'?'badge-gold':p.plan==='Standard'?'badge-blue':'badge-gray'}">${p.plan}</span></td>
      <td>${statusBadge(p.status)}</td>
      <td>${formatDate(p.joined)}</td>
    </tr>`).join('');
  buildBarChart('super-revenue-chart', [180,210,195,240,220,280,265,290,275,300,310,320], ['J','F','M','A','M','J','J','A','S','O','N','D'], 'var(--accent)');
}

function renderPlazasList() {
  renderPlazaSummary();
  const container = document.getElementById('plazas-list');
  if (!container) return;
  const query = document.getElementById('plaza-search')?.value.trim().toLowerCase() || '';
  const status = document.getElementById('plaza-status-filter')?.value || 'all';
  const plan = document.getElementById('plaza-plan-filter')?.value || 'all';
  const filtered = PLAZAS.filter(p => [p.name, p.owner, p.city].some(value => value.toLowerCase().includes(query)) && (status === 'all' || p.status === status) && (plan === 'all' || p.plan === plan));
  container.innerHTML = filtered.map(p => `
    <div class="plaza-row-card">
      <div class="avatar-lg" style="background:rgba(59,130,246,0.15);color:var(--accent2);">${escapeHtml(p.name[0])}</div>
      <div class="plaza-row-info">
        <div class="plaza-row-name">${escapeHtml(p.name)}</div>
        <div class="plaza-row-meta">👤 ${escapeHtml(p.owner)} &nbsp;·&nbsp; 📍 ${escapeHtml(p.city)} &nbsp;·&nbsp; Joined ${formatDate(p.joined)}</div>
      </div>
      <div class="plaza-row-stats">
        <div class="plaza-stat"><div class="plaza-stat-v">${p.units}</div><div class="plaza-stat-l">Units</div></div>
        <div class="plaza-stat"><div class="plaza-stat-v">${p.tenants}</div><div class="plaza-stat-l">Tenants</div></div>
        <div class="plaza-stat"><div class="plaza-stat-v">${p.units ? Math.round(p.tenants/p.units*100) : 0}%</div><div class="plaza-stat-l">Occupied</div></div>
      </div>
      <span class="badge ${p.plan==='Premium'?'badge-gold':p.plan==='Standard'?'badge-blue':'badge-gray'}">${p.plan}</span>
      ${statusBadge(p.status)}
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-ghost" onclick="openPlazaDetail(${p.id})">View</button>
        <button class="btn btn-sm ${p.status === 'suspended' ? 'btn-green' : 'btn-red'}" onclick="confirmPlazaStatusChange(${p.id})">${p.status === 'suspended' ? 'Restore' : 'Suspend'}</button>
      </div>
    </div>`).join('') || '<div class="empty-state"><h3>No plazas found</h3><p>Try a different search term or filter.</p></div>';
}

function filterPlazas(q) {
  const input = document.getElementById('plaza-search');
  if (input) input.value = q;
  renderPlazasList();
}

function renderPlazaSummary() {
  const values = {
    'super-plaza-count':PLAZAS.length,
    'super-tenant-count':PLAZAS.reduce((sum, plaza) => sum + plaza.tenants, 0),
    'plaza-summary':`${PLAZAS.length} plazas · ${PLAZAS.filter(p => p.status === 'active').length} active · ${PLAZAS.filter(p => p.status === 'trial').length} trial · ${PLAZAS.filter(p => p.status === 'suspended').length} suspended`,
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  const distribution = document.getElementById('super-plan-distribution');
  if (distribution) {
    const active = PLAZAS.filter(plaza => plaza.status === 'active');
    distribution.innerHTML = ['Basic', 'Standard', 'Premium'].map(plan => {
      const count = active.filter(plaza => plaza.plan === plan).length;
      const percent = active.length ? Math.round(count / active.length * 100) : 0;
      return `<div><div class="flex items-center justify-between mb-8"><span class="text-sm">${plan} (${count} plazas)</span><span class="text-sm font-bold">${percent}%</span></div><div class="progress"><div class="progress-fill" style="width:${percent}%;background:var(--accent);"></div></div></div>`;
    }).join('') + `<p class="maint-meta">${PLAZAS.filter(p => p.status === 'trial').length} trial · ${PLAZAS.filter(p => p.status === 'suspended').length} suspended · ${PLAZAS.filter(p => p.status === 'expired').length} expired</p>`;
  }
}

function openPlazaDetail(id) {
  if (currentRole !== 'super') return;
  const plaza = PLAZAS.find(item => item.id === id);
  if (!plaza) return;
  const rows = { Plaza:plaza.name, Owner:plaza.owner, Email:plaza.email || 'Not recorded in sample data', City:plaza.city, Units:plaza.units, Tenants:plaza.tenants, Plan:plaza.plan, Joined:formatDate(plaza.joined) };
  openModal('Plaza Details', `<div class="lease-card">${Object.entries(rows).map(([label, value]) => `<div class="lease-row"><div class="lease-key">${label}</div><div class="lease-val">${escapeHtml(value)}</div></div>`).join('')}<div class="lease-row"><div class="lease-key">Status</div><div class="lease-val">${statusBadge(plaza.status)}</div></div></div>`,
    `<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button><button class="btn btn-primary" onclick="confirmPlazaStatusChange(${id})">${plaza.status === 'suspended' ? 'Restore plaza' : 'Suspend plaza'}</button>`);
}

function confirmPlazaStatusChange(id) {
  if (currentRole !== 'super') return;
  const plaza = PLAZAS.find(item => item.id === id);
  if (!plaza) return;
  const suspend = plaza.status !== 'suspended';
  openModal(suspend ? 'Suspend Plaza' : 'Restore Plaza', `<p>${suspend ? 'Suspend' : 'Restore'} <strong>${escapeHtml(plaza.name)}</strong> for this demo session?</p><p class="maint-meta">This updates the sample account status. It does not change access to a live account.</p>`,
    `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn ${suspend ? 'btn-red' : 'btn-primary'}" onclick="savePlazaStatus(${id}, ${suspend})">${suspend ? 'Suspend' : 'Restore'}</button>`);
}

function savePlazaStatus(id, suspend) {
  if (currentRole !== 'super' || typeof suspend !== 'boolean') return;
  const plaza = PLAZAS.find(item => item.id === id);
  if (!plaza || suspend === (plaza.status === 'suspended')) return;
  if (suspend) {
    plaza.resumeStatus = plaza.status;
    plaza.status = 'suspended';
  } else {
    plaza.status = ['active', 'trial', 'expired'].includes(plaza.resumeStatus) ? plaza.resumeStatus : 'active';
    delete plaza.resumeStatus;
  }
  closeModalDirect();
  renderPlazasList();
  renderSuperDashboard();
  showToast('Plaza status updated for this demo session.', 'success');
}

function renderSubPayments() {
  const tbody = document.getElementById('sub-payments-body');
  if (!tbody) return;
  tbody.innerHTML = SUB_PAYMENTS.map(s => `
    <tr>
      <td>${s.plaza}</td>
      <td><span class="badge ${s.plan==='Premium'?'badge-gold':s.plan==='Standard'?'badge-blue':'badge-gray'}">${s.plan}</span></td>
      <td>₦${s.amount.toLocaleString()}</td>
      <td>${s.period}</td>
      <td>${s.date}</td>
      <td>${s.status==='paid'?'<span class="badge badge-green">✓ Paid</span>':'<span class="badge badge-red">✗ Failed</span>'}</td>
    </tr>`).join('');
}

function renderSuperRevenue() {
  buildBarChart('super-monthly-chart', getMonthlyCollections(SUB_PAYMENTS), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], 'var(--purple)', 200);
}

function getMonthlyCollections(records) {
  const monthly = Array(12).fill(0);
  records.filter(record => record.status === 'paid').forEach(record => {
    const month = new Date(record.date).getMonth();
    if (month >= 0 && month < 12) monthly[month] += record.amount;
  });
  return monthly;
}

function getQuarterlyCollections(records) {
  const quarterly = Array(4).fill(0);
  records.filter(record => record.status === 'paid').forEach(record => {
    const month = new Date(record.date).getMonth();
    if (month >= 0 && month < 12) quarterly[Math.floor(month / 3)] += record.amount;
  });
  return quarterly;
}

function getTenantApprovedAmount(tenantName) {
  return PAYMENTS.filter(payment => payment.tenant === tenantName && payment.status === 'paid')
    .reduce((total, payment) => total + payment.amount, 0);
}

function calculateOperationalSummary() {
  const tenantMap = Object.fromEntries(TENANTS.map(tenant => [tenant.shop, tenant]));
  const occupied = UNITS.filter(unit => tenantMap[unit.number]).length;
  const expiring = TENANTS.filter(tenant => {
    const days = daysUntil(tenant.expires);
    return days >= 0 && days <= 30;
  }).length;
  const overdue = TENANTS.filter(tenant => tenant.status === 'overdue' || daysUntil(tenant.expires) < 0).length;
  const approvedPayments = PAYMENTS.filter(payment => payment.status === 'paid');
  const pendingPayments = PAYMENTS.filter(payment => payment.status === 'pending');
  const collected = approvedPayments.reduce((total, payment) => total + payment.amount, 0);
  const pending = pendingPayments.reduce((total, payment) => total + payment.amount, 0);
  const outstanding = TENANTS.filter(tenant => !tenant.paid).reduce((total, tenant) => total + tenant.rent, 0);
  const collectionRate = collected + outstanding > 0 ? Math.round(collected / (collected + outstanding) * 100) : 0;
  return { occupied, vacant:Math.max(UNITS.length - occupied, 0), expiring, overdue, collected, pending, outstanding, collectionRate, approvedCount:approvedPayments.length, pendingCount:pendingPayments.length };
}

function renderOperationalSummaries() {
  const summary = calculateOperationalSummary();
  const values = {
    'admin-annual-revenue': formatNaira(summary.collected),
    'admin-expiring-count': summary.expiring,
    'unit-occupied-count': summary.occupied,
    'unit-vacant-count': summary.vacant,
    'unit-expiring-count': summary.expiring,
    'unit-overdue-count': summary.overdue,
    'payments-total-collected': formatNaira(summary.collected),
    'payments-outstanding': formatNaira(summary.outstanding),
    'payments-pending': formatNaira(summary.pending),
    'payments-collection-rate': `${summary.collectionRate}%`,
    'payments-paid-count': `${summary.approvedCount} approved records`,
    'payments-pending-count': `${summary.pendingCount} pending transfers`,
    'payments-overdue-count': `${summary.overdue} tenant obligations`,
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  const occupiedPercent = UNITS.length ? Math.round(summary.occupied / UNITS.length * 100) : 0;
  const approvedTenants = new Set(PAYMENTS.filter(payment => payment.status === 'paid').map(payment => payment.tenant)).size;
  const overduePercent = TENANTS.length ? Math.round(summary.overdue / TENANTS.length * 100) : 0;
  const reportStats = {
    'report-occupied-stat': `${summary.occupied}/${UNITS.length} — ${occupiedPercent}%`,
    'report-collected-stat': `${approvedTenants}/${TENANTS.length} tenants — ${summary.collectionRate}%`,
    'report-overdue-stat': `${summary.overdue}/${TENANTS.length} — ${overduePercent}%`,
  };
  Object.entries(reportStats).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  const reportBars = { 'report-occupied-bar':occupiedPercent, 'report-collected-bar':summary.collectionRate, 'report-overdue-bar':overduePercent };
  Object.entries(reportBars).forEach(([id, percent]) => {
    const element = document.getElementById(id);
    if (element) element.style.width = `${percent}%`;
  });
}

/* ---- Plaza Admin ---- */
function renderAdminDashboard() {
  renderOperationalSummaries();
  // Expiring leases
  const expTbody = document.getElementById('admin-expiring-body');
  if (expTbody) {
    const expiring = TENANTS.filter(t => t.status === 'expiring' || t.status === 'overdue');
    expTbody.innerHTML = expiring.slice(0,5).map(t => {
      const days = daysUntil(t.expires);
      return `<tr>
        <td><div class="cell-user"><div class="avatar" style="${avatarStyle(t.name)}">${t.name[0]}</div><span>${t.name}</span></div></td>
        <td>${t.shop}</td>
        <td>${formatDate(t.expires)}</td>
        <td>${expiryBadge(days)}</td>
      </tr>`;
    }).join('');
  }
  // Recent payments
  const payTbody = document.getElementById('admin-recent-payments');
  if (payTbody) {
    payTbody.innerHTML = PAYMENTS.slice(0,5).map(p => `
      <tr>
        <td><div class="cell-user"><div class="avatar" style="${avatarStyle(p.tenant)}">${p.tenant[0]}</div><span>${p.tenant}</span></div></td>
        <td>${p.unit}</td>
        <td style="font-weight:700;">₦${p.amount.toLocaleString()}</td>
        <td><span class="badge badge-gray">${p.method}</span></td>
        <td>${formatDate(p.date)}</td>
        <td>${payStatusBadge(p.status)}</td>
      </tr>`).join('');
  }
  buildBarChart('admin-revenue-chart', getMonthlyCollections(PAYMENTS), ['J','F','M','A','M','J','J','A','S','O','N','D'], 'var(--accent)');
}

function renderTenants(list) {
  const tbody = document.getElementById('tenants-tbody');
  if (!tbody) return;
  tbody.innerHTML = list.map(t => {
    const days = daysUntil(t.expires);
    return `<tr>
      <td><div class="cell-user"><div class="avatar" style="${avatarStyle(t.name)}">${t.name[0]}</div><div><div class="cell-name">${t.name}</div></div></div></td>
      <td><span class="badge badge-gray">${t.shop}</span></td>
      <td>${t.business}</td>
      <td style="font-weight:700;">₦${t.rent.toLocaleString()}</td>
      <td>${formatDate(t.start)}</td>
      <td>${formatDate(t.expires)}</td>
      <td>${expiryBadge(days)}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-ghost" onclick="openEditTenant(${t.id})">✏️ Edit</button>
          <button class="btn btn-sm btn-red" onclick="deleteTenant(${t.id})">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterTenants(q) {
  const filter = (document.getElementById('tenant-status-filter')?.value || '').toLowerCase();
  const filtered = TENANTS.filter(t => {
    const matchQ = !q || t.name.toLowerCase().includes(q.toLowerCase()) || t.shop.toLowerCase().includes(q.toLowerCase()) || t.business.toLowerCase().includes(q.toLowerCase());
    const matchF = !filter || t.status === filter;
    return matchQ && matchF;
  });
  renderTenants(filtered);
}

function renderUnits() {
  renderOperationalSummaries();
  const tenantMap = Object.fromEntries(TENANTS.map(tenant => [tenant.shop, tenant]));
  const blocks = [...new Set(UNITS.map(unit => unit.block))];
  const map = document.getElementById('unit-map-blocks');
  if (map) {
    map.innerHTML = blocks.map((block, index) => `<div style="margin-bottom:12px;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;">Block ${block}</div><div class="unit-grid ${index < blocks.length - 1 ? 'mb-20' : ''}" id="unit-grid-${block}"></div>`).join('');
    UNITS.forEach(unit => {
      const tenant = tenantMap[unit.number];
      const status = tenant?.status || 'vacant';
      const className = { active:'unit-occupied', expiring:'unit-expiring', overdue:'unit-overdue', vacant:'unit-vacant' }[status] || 'unit-vacant';
      const cell = document.createElement('div');
      cell.className = `unit-cell ${className}`;
      cell.innerHTML = `<div class="unit-no">${unit.number}</div>`;
      cell.title = `${unit.number} — ${status.charAt(0).toUpperCase() + status.slice(1)}`;
      cell.onclick = () => showUnitDetail(unit.number, status);
      document.getElementById(`unit-grid-${unit.block}`)?.appendChild(cell);
    });
  }
  const tbody = document.getElementById('units-tbody');
  if (!tbody) return;
  tbody.innerHTML = UNITS.map(unit => {
    const tenant = tenantMap[unit.number];
    return `<tr>
      <td><span class="badge badge-gray">${unit.number}</span></td>
      <td>Block ${unit.block}</td>
      <td>${unit.size} sqm</td>
      <td>₦${(tenant ? tenant.rent : unit.suggestedRent).toLocaleString()}</td>
      <td>${tenant ? escapeHtml(tenant.name) : '<span class="text-faint">—</span>'}</td>
      <td>${tenant ? expiryBadge(daysUntil(tenant.expires)) : '<span class="badge badge-gray">Vacant</span>'}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="showUnitDetail('${unit.number}', '${tenant?.status || 'vacant'}')">${tenant ? 'View Tenant' : 'Assign Tenant'}</button></td>
    </tr>`;
  }).join('');
}

function showUnitDetail(no, status) {
  const tenantMap = {}; TENANTS.forEach(t => { tenantMap[t.shop] = t; });
  const t = tenantMap[no];
  openModal(`Unit ${no} Details`, t ? `
    <div class="lease-card">
      <div class="lease-row"><div class="lease-key">Unit</div><div class="lease-val">${no}</div></div>
      <div class="lease-row"><div class="lease-key">Block</div><div class="lease-val">Block ${no[0]}</div></div>
      <div class="lease-row"><div class="lease-key">Tenant</div><div class="lease-val">${t.name}</div></div>
      <div class="lease-row"><div class="lease-key">Business</div><div class="lease-val">${t.business}</div></div>
      <div class="lease-row"><div class="lease-key">Annual Rent</div><div class="lease-val" style="color:var(--gold);">₦${t.rent.toLocaleString()}</div></div>
      <div class="lease-row"><div class="lease-key">Lease Expires</div><div class="lease-val">${formatDate(t.expires)}</div></div>
      <div class="lease-row"><div class="lease-key">Status</div><div class="lease-val">${expiryBadge(daysUntil(t.expires))}</div></div>
    </div>` : `<div class="empty-state"><div class="empty-icon">⬜</div><h3>Unit is Vacant</h3><p>This unit currently has no tenant assigned.</p></div>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button>${t ? '<button class="btn btn-primary" onclick="openEditTenant('+t.id+')">Edit Tenant</button>' : '<button class="btn btn-primary" onclick="closeModalDirect();openAddTenant()">Assign Tenant</button>'}`);
}

function renderPayments() {
  renderOperationalSummaries();
  const tbody = document.getElementById('payments-tbody');
  if (!tbody) return;
  tbody.innerHTML = PAYMENTS.map(p => `
    <tr>
      <td><span style="font-size:11px;font-family:monospace;color:var(--text2);">${p.ref}</span></td>
      <td><div class="cell-user"><div class="avatar" style="${avatarStyle(p.tenant)}">${p.tenant[0]}</div><span>${p.tenant}</span></div></td>
      <td>${p.unit}</td>
      <td style="font-weight:700;">₦${p.amount.toLocaleString()}</td>
      <td>${p.period}</td>
      <td><span class="badge badge-gray">${p.method}</span></td>
      <td>${formatDate(p.date)}</td>
      <td>${payStatusBadge(p.status)}</td>
      <td>${p.status==='pending' ? `<button class="btn btn-sm btn-primary" onclick="openPaymentReview('${p.ref}')">Review</button>` : `<button class="btn btn-sm btn-ghost" onclick="showToast('Payment details are shown in this demo table.','info')">View</button>`}</td>
    </tr>`).join('');
}

function renderReports() {
  renderOperationalSummaries();
  buildBarChart('reports-quarterly-chart',
    getQuarterlyCollections(PAYMENTS), ['Q1','Q2','Q3','Q4'],
    ['var(--accent)','var(--accent)','var(--gold)','rgba(59,130,246,0.3)'], 180);
  // Top units
  const tbody = document.getElementById('reports-top-units');
  if (!tbody) return;
  tbody.innerHTML = getUnitReportRows().map((row,i) => {
    const { tenant:t, collected, balance, status } = row;
    return `<tr>
      <td style="color:var(--text3);font-weight:700;">${i+1}</td>
      <td><span class="badge badge-gray">${t.shop}</span></td>
      <td>${escapeHtml(t.name)}</td>
      <td>₦${t.rent.toLocaleString()}</td>
      <td style="color:var(--green);">₦${collected.toLocaleString()}</td>
      <td style="color:${balance>0?'var(--red)':'var(--green)'};">₦${balance.toLocaleString()}</td>
      <td><span class="badge ${status === 'Paid' ? 'badge-green' : status === 'Overdue' ? 'badge-red' : 'badge-orange'}">${status}</span></td>
    </tr>`;
  }).join('');
}

function getUnitReportRows() {
  return [...TENANTS].sort((a, b) => b.rent - a.rent).slice(0, 8).map(tenant => {
    const collected = getTenantApprovedAmount(tenant.name);
    const balance = Math.max(tenant.rent - collected, 0);
    return { tenant, collected, balance, status:balance === 0 ? 'Paid' : tenant.status === 'overdue' ? 'Overdue' : 'Partial' };
  });
}

function buildCsv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    // Keep numbers numeric, but prevent user text from becoming spreadsheet formulas.
    let cell = String(value ?? '');
    if (typeof value === 'string' && (/^[\s\uFEFF]*[=+@-]/.test(cell) || /^[\t\r\n]/.test(cell))) cell = "'" + cell;
    return '"' + cell.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n');
}

function getExportData(kind) {
  if (currentRole === 'admin' && kind === 'tenants') {
    return { name:'all-tenants', rows:[['Tenant', 'Unit', 'Business', 'Annual rent (NGN)', 'Lease start', 'Lease end', 'Lease status'], ...TENANTS.map(t => [t.name, t.shop, t.business, t.rent, t.start, t.expires, t.status])] };
  }
  if (currentRole === 'admin' && kind === 'payments') {
    return { name:'all-payment-records', rows:[['Reference', 'Tenant', 'Unit', 'Amount (NGN)', 'Period', 'Method', 'Date', 'Status'], ...PAYMENTS.map(p => [p.ref, p.tenant, p.unit, p.amount, p.period, p.method, p.date, p.status])] };
  }
  if (currentRole === 'super' && kind === 'subscriptions') {
    return { name:'subscription-payments', rows:[['Plaza', 'Plan', 'Amount (NGN)', 'Period', 'Date', 'Status'], ...SUB_PAYMENTS.map(p => [p.plaza, p.plan, p.amount, p.period, p.date, p.status])] };
  }
  if (currentRole === 'admin' && kind === 'report') {
    return { name:'shown-unit-report', rows:[['Rank', 'Unit', 'Tenant', 'Annual rent (NGN)', 'Approved collections, all periods (NGN)', 'Sample balance (NGN)', 'Status'], ...getUnitReportRows().map((row, index) => [index + 1, row.tenant.shop, row.tenant.name, row.tenant.rent, row.collected, row.balance, row.status])] };
  }
  return null;
}

function exportCsv(kind) {
  const data = getExportData(kind);
  if (!data) return;
  const blob = new Blob([buildCsv(data.rows)], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `plazahub-demo-${data.name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`CSV download started (${data.rows.length - 1} records).`, 'success');
}

function renderAdminNotifs() {
  const list = document.getElementById('admin-notif-list');
  if (!list) return;
  list.innerHTML = ADMIN_NOTIFICATIONS.map(n => `
    <div class="notif-item ${n.unread?'notif-unread':''}">
      <div class="notif-dot" style="background:${n.type==='red'?'var(--red)':n.type==='orange'?'var(--orange)':n.type==='green'?'var(--green)':'var(--accent)'};"></div>
      <div class="notif-body"><div class="notif-text">${n.text}</div><div class="notif-time">${n.time}</div></div>
    </div>`).join('');
}

/* ---- Tenant ---- */
function renderTenantDashboard() {
  const list = document.getElementById('tenant-recent-payments');
  if (!list) return;
  list.innerHTML = PAYMENTS.filter(p => p.tenant === DEMO_TENANT_NAME).slice(0,3).map(p => `
    <div class="receipt-item">
      <div class="receipt-icon">✅</div>
      <div class="receipt-info"><div class="receipt-name">${p.period} Annual Rent</div><div class="receipt-date">${formatDate(p.date)} · ${p.method} · ${payStatusBadge(p.status)}</div></div>
      <div><div class="receipt-amount">₦${p.amount.toLocaleString()}</div><div class="receipt-ref">${p.ref}</div></div>
    </div>`).join('');
}

function renderReceipts() {
  const list = document.getElementById('tenant-receipts-list');
  if (!list) return;
  list.innerHTML = PAYMENTS.filter(p => p.tenant === DEMO_TENANT_NAME && p.status === 'paid').map(p => `
    <div class="receipt-item">
      <div class="receipt-icon">🧾</div>
      <div class="receipt-info"><div class="receipt-name">${p.period} Annual Rent — Unit ${p.unit}</div><div class="receipt-date">${formatDate(p.date)} · via ${p.method} · Ref: ${p.ref}</div></div>
      <div style="text-align:right;"><div class="receipt-amount">₦${p.amount.toLocaleString()}</div><div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end;"><button class="btn btn-sm btn-ghost" onclick="showToast('Receipt PDF downloaded','info')">📄 PDF</button><button class="btn btn-sm btn-ghost" onclick="showToast('Receipt emailed to you','info')">📧</button></div></div>
    </div>`).join('');
}

function renderMaintenance() {
  const list = document.getElementById('maintenance-list');
  if (!list) return;
  const requests = MAINTENANCE_REQUESTS.filter(request => request.tenant === DEMO_TENANT_NAME);
  list.innerHTML = requests.map(request => renderMaintenanceCard(request)).join('') || '<p class="maint-desc">No maintenance requests yet.</p>';
}

function renderMaintenanceCard(request, admin = false) {
  const color = request.status === 'pending' ? 'orange' : request.status === 'in-progress' ? 'blue' : 'green';
  return `<article class="maint-item">
    <div class="maint-header">
      <div><span class="badge badge-gray">${escapeHtml(request.id)}</span> <span class="maint-title">${escapeHtml(request.subject)}</span></div>
      <span class="badge badge-${color}">${MAINTENANCE_STATUSES[request.status] || 'Unknown'}</span>
    </div>
    ${admin ? `<div class="maint-desc">${escapeHtml(request.tenant)} · Unit ${escapeHtml(request.unit)}</div>` : ''}
    <div class="maint-desc">${escapeHtml(request.category)} · Priority: ${escapeHtml(request.priority)}</div>
    ${request.description ? `<p class="maint-description">${escapeHtml(request.description)}</p>` : ''}
    ${request.managerNote ? `<p class="maint-description"><strong>Management update:</strong> ${escapeHtml(request.managerNote)}</p>` : ''}
    <div class="maint-meta">Submitted: ${escapeHtml(request.date)}</div>
    ${admin ? `<button class="btn btn-sm btn-ghost" style="margin-top:12px;" onclick="openMaintenanceReview('${request.id}')">Review request</button>` : ''}
  </article>`;
}

function renderAdminMaintenance() {
  const list = document.getElementById('admin-maintenance-list');
  if (!list) return;
  const status = document.getElementById('maintenance-filter')?.value || 'all';
  const requests = MAINTENANCE_REQUESTS.filter(request => status === 'all' || request.status === status || (status === 'resolved' && request.status === 'completed'));
  list.innerHTML = requests.map(request => renderMaintenanceCard(request, true)).join('') || '<p class="maint-desc">No requests match this status.</p>';
  const open = MAINTENANCE_REQUESTS.filter(request => ['pending', 'in-progress'].includes(request.status)).length;
  document.getElementById('maintenance-summary').textContent = `${open} open · ${MAINTENANCE_REQUESTS.length} total requests`;
}

function openMaintenanceReview(id) {
  if (currentRole !== 'admin') return;
  const request = MAINTENANCE_REQUESTS.find(item => item.id === id);
  if (!request) return;
  const status = request.status === 'completed' ? 'resolved' : request.status;
  openModal('Review Maintenance Request', `${renderMaintenanceCard(request)}
    <div class="form-group mb-14"><label class="form-label" for="maintenance-status">Status</label>
      <select class="form-input" id="maintenance-status">${['pending', 'in-progress', 'resolved'].map(value => `<option value="${value}" ${value === status ? 'selected' : ''}>${MAINTENANCE_STATUSES[value]}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label class="form-label" for="maintenance-note">Update for tenant</label><textarea class="form-input" id="maintenance-note" rows="3" maxlength="1000" placeholder="Add a progress update or resolution details">${escapeHtml(request.managerNote)}</textarea></div>`,
    `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="saveMaintenanceReview('${id}')">Save update</button>`);
}

function saveMaintenanceReview(id) {
  if (currentRole !== 'admin') return;
  const request = MAINTENANCE_REQUESTS.find(item => item.id === id);
  const status = document.getElementById('maintenance-status')?.value;
  const note = document.getElementById('maintenance-note')?.value.trim() || '';
  if (!request || !['pending', 'in-progress', 'resolved'].includes(status) || note.length > 1000) {
    showToast('Choose a valid status and keep the update within 1,000 characters.', 'error');
    return;
  }
  if (status === 'resolved' && !note) {
    showToast('Add resolution details before marking the request resolved.', 'error');
    return;
  }
  Object.assign(request, { status, managerNote:note });
  closeModalDirect();
  renderAdminMaintenance();
  renderMaintenance();
  showToast('Maintenance request updated for this demo session.', 'success');
}

function renderTenantNotifs() {
  const list = document.getElementById('tenant-notif-list');
  if (!list) return;
  list.innerHTML = TENANT_NOTIFICATIONS.map(n => `
    <div class="notif-item ${n.unread?'notif-unread':''}">
      <div class="notif-dot" style="background:${n.type==='gold'?'var(--gold)':n.type==='green'?'var(--green)':'var(--accent)'};"></div>
      <div class="notif-body"><div class="notif-text">${n.text}</div><div class="notif-time">${n.time}</div></div>
    </div>`).join('');
}

/* ---- Payment Flow ---- */
function renderPayStep(step) {
  payStep = step;
  // Update step indicator
  [1,2,3].forEach(i => {
    const el = document.getElementById('pstep-'+i);
    if (!el) return;
    el.classList.remove('active','done');
    if (i < step) el.classList.add('done');
    else if (i === step) el.classList.add('active');
  });
  const content = document.getElementById('pay-content');
  if (!content) return;

  if (step === 1) {
    content.innerHTML = `
      <div class="card mb-20">
        <div class="card-header"><div class="card-title">Annual Fee Invoice — 2026</div><span class="badge badge-blue">Renewal Due</span></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Description</th><th>Period</th><th>Amount</th></tr></thead>
            <tbody>
              <tr><td>Annual Rent — Unit D-09</td><td>Jan 2026 – Dec 2026</td><td style="font-weight:700;">₦480,000</td></tr>
              <tr><td>Service Charge</td><td>2026</td><td>₦24,000</td></tr>
              <tr><td>Waste Management Levy</td><td>2026</td><td>₦6,000</td></tr>
              <tr style="border-top:2px solid var(--border);"><td colspan="2" style="font-weight:800;font-size:14px;">Total Due</td><td style="font-weight:800;font-size:18px;color:var(--gold);">₦510,000</td></tr>
            </tbody>
          </table>
        </div>
        <div style="margin-top:14px;padding:12px 14px;background:rgba(59,130,246,0.06);border-radius:8px;font-size:12px;color:var(--text2);">
          📅 <strong>Payment due date:</strong> January 14, 2026 &nbsp;·&nbsp; ⚠️ Late payments attract a 5% monthly penalty
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button class="btn btn-primary btn-lg" onclick="renderPayStep(2)">Proceed to Payment →</button>
      </div>`;
  } else if (step === 2) {
    selectedPaymentMethod = 'provider';
    content.innerHTML = `
      <div class="card mb-20">
        <div class="card-header"><div class="card-title">Select Payment Method</div></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;" id="pay-methods">
          <div class="pay-method-btn" onclick="selectPayMethod(this,'paystack')" style="border:2px solid var(--accent);border-radius:10px;padding:16px;text-align:center;cursor:pointer;background:rgba(59,130,246,0.06);transition:all 0.2s;">
            <div style="font-size:26px;margin-bottom:6px;">💳</div><div style="font-size:13px;font-weight:700;">Paystack</div><div style="font-size:11px;color:var(--text3);">Card / USSD / Bank</div>
          </div>
          <div class="pay-method-btn" onclick="selectPayMethod(this,'transfer')" style="border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:26px;margin-bottom:6px;">🏦</div><div style="font-size:13px;font-weight:700;">Bank Transfer</div><div style="font-size:11px;color:var(--text3);">Direct to account</div>
          </div>
          <div class="pay-method-btn" onclick="selectPayMethod(this,'ussd')" style="border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center;cursor:pointer;transition:all 0.2s;">
            <div style="font-size:26px;margin-bottom:6px;">📱</div><div style="font-size:13px;font-weight:700;">USSD</div><div style="font-size:11px;color:var(--text3);">Dial *822# etc.</div>
          </div>
        </div>
        <div id="pay-method-detail">
          <div style="background:rgba(11,164,219,0.05);border:1px solid rgba(11,164,219,0.2);border-radius:10px;padding:20px;">
            <div class="paystack-logo"><div class="paystack-logo-mark">P</div><div class="paystack-logo-text">Payment-provider demo</div></div>
            <div style="font-size:12px;color:var(--text2);margin-bottom:16px;">Amount to pay: <strong style="color:var(--gold);font-size:16px;">₦510,000</strong></div>
            <input class="paystack-input" placeholder="Enter email address" value="funmi@boutique.ng">
            <input class="paystack-input" placeholder="Do not enter card details">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <input class="paystack-input" placeholder="MM/YY">
              <input class="paystack-input" placeholder="CVV">
            </div>
            <div class="paystack-secure">Demo fields only. Do not enter real payment information.</div>
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <button class="btn btn-ghost btn-lg" onclick="renderPayStep(1)">← Back</button>
        <button class="btn btn-primary btn-lg" onclick="processPayment()">Simulate payment submission →</button>
      </div>`;
  } else if (step === 3) {
    content.innerHTML = `
      <div class="card">
        <div class="success-state">
          <div class="success-icon">✅</div>
          <div class="success-title">Demo Submission Recorded</div>
          <p class="success-sub">This is a simulated submission for <strong style="color:var(--gold);">₦510,000</strong>. No money was collected, no receipt was issued, and no lease was renewed.</p>
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:20px;max-width:360px;margin:0 auto 28px;text-align:left;">
            <div class="lease-row"><div class="lease-key">Reference</div><div class="lease-val" style="font-family:monospace;color:var(--accent2);">TXN-2026-0001</div></div>
            <div class="lease-row"><div class="lease-key">Amount Paid</div><div class="lease-val" style="color:var(--gold);">₦510,000</div></div>
            <div class="lease-row"><div class="lease-key">Lease Renewed Until</div><div class="lease-val">December 31, 2026</div></div>
            <div class="lease-row"><div class="lease-key">Status</div><div class="lease-val"><span class="badge badge-orange">Demo only</span></div></div>
          </div>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-primary btn-lg" onclick="showToast('Receipt downloads need a backend-generated document.','info')">📄 Receipt unavailable in demo</button>
            <button class="btn btn-ghost btn-lg" onclick="navTo('tenant-dashboard')">← Back to Dashboard</button>
          </div>
        </div>
      </div>`;
  }
}

function selectPayMethod(el, method) {
  selectedPaymentMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(b => {
    b.style.border = '1px solid var(--border)';
    b.style.background = 'transparent';
  });
  el.style.border = '2px solid var(--accent)';
  el.style.background = 'rgba(59,130,246,0.06)';
  const detail = document.getElementById('pay-method-detail');
  if (method === 'transfer') {
    detail.innerHTML = `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:20px;">
      <div style="font-size:12px;color:var(--text3);margin-bottom:14px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Bank Transfer Details</div>
      <div class="form-grid-2" style="gap:12px;margin-bottom:12px;">
        <div><div style="font-size:11px;color:var(--text3);">Bank</div><div style="font-weight:700;font-size:15px;">Zenith Bank PLC</div></div>
        <div><div style="font-size:11px;color:var(--text3);">Account Number</div><div style="font-weight:800;font-size:17px;color:var(--accent2);">2103456789</div></div>
        <div><div style="font-size:11px;color:var(--text3);">Account Name</div><div style="font-weight:700;font-size:14px;">Sunshine Business Plaza Ltd</div></div>
        <div><div style="font-size:11px;color:var(--text3);">Reference Code</div><div style="font-weight:800;font-size:17px;color:var(--gold);">D09-2026-FNM</div></div>
      </div>
      <div class="form-group" style="margin-top:16px;"><label class="form-label">Transfer reference</label><input class="form-input" id="transfer-reference" placeholder="e.g. FNB-2026-001"></div>
      <div class="form-group"><label class="form-label">Receipt evidence</label><input class="form-input" id="transfer-evidence" type="file" accept="image/*,.pdf"><p style="font-size:11px;color:var(--text3);margin-top:6px;">Demo only: the filename is kept in browser memory and the file is not uploaded.</p></div>
      <div style="font-size:12px;color:var(--orange);padding:10px;background:rgba(249,115,22,0.08);border-radius:6px;">A manager must verify transfer evidence before a payment is approved.</div>
    </div>`;
  } else if (method === 'ussd') {
    detail.innerHTML = `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:20px;">
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px;font-weight:700;">USSD Codes — Choose your bank:</div>
      <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--card);border-radius:6px;"><span>Zenith Bank</span><span style="font-family:monospace;font-weight:700;color:var(--accent2);">*966*Amount#</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--card);border-radius:6px;"><span>GTBank</span><span style="font-family:monospace;font-weight:700;color:var(--accent2);">*737*Amount#</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--card);border-radius:6px;"><span>Access Bank</span><span style="font-family:monospace;font-weight:700;color:var(--accent2);">*901*Amount#</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--card);border-radius:6px;"><span>First Bank</span><span style="font-family:monospace;font-weight:700;color:var(--accent2);">*894*Amount#</span></div>
      </div>
    </div>`;
  } else {
    detail.innerHTML = `<div style="background:rgba(11,164,219,0.05);border:1px solid rgba(11,164,219,0.2);border-radius:10px;padding:20px;"><div class="paystack-logo"><div class="paystack-logo-mark">P</div><div class="paystack-logo-text">Payment-provider demo</div></div><div style="font-size:12px;color:var(--text2);margin-bottom:16px;">Amount: <strong style="color:var(--gold);font-size:16px;">₦510,000</strong></div><p style="font-size:12px;color:var(--text2);">This option is visual only. It does not send data to a payment provider or collect money.</p></div>`;
  }
}

function processPayment() {
  if (selectedPaymentMethod === 'transfer') {
    submitTransferEvidence();
    return;
  }
  showToast('Simulating a payment submission...','info');
  setTimeout(() => { renderPayStep(3); showToast('Demo submission complete. No payment was processed.','info'); }, 1500);
}

function submitTransferEvidence() {
  const reference = document.getElementById('transfer-reference')?.value.trim();
  const evidence = document.getElementById('transfer-evidence')?.files[0];
  if (!reference || !evidence) {
    showToast('Add both a transfer reference and a receipt file name.','error');
    return;
  }
  const ref = `EVD-2026-${String(PAYMENTS.filter(p => p.ref.startsWith('EVD-2026-')).length + 1).padStart(3, '0')}`;
  const payment = { ref, tenant:DEMO_TENANT_NAME, unit:'D-09', amount:510000, period:'2026', method:'Bank Transfer', date:new Date().toISOString().slice(0,10), status:'pending', transferReference:reference, evidenceFile:evidence.name };
  PAYMENTS.unshift(payment);
  renderEvidenceSubmitted(payment);
  showToast('Evidence submitted for manager review. It is not approved yet.','success');
}

function renderEvidenceSubmitted(payment) {
  renderPayStep(3);
  const content = document.getElementById('pay-content');
  content.innerHTML = `<div class="card"><div class="success-state"><div class="success-icon">⏳</div><div class="success-title">Evidence Submitted for Review</div><p class="success-sub">Your bank-transfer evidence is pending manager verification. It has not been counted as a payment.</p><div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:20px;max-width:420px;margin:0 auto 28px;text-align:left;"><div class="lease-row"><div class="lease-key">Submission reference</div><div class="lease-val" style="font-family:monospace;color:var(--accent2);">${payment.ref}</div></div><div class="lease-row"><div class="lease-key">Bank reference</div><div class="lease-val">${escapeHtml(payment.transferReference)}</div></div><div class="lease-row"><div class="lease-key">Evidence file</div><div class="lease-val">${escapeHtml(payment.evidenceFile)}</div></div><div class="lease-row"><div class="lease-key">Status</div><div class="lease-val">${payStatusBadge('pending')}</div></div></div><button class="btn btn-ghost btn-lg" onclick="navTo('tenant-dashboard')">Back to Dashboard</button></div></div>`;
}

function submitMaintenanceRequest() {
  if (currentRole !== 'tenant') return;
  const category = document.getElementById('maintenance-category').value;
  const priority = document.getElementById('maintenance-priority').value;
  const subject = document.getElementById('maintenance-subject').value.trim();
  const description = document.getElementById('maintenance-description').value.trim();
  if (!MAINTENANCE_CATEGORIES.includes(category) || !MAINTENANCE_PRIORITIES.includes(priority) || !subject || !description || subject.length > 120 || description.length > 2000) {
    showToast('Choose a category and priority, and enter a subject (up to 120 characters) and description (up to 2,000).', 'error');
    return;
  }
  const tenant = TENANTS.find(item => item.name === DEMO_TENANT_NAME);
  if (!tenant) {
    showToast('This demo tenant no longer has a tenancy. Restore the sample data by refreshing.', 'error');
    return;
  }
  const nextId = Math.max(0, ...MAINTENANCE_REQUESTS.map(request => Number(request.id.replace('MR-', '')))) + 1;
  const id = `MR-${String(nextId).padStart(3, '0')}`;
  MAINTENANCE_REQUESTS.unshift({ id, tenant:DEMO_TENANT_NAME, unit:tenant.shop, category, priority, subject, description, date:formatDate(new Date()), status:'pending', managerNote:'' });
  document.getElementById('maintenance-form').reset();
  renderMaintenance();
  showToast(`Request ${id} submitted for this demo session.`, 'success');
}

/* ============================================================
   CHART BUILDER
   ============================================================ */
function buildBarChart(containerId, values, labels, colors, height) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const max = Math.max(...values, 1);
  const isSingleColor = typeof colors === 'string';
  container.innerHTML = values.map((v, i) => {
    const pct = Math.round((v / max) * 100);
    const color = isSingleColor ? colors : (colors[i] || colors[0]);
    return `<div class="bar-col">
      <div class="bar-fill" style="height:${pct}%;background:${color};min-height:4px;" title="${labels[i]}: ${typeof v==='number'&&v>1000?'₦'+(v/1000)+'K':v}"></div>
      <div class="bar-lbl" style="position:relative;bottom:auto;">${labels[i]}</div>
    </div>`;
  }).join('');
}

/* ============================================================
   MODALS
   ============================================================ */
function openModal(title, body, footer) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-footer').innerHTML = footer || `<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button>`;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(e) { if (e.target === document.getElementById('modal-overlay')) closeModalDirect(); }
function closeModalDirect() { document.getElementById('modal-overlay').classList.remove('open'); }

/* TENANT MODALS */
function openAddTenant() {
  const availableUnits = getAvailableUnits();
  if (!availableUnits.length) {
    showToast('There are no vacant units available for a new tenant.','error');
    return;
  }
  openModal('Add New Tenant', `
    <div class="form-section-title">Tenant Information</div>
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Full Name / Business Name</label><input class="form-input" placeholder="e.g. Adaeze Boutique" id="nt-name"></div>
      <div class="form-group"><label class="form-label">Phone Number</label><input class="form-input" placeholder="0801 234 5678" id="nt-phone"></div>
    </div>
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Email Address</label><input class="form-input" type="email" placeholder="tenant@email.com" id="nt-email"></div>
      <div class="form-group"><label class="form-label">Business Type</label>
        <select class="form-input" id="nt-biz"><option>Fashion & Retail</option><option>Food & Catering</option><option>Electronics</option><option>Pharmacy & Health</option><option>Financial Services</option><option>Professional Services</option><option>Provisions / FMCG</option><option>Other</option></select>
      </div>
    </div>
    <div class="form-section-title">Shop & Lease</div>
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Shop / Unit Number</label>
        <select class="form-input" id="nt-unit">${availableUnits.map(unit => `<option>${unit}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Annual Rent (₦)</label><input class="form-input" type="number" placeholder="300000" id="nt-rent"></div>
    </div>
    <div class="form-grid-2 mb-4">
      <div class="form-group"><label class="form-label">Lease Start Date</label><input class="form-input" type="date" id="nt-start"></div>
      <div class="form-group"><label class="form-label">Lease End Date</label><input class="form-input" type="date" id="nt-end"></div>
    </div>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="saveTenant()">Add Tenant</button>`);
}

function saveTenant() {
  const details = readTenantForm('nt');
  if (!details) return;
  if (TENANTS.some(tenant => tenant.shop === details.shop)) {
    showToast('That unit is already occupied. Choose a vacant unit.','error');
    return;
  }
  TENANTS.push({ id:Math.max(...TENANTS.map(tenant => tenant.id)) + 1, ...details });
  closeModalDirect();
  renderTenants(TENANTS);
  renderUnits();
  showToast(`Tenant "${details.name}" added for this demo session.`,'success');
}

function openEditTenant(id) {
  const t = TENANTS.find(x => x.id === id);
  if (!t) return;
  openModal(`Edit Tenant — ${t.name}`, `
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Business Name</label><input class="form-input" id="et-name" value="${escapeHtml(t.name)}"></div>
      <div class="form-group"><label class="form-label">Business Type</label><input class="form-input" id="et-biz" value="${escapeHtml(t.business)}"></div>
    </div>
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Unit</label><input class="form-input" id="et-unit" value="${t.shop}" disabled></div>
      <div class="form-group"><label class="form-label">Annual Rent (₦)</label><input class="form-input" id="et-rent" type="number" value="${t.rent}"></div>
    </div>
    <div class="form-grid-2 mb-4">
      <div class="form-group"><label class="form-label">Lease Start</label><input class="form-input" id="et-start" type="date" value="${t.start}"></div>
      <div class="form-group"><label class="form-label">Lease End</label><input class="form-input" id="et-end" type="date" value="${t.expires}"></div>
    </div>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="saveTenantChanges(${t.id})">Save Changes</button>`);
}

function deleteTenant(id) {
  const t = TENANTS.find(x => x.id === id);
  openModal('Confirm Delete', `<p style="font-size:14px;line-height:1.7;">Are you sure you want to remove <strong>${t?.name}</strong> from the system? This action cannot be undone.</p>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-red" onclick="removeTenant(${id})">Delete Tenant</button>`);
}

function saveTenantChanges(id) {
  const tenant = TENANTS.find(item => item.id === id);
  const details = readTenantForm('et');
  if (!tenant || !details) return;
  Object.assign(tenant, details);
  closeModalDirect();
  renderTenants(TENANTS);
  renderUnits();
  showToast(`Tenant "${details.name}" updated for this demo session.`,'success');
}

function removeTenant(id) {
  const index = TENANTS.findIndex(tenant => tenant.id === id);
  if (index < 0) return;
  const [removed] = TENANTS.splice(index, 1);
  closeModalDirect();
  renderTenants(TENANTS);
  renderUnits();
  showToast(`Tenant "${removed.name}" removed. This change resets on refresh.`,'info');
}

function getAvailableUnits() {
  return UNITS.filter(unit => !TENANTS.some(tenant => tenant.shop === unit.number)).map(unit => unit.number);
}

function readTenantForm(prefix) {
  const name = document.getElementById(`${prefix}-name`)?.value.trim();
  const business = document.getElementById(`${prefix}-biz`)?.value.trim();
  const shop = document.getElementById(`${prefix}-unit`)?.value;
  const rent = Number(document.getElementById(`${prefix}-rent`)?.value);
  const start = document.getElementById(`${prefix}-start`)?.value;
  const expires = document.getElementById(`${prefix}-end`)?.value;
  if (!name || !business || !shop || !start || !expires || !Number.isFinite(rent) || rent <= 0) {
    showToast('Enter a name, business type, unit, positive rent, and both lease dates.','error');
    return null;
  }
  if (/[<>]/.test(name) || /[<>]/.test(business)) {
    showToast('Names and business types cannot contain angle brackets.','error');
    return null;
  }
  if (new Date(expires) <= new Date(start)) {
    showToast('The lease end date must be after the start date.','error');
    return null;
  }
  const days = daysUntil(expires);
  return { name, shop, block:shop[0], business, rent, start, expires, paid:false, status:days < 0 ? 'overdue' : days <= 60 ? 'expiring' : 'active' };
}

function openAddUnit() {
  openModal('Add New Unit', `
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Unit Number</label><input class="form-input" id="unit-number" placeholder="e.g. C-01"></div>
      <div class="form-group"><label class="form-label">Block</label><input class="form-input" id="unit-block" placeholder="e.g. C" maxlength="1"></div>
    </div>
    <div class="form-grid-2 mb-4">
      <div class="form-group"><label class="form-label">Size (sqm)</label><input class="form-input" id="unit-size" type="number" min="1" placeholder="45"></div>
      <div class="form-group"><label class="form-label">Suggested Annual Rent (₦)</label><input class="form-input" id="unit-rent" type="number" min="1" placeholder="300000"></div>
    </div>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="saveUnit()">Add Unit</button>`);
}

function saveUnit() {
  const number = document.getElementById('unit-number')?.value.trim().toUpperCase();
  const block = document.getElementById('unit-block')?.value.trim().toUpperCase();
  const size = Number(document.getElementById('unit-size')?.value);
  const suggestedRent = Number(document.getElementById('unit-rent')?.value);
  if (!/^[A-Z]-\d{2}$/.test(number) || !/^[A-Z]$/.test(block) || number[0] !== block || !Number.isFinite(size) || size <= 0 || !Number.isFinite(suggestedRent) || suggestedRent <= 0) {
    showToast('Use a unit number like C-01, matching one-letter block, positive size, and positive rent.','error');
    return;
  }
  if (UNITS.some(unit => unit.number === number)) {
    showToast('That unit number already exists.','error');
    return;
  }
  UNITS.push({ number, block, size, suggestedRent });
  closeModalDirect();
  renderUnits();
  showToast(`Unit ${number} added for this demo session.`,'success');
}

function openRecordPayment() {
  openModal('Record Manual Payment', `
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Tenant</label>
        <select class="form-input" id="manual-payment-tenant">${TENANTS.map(t=>`<option value="${t.id}">${escapeHtml(t.name)} (${t.shop})</option>`).join('')}</select>
      </div>
      <div class="form-group"><label class="form-label">Amount (₦)</label><input class="form-input" id="manual-payment-amount" type="number" min="1" placeholder="480000"></div>
    </div>
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Payment Method</label>
        <select class="form-input" id="manual-payment-method"><option>Bank Transfer</option><option>Cash</option><option>Paystack</option><option>Cheque</option></select>
      </div>
      <div class="form-group"><label class="form-label">Payment Date</label><input class="form-input" id="manual-payment-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    </div>
    <div class="form-group mb-4"><label class="form-label">Period</label>
      <select class="form-input" id="manual-payment-period"><option>2026</option><option>2025</option><option>2024</option></select>
    </div>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="saveManualPayment()">Record Payment</button>`);
}

function saveManualPayment() {
  const tenantId = Number(document.getElementById('manual-payment-tenant')?.value);
  const amount = Number(document.getElementById('manual-payment-amount')?.value);
  const method = document.getElementById('manual-payment-method')?.value;
  const date = document.getElementById('manual-payment-date')?.value;
  const period = document.getElementById('manual-payment-period')?.value;
  const tenant = TENANTS.find(item => item.id === tenantId);
  if (!tenant || !method || !period || !date || !Number.isFinite(amount) || amount <= 0) {
    showToast('Select a tenant and enter a positive amount, method, date, and period.','error');
    return;
  }
  if (Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
    showToast('Enter a valid payment date.','error');
    return;
  }
  const year = date.slice(0, 4);
  const ref = `MAN-${year}-${String(PAYMENTS.filter(payment => payment.ref.startsWith(`MAN-${year}-`)).length + 1).padStart(3, '0')}`;
  PAYMENTS.unshift({ ref, tenant:tenant.name, unit:tenant.shop, amount, period, method, date, status:'paid', source:'manual' });
  closeModalDirect();
  renderPayments();
  renderAdminDashboard();
  renderTenantDashboard();
  renderReceipts();
  showToast(`Manual payment ${ref} recorded as paid for this demo session.`,'success');
}

function openPaymentReview(ref) {
  const payment = PAYMENTS.find(p => p.ref === ref);
  if (!payment || payment.status !== 'pending') return;
  openModal('Review Transfer Evidence', `
    <div class="lease-card">
      <div class="lease-row"><div class="lease-key">Tenant</div><div class="lease-val">${escapeHtml(payment.tenant)}</div></div>
      <div class="lease-row"><div class="lease-key">Amount submitted</div><div class="lease-val" style="color:var(--gold);">₦${payment.amount.toLocaleString()}</div></div>
      <div class="lease-row"><div class="lease-key">Bank reference</div><div class="lease-val">${escapeHtml(payment.transferReference || 'Not recorded')}</div></div>
      <div class="lease-row"><div class="lease-key">Evidence file</div><div class="lease-val">${escapeHtml(payment.evidenceFile || 'No file name recorded')}</div></div>
    </div>
    <div class="form-group" style="margin-top:16px;"><label class="form-label">Review note</label><textarea class="form-input" id="payment-review-reason" rows="3" placeholder="Required if rejecting; optional when approving."></textarea></div>
    <p style="font-size:12px;color:var(--text3);margin-top:10px;">Demo only: review decisions reset on refresh and do not verify a real bank transfer.</p>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-red" onclick="rejectPaymentEvidence('${payment.ref}')">Reject</button><button class="btn btn-primary" onclick="approvePaymentEvidence('${payment.ref}')">Approve</button>`);
}

function approvePaymentEvidence(ref) {
  const payment = PAYMENTS.find(p => p.ref === ref);
  if (!payment || payment.status !== 'pending') return;
  payment.status = 'paid';
  payment.reviewReason = document.getElementById('payment-review-reason')?.value.trim() || 'Approved in demo';
  closeModalDirect();
  renderPayments();
  showToast('Evidence approved in this demo. No bank verification occurred.','success');
}

function rejectPaymentEvidence(ref) {
  const reason = document.getElementById('payment-review-reason')?.value.trim();
  if (!reason) {
    showToast('Enter a reason before rejecting payment evidence.','error');
    return;
  }
  const payment = PAYMENTS.find(p => p.ref === ref);
  if (!payment || payment.status !== 'pending') return;
  payment.status = 'rejected';
  payment.reviewReason = reason;
  closeModalDirect();
  renderPayments();
  showToast('Evidence rejected and the reason was recorded for this demo session.','info');
}

function openAddPlaza() {
  if (currentRole !== 'super') return;
  openModal('Onboard New Plaza Manually', `
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label" for="plaza-name">Plaza Name</label><input class="form-input" id="plaza-name" maxlength="120" placeholder="e.g. Emeka Business Plaza"></div>
      <div class="form-group"><label class="form-label" for="plaza-owner">Owner Name</label><input class="form-input" id="plaza-owner" maxlength="120" placeholder="Chief Emeka Obi"></div>
    </div>
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label" for="plaza-email">Owner Email</label><input class="form-input" id="plaza-email" type="email" maxlength="254" placeholder="owner@plaza.com"></div>
      <div class="form-group"><label class="form-label" for="plaza-city">City</label><input class="form-input" id="plaza-city" maxlength="100" placeholder="Lagos"></div>
    </div>
    <div class="form-grid-2 mb-4">
      <div class="form-group"><label class="form-label" for="plaza-units">Total Units</label><input class="form-input" id="plaza-units" type="number" min="1" step="1" placeholder="48"></div>
      <div class="form-group"><label class="form-label" for="plaza-plan">Subscription Plan</label>
        <select class="form-input" id="plaza-plan"><option>Basic</option><option>Standard</option><option>Premium</option><option value="trial">Standard trial</option></select>
      </div>
    </div><p class="maint-meta">Adds a sample plaza until refresh. No login credentials or email will be sent.</p>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="savePlaza()">Add Demo Plaza</button>`);
}

function savePlaza() {
  if (currentRole !== 'super') return;
  const name = document.getElementById('plaza-name')?.value.trim() || '';
  const owner = document.getElementById('plaza-owner')?.value.trim() || '';
  const email = document.getElementById('plaza-email')?.value.trim() || '';
  const city = document.getElementById('plaza-city')?.value.trim() || '';
  const units = Number(document.getElementById('plaza-units')?.value);
  const plan = document.getElementById('plaza-plan')?.value;
  if (!name || name.length > 120 || !owner || owner.length > 120 || !city || city.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isSafeInteger(units) || units < 1 || !['Basic', 'Standard', 'Premium', 'trial'].includes(plan)) {
    showToast('Enter a plaza name, owner, valid email, city, positive whole unit count, and plan.', 'error');
    return;
  }
  const normalize = value => value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (PLAZAS.some(plaza => normalize(plaza.name) === normalize(name) && normalize(plaza.city) === normalize(city))) {
    showToast('A plaza with that name already exists in this city.', 'error');
    return;
  }
  PLAZAS.unshift({ id:Math.max(0, ...PLAZAS.map(plaza => plaza.id)) + 1, name, owner, email, city, units, tenants:0, plan:plan === 'trial' ? 'Standard' : plan, status:plan === 'trial' ? 'trial' : 'active', joined:new Date().toISOString().slice(0, 10) });
  // Reveal the new record even when the previous list was filtered.
  document.getElementById('plaza-search').value = '';
  document.getElementById('plaza-status-filter').value = 'all';
  document.getElementById('plaza-plan-filter').value = 'all';
  closeModalDirect();
  navTo('super-plazas');
  renderSuperDashboard();
  showToast('Demo plaza added. No account or email was created.', 'success');
}

function openEditPlan(plan) {
  if (currentRole !== 'super' || !Object.hasOwn(PLANS, plan)) return;
  const details = PLANS[plan];
  openModal(`Edit ${details.name} Plan`, `
    <div class="form-group mb-14"><label class="form-label" for="plan-price">Monthly Price (₦)</label><input class="form-input" id="plan-price" type="number" min="1" step="1" value="${details.price}"></div>
    <div class="form-group mb-14"><label class="form-label" for="plan-units">Max Units (leave blank for unlimited)</label><input class="form-input" id="plan-units" type="number" min="1" step="1" value="${details.maxUnits ?? ''}"></div>
    <div class="form-group mb-4"><label class="form-label" for="plan-features">Features (one per line, up to 20)</label><textarea class="form-input" id="plan-features" rows="6" maxlength="4000">${escapeHtml(details.features.join('\n'))}</textarea></div>
    <p class="maint-meta">Changes update the demo catalog until refresh. Existing plazas and recorded payments stay as they are.</p>`,
    `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="savePlan('${plan}')">Save Plan</button>`);
}

function savePlan(plan) {
  if (currentRole !== 'super' || !Object.hasOwn(PLANS, plan)) return;
  const price = Number(document.getElementById('plan-price').value);
  const unitValue = document.getElementById('plan-units').value.trim();
  const maxUnits = unitValue === '' ? null : Number(unitValue);
  const features = document.getElementById('plan-features').value.split('\n').map(value => value.trim()).filter(Boolean);
  if (!Number.isSafeInteger(price) || price < 1 || (maxUnits !== null && (!Number.isSafeInteger(maxUnits) || maxUnits < 1)) || features.length < 1 || features.length > 20 || features.some(value => value.length > 200)) {
    showToast('Use a positive whole price, a positive whole unit limit or blank for unlimited, and 1–20 features of up to 200 characters each.', 'error');
    return;
  }
  Object.assign(PLANS[plan], { price, maxUnits, features });
  closeModalDirect();
  renderPlanCards();
  showToast('Plan updated for this demo session.', 'success');
}

function renderPlanCards() {
  const container = document.getElementById('subscription-plan-cards');
  if (!container) return;
  container.innerHTML = Object.entries(PLANS).map(([key, plan]) => {
    const active = PLAZAS.filter(plaza => plaza.plan === plan.name && plaza.status === 'active').length;
    return `<article class="plan-card ${key === 'standard' ? 'active-plan' : ''}">
      <div class="flex items-center justify-between mb-16"><div><div class="font-bold">${plan.name}</div><div style="font-size:28px;font-weight:800;margin-top:4px;">${formatNaira(plan.price)}</div><div class="text-sm text-muted">per month</div></div><span class="badge badge-blue">${active} active</span></div>
      <div class="flex items-center justify-between text-sm mb-16"><span class="text-muted">Max Units</span><span>${plan.maxUnits ?? 'Unlimited'}</span></div>
      <ul class="plan-features">${plan.features.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
      <button class="btn btn-ghost w-full" onclick="openEditPlan('${key}')">Edit Plan</button>
    </article>`;
  }).join('');
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateY(10px)'; toast.style.transition='all 0.3s'; setTimeout(()=>toast.remove(),300); }, 3000);
}

/* ============================================================
   TOGGLE SWITCHES
   ============================================================ */
function toggleThis(el) { el.classList.toggle('on'); }

/* ============================================================
   MOBILE SIDEBAR
   ============================================================ */
function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
}

/* ============================================================
   HELPER FUNCTIONS
   ============================================================ */
function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' });
}

function formatNaira(amount) {
  return `₦${Number(amount).toLocaleString('en-NG')}`;
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr);
  return Math.ceil((target - today) / (1000*60*60*24));
}

function expiryBadge(days) {
  if (days < 0)  return `<span class="badge badge-red">🔴 Overdue</span>`;
  if (days <= 30) return `<span class="badge badge-red">🔴 ${days}d left</span>`;
  if (days <= 60) return `<span class="badge badge-orange">🟠 ${days}d left</span>`;
  return `<span class="badge badge-green">🟢 Active</span>`;
}

function payStatusBadge(s) {
  if (s==='rejected') return '<span class="badge badge-red">Rejected</span>';
  if (s==='paid')    return '<span class="badge badge-green">✓ Paid</span>';
  if (s==='pending') return '<span class="badge badge-orange">⏳ Pending</span>';
  if (s==='overdue') return '<span class="badge badge-red">✗ Overdue</span>';
  return '<span class="badge badge-gray">—</span>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
}

function statusBadge(s) {
  const map = { active:'<span class="badge badge-green">Active</span>', trial:'<span class="badge badge-blue">Trial</span>', suspended:'<span class="badge badge-red">Suspended</span>', expired:'<span class="badge badge-gray">Expired</span>' };
  return map[s] || '<span class="badge badge-gray">—</span>';
}

const AVATAR_COLORS = [
  'rgba(59,130,246,0.2);color:var(--accent2)',
  'rgba(16,185,129,0.2);color:var(--green)',
  'rgba(245,158,11,0.2);color:var(--gold)',
  'rgba(239,68,68,0.2);color:var(--red)',
  'rgba(139,92,246,0.2);color:var(--purple)',
  'rgba(249,115,22,0.2);color:var(--orange)',
];
function avatarStyle(name) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return `background:${AVATAR_COLORS[idx]};`;
}

/* ============================================================
   RESPONSIVE: show mobile menu btn
   ============================================================ */
function checkMobile() {
  const mBtn = document.getElementById('mobile-menu-btn');
  if (mBtn) mBtn.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
}
window.addEventListener('resize', checkMobile);
checkMobile();

/* ============================================================
   SCROLL TO FEATURES (landing)
   ============================================================ */
function scrollToFeatures() {
  document.getElementById('features')?.scrollIntoView({ behavior:'smooth' });
}

/* ============================================================
   INIT
   ============================================================ */
showLanding();
