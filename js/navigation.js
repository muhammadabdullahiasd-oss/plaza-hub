import { DEMO_TENANT_ID } from './data/demo-data.js';

// Presentation state only; these values do not authenticate a visitor.
export const session = { role:'super', page:'', loginRole:'super' };

export function createNavigation({ repository, renderPage, ui }) {
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
        { icon:'📁', text:'Documents', page:'admin-documents' },
      ]},
      { label:'Analytics', items:[
        { icon:'📈', text:'Reports',             page:'admin-reports' },
        { icon:'🔔', text:'Notifications',       page:'admin-notifications' },
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
        { icon:'📁', text:'My Documents',        page:'tenant-documents' },
        { icon:'🔔', text:'Notifications',       page:'tenant-notifications' },
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
    session.loginRole = role;
    ['super','admin','tenant'].forEach(r => {
      document.getElementById('ltab-'+r).classList.toggle('active', r===role);
    });
    const labels = { super:'Sign In as Super Admin', admin:'Sign In as Plaza Admin', tenant:'Sign In as Tenant' };
    document.getElementById('login-submit-btn').textContent = labels[role];
  }

  function doLogin() {
    switchRole(session.loginRole);
    hideAll();
    document.getElementById('app-shell').style.display = 'block';
    ui.showToast('Demo dashboard opened. No authentication was performed.', 'info');
  }

  function doRegister() {
    ui.showToast('Opening the admin demo. No account was created.', 'info');
    setTimeout(() => { switchRole('admin'); hideAll(); document.getElementById('app-shell').style.display = 'block'; }, 1500);
  }

  function switchRole(role) {
    session.role = role;
    // Role switcher buttons
    ['super','admin','tenant'].forEach(r => {
      document.getElementById('rbtn-'+r)?.classList.toggle('active', r===role);
    });
    // Sidebar user info
    const demoTenant = repository.listTenants().find(tenant => tenant.id === DEMO_TENANT_ID);
    const u = role === 'tenant' && demoTenant ? { ...ROLE_USER.tenant, name:demoTenant.name, initial:demoTenant.name[0] } : ROLE_USER[role];
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
      page = session.role === 'tenant' ? 'tenant-notifications' : session.role === 'admin' ? 'admin-notifications' : 'super-settings';
    }
    if (page === 'settings') {
      page = session.role === 'tenant' ? 'tenant-lease' : session.role === 'admin' ? 'admin-settings' : 'super-settings';
    }
    session.page = page;
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
      'admin-documents':'Documents',
      'tenant-dashboard':'My Dashboard', 'tenant-pay':'Pay Fees',
      'tenant-receipts':'My Receipts', 'tenant-maintenance':'Maintenance Requests',
      'tenant-lease':'My Lease', 'tenant-notifications':'Notifications',
      'tenant-documents':'My Documents',
    };
    document.getElementById('topbar-title').textContent = titles[page] || 'PlazaHub';
    // Render dynamic content
    renderPage(page);
  }

  return { showLanding, showLogin, showRegister, hideAll, switchLoginTab, doLogin, doRegister, switchRole, buildSidebar, navTo };
}
