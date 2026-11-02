import { DEMO_TENANT_ID, DEMO_PLAZA_ID, MAINTENANCE_STATUSES, MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES } from './data/demo-data.js';
import { repository } from './data/repository.js';
import { session, createNavigation } from './navigation.js';
import { getMonthlyCollections, getQuarterlyCollections, buildCsv, isValidDateOnly, formatDate, formatNaira, daysUntil, expiryBadge, payStatusBadge, escapeHtml, statusBadge, avatarStyle } from './utils.js';
import { ui } from './ui.js';
import { createTenancyActions } from './features/tenancies.js';

let payStep = 1;
let selectedPaymentMethod = 'provider';
let selectedTenancyId = 6;
const { showLanding, showLogin, showRegister, hideAll, switchLoginTab, doLogin, doRegister, switchRole, buildSidebar, navTo } = createNavigation({ repository, ui, renderPage:page => renderPage(page) });
const { openManageTenancies, openAssignTenancy, saveAssignment, openEditTenancy, saveTenancyTerms, openEndTenancy, endTenancy } = createTenancyActions({ repository, ui, getRole:() => session.role, refresh:() => refreshTenantViews() });

function refreshTenantViews() {
  filterTenants(document.getElementById('tenant-search')?.value || '');
  renderUnits();
  renderOperationalSummaries();
  renderTenantIdentity();
}

// Wrappers preserve existing callers while shared UI lives in its own module.
function showToast(...args) { return ui.showToast(...args); }
function openModal(...args) { return ui.openModal(...args); }
function closeModal(...args) { return ui.closeModal(...args); }
function closeModalDirect(...args) { return ui.closeModalDirect(...args); }

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
    case 'admin-tenants':      renderTenants(repository.listTenants()); break;
    case 'admin-units':        renderUnits(); break;
    case 'admin-payments':     renderPayments(); break;
    case 'admin-reports':      renderReports(); break;
    case 'admin-notifications':renderAdminNotifs(); break;
    case 'admin-maintenance':  renderAdminMaintenance(); break;
    case 'tenant-dashboard':   renderTenantDashboard(); break;
    case 'tenant-lease':       renderTenantIdentity(); break;
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
  tbody.innerHTML = [...repository.listPlazas()].sort((a, b) => b.joined.localeCompare(a.joined) || b.id - a.id).slice(0,5).map(p => `
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
  const filtered = repository.listPlazas().filter(p => [p.name, p.owner, p.city].some(value => value.toLowerCase().includes(query)) && (status === 'all' || p.status === status) && (plan === 'all' || p.plan === plan));
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
    'super-plaza-count':repository.listPlazas().length,
    'super-tenant-count':repository.listPlazas().reduce((sum, plaza) => sum + plaza.tenants, 0),
    'plaza-summary':`${repository.listPlazas().length} plazas · ${repository.listPlazas().filter(p => p.status === 'active').length} active · ${repository.listPlazas().filter(p => p.status === 'trial').length} trial · ${repository.listPlazas().filter(p => p.status === 'suspended').length} suspended`,
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  const distribution = document.getElementById('super-plan-distribution');
  if (distribution) {
    const active = repository.listPlazas().filter(plaza => plaza.status === 'active');
    distribution.innerHTML = ['Basic', 'Standard', 'Premium'].map(plan => {
      const count = active.filter(plaza => plaza.plan === plan).length;
      const percent = active.length ? Math.round(count / active.length * 100) : 0;
      return `<div><div class="flex items-center justify-between mb-8"><span class="text-sm">${plan} (${count} plazas)</span><span class="text-sm font-bold">${percent}%</span></div><div class="progress"><div class="progress-fill" style="width:${percent}%;background:var(--accent);"></div></div></div>`;
    }).join('') + `<p class="maint-meta">${repository.listPlazas().filter(p => p.status === 'trial').length} trial · ${repository.listPlazas().filter(p => p.status === 'suspended').length} suspended · ${repository.listPlazas().filter(p => p.status === 'expired').length} expired</p>`;
  }
}

function openPlazaDetail(id) {
  if (session.role !== 'super') return;
  const plaza = repository.listPlazas().find(item => item.id === id);
  if (!plaza) return;
  const rows = { Plaza:plaza.name, Owner:plaza.owner, Email:plaza.email || 'Not recorded in sample data', City:plaza.city, Units:plaza.units, Tenants:plaza.tenants, Plan:plaza.plan, Joined:formatDate(plaza.joined) };
  openModal('Plaza Details', `<div class="lease-card">${Object.entries(rows).map(([label, value]) => `<div class="lease-row"><div class="lease-key">${label}</div><div class="lease-val">${escapeHtml(value)}</div></div>`).join('')}<div class="lease-row"><div class="lease-key">Status</div><div class="lease-val">${statusBadge(plaza.status)}</div></div></div>`,
    `<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button><button class="btn btn-primary" onclick="confirmPlazaStatusChange(${id})">${plaza.status === 'suspended' ? 'Restore plaza' : 'Suspend plaza'}</button>`);
}

function confirmPlazaStatusChange(id) {
  if (session.role !== 'super') return;
  const plaza = repository.listPlazas().find(item => item.id === id);
  if (!plaza) return;
  const suspend = plaza.status !== 'suspended';
  openModal(suspend ? 'Suspend Plaza' : 'Restore Plaza', `<p>${suspend ? 'Suspend' : 'Restore'} <strong>${escapeHtml(plaza.name)}</strong> for this demo session?</p><p class="maint-meta">This updates the sample account status. It does not change access to a live account.</p>`,
    `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn ${suspend ? 'btn-red' : 'btn-primary'}" onclick="savePlazaStatus(${id}, ${suspend})">${suspend ? 'Suspend' : 'Restore'}</button>`);
}

function savePlazaStatus(id, suspend) {
  if (session.role !== 'super' || typeof suspend !== 'boolean') return;
  const plaza = repository.listPlazas().find(item => item.id === id);
  if (!plaza || suspend === (plaza.status === 'suspended')) return;
  repository.setPlazaSuspended(id, suspend);
  closeModalDirect();
  renderPlazasList();
  renderSuperDashboard();
  showToast('Plaza status updated for this demo session.', 'success');
}

function renderSubPayments() {
  const tbody = document.getElementById('sub-payments-body');
  if (!tbody) return;
  tbody.innerHTML = repository.listSubscriptionPayments().map(s => `
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
  buildBarChart('super-monthly-chart', getMonthlyCollections(repository.listSubscriptionPayments()), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], 'var(--purple)', 200);
}

function getTenantApprovedAmount(tenantId) {
  return repository.getTenantApprovedAmount(tenantId);
}

function calculateOperationalSummary() {
  const tenantMap = Object.fromEntries(repository.listOccupancies().map(tenant => [tenant.shop, tenant]));
  const occupied = repository.listUnits().filter(unit => tenantMap[unit.number]).length;
  const expiring = repository.listOccupancies().filter(tenant => {
    const days = daysUntil(tenant.expires);
    return days >= 0 && days <= 30;
  }).length;
  const overdue = repository.listOccupancies().filter(tenant => daysUntil(tenant.expires) < 0).length;
  const approvedPayments = repository.listPayments().filter(payment => payment.status === 'paid');
  const pendingPayments = repository.listPayments().filter(payment => payment.status === 'pending');
  const collected = approvedPayments.reduce((total, payment) => total + payment.amount, 0);
  const pending = pendingPayments.reduce((total, payment) => total + payment.amount, 0);
  const outstanding = repository.listOccupancies().filter(tenant => !tenant.paid).reduce((total, tenant) => total + tenant.rent, 0);
  const collectionRate = collected + outstanding > 0 ? Math.round(collected / (collected + outstanding) * 100) : 0;
  return { occupied, vacant:Math.max(repository.listUnits().length - occupied, 0), expiring, overdue, collected, pending, outstanding, collectionRate, approvedCount:approvedPayments.length, pendingCount:pendingPayments.length };
}

function renderOperationalSummaries() {
  const summary = calculateOperationalSummary();
  const values = {
    'admin-unit-count':repository.listUnits().length,
    'admin-tenant-count':new Set(repository.listActiveTenancies().map(tenancy => tenancy.tenantId)).size,
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
    'payments-overdue-count': `${summary.overdue} expired assignments`,
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  const occupiedPercent = repository.listUnits().length ? Math.round(summary.occupied / repository.listUnits().length * 100) : 0;
  const approvedIds = new Set(repository.listPayments().filter(payment => payment.status === 'paid').map(payment => payment.tenantId));
  const approvedTenants = repository.listTenants().filter(tenant => approvedIds.has(tenant.id)).length;
  const assignmentCount = repository.listActiveTenancies().length;
  const overduePercent = assignmentCount ? Math.round(summary.overdue / assignmentCount * 100) : 0;
  const reportStats = {
    'report-occupied-stat': `${summary.occupied}/${repository.listUnits().length} — ${occupiedPercent}%`,
    'report-collected-stat': `${approvedTenants}/${repository.listTenants().length} tenants — ${summary.collectionRate}%`,
    'report-overdue-stat': `${summary.overdue}/${assignmentCount} assignments — ${overduePercent}%`,
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
    const expiring = repository.listOccupancies().filter(t => daysUntil(t.expires) >= 0 && daysUntil(t.expires) <= 90);
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
    payTbody.innerHTML = repository.listPayments().slice(0,5).map(p => `
      <tr>
        <td><div class="cell-user"><div class="avatar" style="${avatarStyle(p.tenant)}">${p.tenant[0]}</div><span>${p.tenant}</span></div></td>
        <td>${p.unit}</td>
        <td style="font-weight:700;">₦${p.amount.toLocaleString()}</td>
        <td><span class="badge badge-gray">${p.method}</span></td>
        <td>${formatDate(p.date)}</td>
        <td>${payStatusBadge(p.status)}</td>
      </tr>`).join('');
  }
  buildBarChart('admin-revenue-chart', getMonthlyCollections(repository.listPayments()), ['J','F','M','A','M','J','J','A','S','O','N','D'], 'var(--accent)');
}

function renderTenants(list) {
  const tbody = document.getElementById('tenants-tbody');
  if (!tbody) return;
  tbody.innerHTML = list.map(t => {
    const assignments = repository.listOccupancies().filter(row => row.tenantId === t.id);
    const totalRent = assignments.reduce((total, row) => total + row.rent, 0);
    const starts = assignments.map(row => row.start).sort();
    const ends = assignments.map(row => row.expires).sort();
    return `<tr>
      <td><div class="cell-user"><div class="avatar" style="${avatarStyle(t.name)}">${escapeHtml(t.name[0])}</div><div><div class="cell-name">${escapeHtml(t.name)}</div><div class="cell-sub">${[t.email, t.phone].filter(Boolean).map(escapeHtml).join(' · ')}</div></div></div></td>
      <td>${assignments.map(row => `<span class="badge badge-gray">${escapeHtml(row.shop)}</span>`).join(' ') || '—'}</td>
      <td>${escapeHtml(t.business)}</td>
      <td style="font-weight:700;">${formatNaira(totalRent)}</td>
      <td>${formatDate(starts[0])}</td>
      <td>${formatDate(ends[0])}</td>
      <td>${t.archived ? '<span class="badge badge-gray">Archived</span>' : assignments.length ? assignments.map(row => `${escapeHtml(row.shop)} ${expiryBadge(daysUntil(row.expires))}`).join('<br>') : '<span class="badge badge-gray">Unassigned</span>'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          ${!t.archived ? `<button class="btn btn-sm btn-ghost" onclick="openEditTenant(${t.id})">Edit profile</button>` : ''}
          <button class="btn btn-sm btn-ghost" onclick="openManageTenancies(${t.id})">Manage shops</button>
          ${!t.archived && !assignments.length ? `<button class="btn btn-sm btn-red" onclick="deleteTenant(${t.id})">Archive</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="8">No tenants match your search.</td></tr>';
}

function filterTenants(q) {
  const filter = (document.getElementById('tenant-status-filter')?.value || '').toLowerCase();
  const filtered = repository.listTenants().filter(t => {
    const assignments = repository.listOccupancies().filter(row => row.tenantId === t.id);
    const matchQ = !q || [t.name, t.business, ...assignments.map(row => row.shop)].some(value => value.toLowerCase().includes(q.trim().toLowerCase()));
    const matchF = !filter || (filter === 'archived' ? t.archived : !t.archived && (filter === 'unassigned' ? !assignments.length : assignments.some(row => row.status === filter)));
    return matchQ && matchF;
  });
  renderTenants(filtered);
}

function renderUnits() {
  renderOperationalSummaries();
  const tenantMap = Object.fromEntries(repository.listOccupancies().map(tenant => [tenant.shop, tenant]));
  const blocks = [...new Set(repository.listUnits().map(unit => unit.block))];
  const map = document.getElementById('unit-map-blocks');
  if (map) {
    map.innerHTML = blocks.map((block, index) => `<div style="margin-bottom:12px;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;">Block ${block}</div><div class="unit-grid ${index < blocks.length - 1 ? 'mb-20' : ''}" id="unit-grid-${block}"></div>`).join('');
    repository.listUnits().forEach(unit => {
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
  tbody.innerHTML = repository.listUnits().map(unit => {
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
  const tenantMap = {}; repository.listOccupancies().forEach(t => { tenantMap[t.shop] = t; });
  const t = tenantMap[no];
  openModal(`Unit ${no} Details`, t ? `
    <div class="lease-card">
      <div class="lease-row"><div class="lease-key">Unit</div><div class="lease-val">${no}</div></div>
      <div class="lease-row"><div class="lease-key">Block</div><div class="lease-val">Block ${no[0]}</div></div>
      <div class="lease-row"><div class="lease-key">Tenant</div><div class="lease-val">${escapeHtml(t.name)}</div></div>
      <div class="lease-row"><div class="lease-key">Business</div><div class="lease-val">${escapeHtml(t.business)}</div></div>
      <div class="lease-row"><div class="lease-key">Annual Rent</div><div class="lease-val" style="color:var(--gold);">₦${t.rent.toLocaleString()}</div></div>
      <div class="lease-row"><div class="lease-key">Lease Expires</div><div class="lease-val">${formatDate(t.expires)}</div></div>
      <div class="lease-row"><div class="lease-key">Status</div><div class="lease-val">${expiryBadge(daysUntil(t.expires))}</div></div>
    </div>` : `<div class="empty-state"><div class="empty-icon">⬜</div><h3>Unit is Vacant</h3><p>This unit currently has no tenant assigned.</p></div>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button>${t ? `<button class="btn btn-primary" onclick="openManageTenancies(${t.id})">Manage shops</button>` : `<button class="btn btn-ghost" onclick="openAssignTenancy(0,${repository.listUnits().find(unit => unit.number === no)?.id})">Assign existing tenant</button><button class="btn btn-primary" onclick="openAddTenant('${no}')">Register new tenant</button>`}`);
}

function renderPayments() {
  renderOperationalSummaries();
  const tbody = document.getElementById('payments-tbody');
  if (!tbody) return;
  tbody.innerHTML = repository.listPayments().map(p => `
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
    getQuarterlyCollections(repository.listPayments()), ['Q1','Q2','Q3','Q4'],
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
  return [...repository.listOccupancies()].sort((a, b) => b.rent - a.rent).slice(0, 8).map(tenant => {
    const collected = repository.getTenancyApprovedAmount(tenant.tenancyId);
    const balance = Math.max(tenant.rent - collected, 0);
    return { tenant, collected, balance, status:balance === 0 ? 'Paid' : tenant.status === 'overdue' ? 'Overdue' : 'Partial' };
  });
}

function getExportData(kind) {
  if (session.role === 'admin' && kind === 'tenants') {
    return { name:'all-tenants', rows:[['Tenant ID', 'Tenant', 'Email', 'Phone', 'Business', 'Active shops', 'Annual rent total (NGN)', 'Archived'], ...repository.listTenants().map(t => { const rows = repository.listOccupancies().filter(row => row.tenantId === t.id); return [t.id, t.name, t.email, t.phone, t.business, rows.map(row => row.shop).join('; '), rows.reduce((sum, row) => sum + row.rent, 0), t.archived ? 'Yes' : 'No']; })] };
  }
  if (session.role === 'admin' && kind === 'payments') {
    return { name:'all-payment-records', rows:[['Reference', 'Tenant', 'Unit', 'Amount (NGN)', 'Period', 'Method', 'Date', 'Status'], ...repository.listPayments().map(p => [p.ref, p.tenant, p.unit, p.amount, p.period, p.method, p.date, p.status])] };
  }
  if (session.role === 'super' && kind === 'subscriptions') {
    return { name:'subscription-payments', rows:[['Plaza', 'Plan', 'Amount (NGN)', 'Period', 'Date', 'Status'], ...repository.listSubscriptionPayments().map(p => [p.plaza, p.plan, p.amount, p.period, p.date, p.status])] };
  }
  if (session.role === 'admin' && kind === 'report') {
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
  list.innerHTML = repository.listAdminNotifications().map(n => `
    <div class="notif-item ${n.unread?'notif-unread':''}">
      <div class="notif-dot" style="background:${n.type==='red'?'var(--red)':n.type==='orange'?'var(--orange)':n.type==='green'?'var(--green)':'var(--accent)'};"></div>
      <div class="notif-body"><div class="notif-text">${n.text}</div><div class="notif-time">${n.time}</div></div>
    </div>`).join('');
}

/* ---- Tenant ---- */
function renderTenantIdentity() {
  const tenant = repository.getTenant(DEMO_TENANT_ID);
  const assignments = repository.listOccupancies().filter(row => row.tenantId === DEMO_TENANT_ID);
  const name = tenant?.name || 'Tenant no longer assigned';
  const nextExpiry = assignments.map(row => row.expires).sort()[0];
  const values = { 'tenant-welcome-name':`${name} 👋`, 'tenant-lease-name':name,
    'tenant-shop-summary':assignments.length ? `Shops ${assignments.map(row => row.shop).join(', ')} · ${repository.listPlazas().find(plaza => plaza.id === DEMO_PLAZA_ID).name}` : 'No active shop assignments',
    'tenant-rent-total':formatNaira(assignments.reduce((sum, row) => sum + row.rent, 0)),
    'tenant-shop-numbers':assignments.map(row => row.shop).join(', ') || '—',
    'tenant-shop-count':assignments.length,
    'tenant-next-expiry':nextExpiry ? daysUntil(nextExpiry) : '—',
    'tenant-next-expiry-date':nextExpiry ? `Next lease end: ${formatDate(nextExpiry)}` : 'No active lease',
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  const details = document.getElementById('tenant-lease-details');
  if (details) details.innerHTML = `<h3 class="mb-16">${escapeHtml(name)}</h3>` + repository.listTenancies(DEMO_TENANT_ID).map(tenancy => {
    const unit = repository.getUnit(tenancy.unitId);
    return `<article class="lease-card mb-16"><strong>Shop ${escapeHtml(unit.number)}</strong><p>${formatNaira(tenancy.rent)} annual rent</p><p>${formatDate(tenancy.start)} – ${formatDate(tenancy.expires)}</p><p>Assignment: ${escapeHtml(tenancy.status)}</p>${tenancy.endedAt ? `<p class="maint-description">Closed ${formatDate(tenancy.endedAt)}: ${escapeHtml(tenancy.endReason)}</p>` : expiryBadge(daysUntil(tenancy.expires))}</article>`;
  }).join('');
}

function renderTenantDashboard() {
  renderTenantIdentity();
  const list = document.getElementById('tenant-recent-payments');
  if (!list) return;
  list.innerHTML = repository.listPayments().filter(p => p.tenantId === DEMO_TENANT_ID).slice(0,3).map(p => `
    <div class="receipt-item">
      <div class="receipt-icon">✅</div>
      <div class="receipt-info"><div class="receipt-name">${p.period} Annual Rent</div><div class="receipt-date">${formatDate(p.date)} · ${p.method} · ${payStatusBadge(p.status)}</div></div>
      <div><div class="receipt-amount">₦${p.amount.toLocaleString()}</div><div class="receipt-ref">${p.ref}</div></div>
    </div>`).join('');
}

function renderReceipts() {
  const list = document.getElementById('tenant-receipts-list');
  if (!list) return;
  list.innerHTML = repository.listPayments().filter(p => p.tenantId === DEMO_TENANT_ID && p.status === 'paid').map(p => `
    <div class="receipt-item">
      <div class="receipt-icon">🧾</div>
      <div class="receipt-info"><div class="receipt-name">${p.period} Annual Rent — Unit ${p.unit}</div><div class="receipt-date">${formatDate(p.date)} · via ${p.method} · Ref: ${p.ref}</div></div>
      <div style="text-align:right;"><div class="receipt-amount">₦${p.amount.toLocaleString()}</div><div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end;"><button class="btn btn-sm btn-ghost" onclick="showToast('Receipt PDF downloaded','info')">📄 PDF</button><button class="btn btn-sm btn-ghost" onclick="showToast('Receipt emailed to you','info')">📧</button></div></div>
    </div>`).join('');
}

function renderMaintenance() {
  renderTenantIdentity();
  const list = document.getElementById('maintenance-list');
  if (!list) return;
  const requests = repository.listMaintenanceRequests().filter(request => request.tenantId === DEMO_TENANT_ID);
  const select = document.getElementById('maintenance-tenancy');
  if (select) {
    const selected = Number(select.value);
    select.innerHTML = '<option value="">Choose a shop</option>' + repository.listActiveTenancies(DEMO_TENANT_ID).map(tenancy => `<option value="${tenancy.id}" ${tenancy.id === selected ? 'selected' : ''}>${escapeHtml(repository.getUnit(tenancy.unitId).number)}</option>`).join('');
  }
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
  const requests = repository.listMaintenanceRequests().filter(request => status === 'all' || request.status === status || (status === 'resolved' && request.status === 'completed'));
  list.innerHTML = requests.map(request => renderMaintenanceCard(request, true)).join('') || '<p class="maint-desc">No requests match this status.</p>';
  const open = repository.listMaintenanceRequests().filter(request => ['pending', 'in-progress'].includes(request.status)).length;
  document.getElementById('maintenance-summary').textContent = `${open} open · ${repository.listMaintenanceRequests().length} total requests`;
}

function openMaintenanceReview(id) {
  if (session.role !== 'admin') return;
  const request = repository.listMaintenanceRequests().find(item => item.id === id);
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
  if (session.role !== 'admin') return;
  const request = repository.listMaintenanceRequests().find(item => item.id === id);
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
  repository.updateMaintenanceRequest(id, { status, managerNote:note });
  closeModalDirect();
  renderAdminMaintenance();
  renderMaintenance();
  showToast('Maintenance request updated for this demo session.', 'success');
}

function renderTenantNotifs() {
  const list = document.getElementById('tenant-notif-list');
  if (!list) return;
  list.innerHTML = repository.listTenantNotifications().map(n => `
    <div class="notif-item ${n.unread?'notif-unread':''}">
      <div class="notif-dot" style="background:${n.type==='gold'?'var(--gold)':n.type==='green'?'var(--green)':'var(--accent)'};"></div>
      <div class="notif-body"><div class="notif-text">${n.text}</div><div class="notif-time">${n.time}</div></div>
    </div>`).join('');
}

/* ---- Payment Flow ---- */
function getSelectedTenantTenancy(allowFallback = true) {
  const tenant = repository.getTenant(DEMO_TENANT_ID);
  if (!tenant || tenant.archived) return null;
  const active = repository.listActiveTenancies(DEMO_TENANT_ID);
  const selected = active.find(tenancy => tenancy.id === selectedTenancyId) || (allowFallback ? active[0] : null);
  if (!selected) return null;
  selectedTenancyId = selected.id;
  return repository.getTenancyRow(selected.id);
}

function selectTenantTenancy(value) {
  const id = Number(value);
  if (!repository.listActiveTenancies(DEMO_TENANT_ID).some(tenancy => tenancy.id === id)) return;
  selectedTenancyId = id;
  renderPayStep(1);
}

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
  const assignment = getSelectedTenantTenancy();
  if (!assignment) { content.innerHTML = '<div class="card"><h3>No active shop assignment</h3><p>Payment evidence requires an active assignment. Your existing payment history remains in My Receipts.</p></div>'; return; }
  const total = assignment.rent + assignment.fees.reduce((sum, fee) => sum + fee.amount, 0);

  if (step === 1) {
    content.innerHTML = `
      <div class="card mb-20">
        <div class="card-header"><div class="card-title">Shop Payment Reference</div><span class="badge badge-blue">Demo charges</span></div>
        <div class="form-group mb-16"><label class="form-label" for="tenant-payment-tenancy">Shop assignment</label><select class="form-input" id="tenant-payment-tenancy" onchange="selectTenantTenancy(this.value)">${repository.listActiveTenancies(DEMO_TENANT_ID).map(tenancy => `<option value="${tenancy.id}" ${tenancy.id === assignment.tenancyId ? 'selected' : ''}>${escapeHtml(repository.getUnit(tenancy.unitId).number)}</option>`).join('')}</select></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Description</th><th>Period</th><th>Amount</th></tr></thead>
            <tbody>
              <tr><td>Annual Rent — Unit ${escapeHtml(assignment.shop)}</td><td>${formatDate(assignment.start)} – ${formatDate(assignment.expires)}</td><td style="font-weight:700;">${formatNaira(assignment.rent)}</td></tr>
              ${assignment.fees.map(fee => `<tr><td>${escapeHtml(fee.description)}</td><td>Demo charge</td><td>${formatNaira(fee.amount)}</td></tr>`).join('')}
              <tr><td colspan="2"><strong>Reference total</strong></td><td>${formatNaira(total)}</td></tr>
            </tbody>
          </table>
        </div>
        <div style="margin-top:14px;padding:12px 14px;background:rgba(59,130,246,0.06);border-radius:8px;font-size:12px;color:var(--text2);">
          These are sample agreement charges, not an outstanding-balance calculation. Payment allocation and invoices come in the rent-ledger stage.
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
            <div style="font-size:12px;color:var(--text2);margin-bottom:16px;">Amount to pay: <strong style="color:var(--gold);font-size:16px;">${formatNaira(total)}</strong></div>
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
          <p class="success-sub">This is a simulated submission for <strong style="color:var(--gold);">${formatNaira(total)}</strong>. No money was collected, no receipt was issued, and no lease was renewed.</p>
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:20px;max-width:360px;margin:0 auto 28px;text-align:left;">
            <div class="lease-row"><div class="lease-key">Reference</div><div class="lease-val" style="font-family:monospace;color:var(--accent2);">TXN-2026-0001</div></div>
            <div class="lease-row"><div class="lease-key">Reference amount</div><div class="lease-val" style="color:var(--gold);">${formatNaira(total)}</div></div>
            <div class="lease-row"><div class="lease-key">Selected shop</div><div class="lease-val">${escapeHtml(assignment.shop)}</div></div>
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
  const assignment = getSelectedTenantTenancy();
  if (!assignment) return;
  const total = assignment.rent + assignment.fees.reduce((sum, fee) => sum + fee.amount, 0);
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
        <div><div style="font-size:11px;color:var(--text3);">Reference Code</div><div style="font-weight:800;font-size:17px;color:var(--gold);">DEMO-${assignment.tenancyId}</div></div>
      </div>
      <div class="form-group mb-16"><label class="form-label" for="transfer-amount">Amount transferred (₦) — shop ${escapeHtml(assignment.shop)}</label><input class="form-input" id="transfer-amount" type="number" min="1" value="${total}"></div>
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
    detail.innerHTML = `<div style="background:rgba(11,164,219,0.05);border:1px solid rgba(11,164,219,0.2);border-radius:10px;padding:20px;"><div class="paystack-logo"><div class="paystack-logo-mark">P</div><div class="paystack-logo-text">Payment-provider demo</div></div><div style="font-size:12px;color:var(--text2);margin-bottom:16px;">Amount: <strong style="color:var(--gold);font-size:16px;">${formatNaira(total)}</strong></div><p style="font-size:12px;color:var(--text2);">This option is visual only. It does not send data to a payment provider or collect money.</p></div>`;
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
  const tenant = repository.getTenant(DEMO_TENANT_ID);
  const assignment = getSelectedTenantTenancy(false);
  if (!assignment) {
    showToast('This demo tenant no longer has a tenancy. Restore the sample data by refreshing.', 'error');
    return;
  }
  const reference = document.getElementById('transfer-reference')?.value.trim();
  const evidence = document.getElementById('transfer-evidence')?.files[0];
  const amount = Number(document.getElementById('transfer-amount')?.value);
  if (!reference || !evidence || !Number.isFinite(amount) || amount <= 0) {
    showToast('Enter a positive transferred amount, transfer reference, and receipt file name.','error');
    return;
  }
  const ref = `EVD-2026-${String(repository.listPayments().filter(p => p.ref.startsWith('EVD-2026-')).length + 1).padStart(3, '0')}`;
  const payment = { ref, tenantId:tenant.id, tenancyId:assignment.tenancyId, tenant:tenant.name, unit:assignment.shop, amount, period:'Unallocated', method:'Bank Transfer', date:new Date().toISOString().slice(0,10), status:'pending', transferReference:reference, evidenceFile:evidence.name };
  try { repository.addPayment(payment); }
  catch (error) { showToast(error.message, 'error'); return; }
  renderEvidenceSubmitted(payment);
  showToast('Evidence submitted for manager review. It is not approved yet.','success');
}

function renderEvidenceSubmitted(payment) {
  renderPayStep(3);
  const content = document.getElementById('pay-content');
  content.innerHTML = `<div class="card"><div class="success-state"><div class="success-icon">⏳</div><div class="success-title">Evidence Submitted for Review</div><p class="success-sub">Your bank-transfer evidence is pending manager verification. It has not been counted as a payment.</p><div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:20px;max-width:420px;margin:0 auto 28px;text-align:left;"><div class="lease-row"><div class="lease-key">Submission reference</div><div class="lease-val" style="font-family:monospace;color:var(--accent2);">${payment.ref}</div></div><div class="lease-row"><div class="lease-key">Bank reference</div><div class="lease-val">${escapeHtml(payment.transferReference)}</div></div><div class="lease-row"><div class="lease-key">Evidence file</div><div class="lease-val">${escapeHtml(payment.evidenceFile)}</div></div><div class="lease-row"><div class="lease-key">Status</div><div class="lease-val">${payStatusBadge('pending')}</div></div></div><button class="btn btn-ghost btn-lg" onclick="navTo('tenant-dashboard')">Back to Dashboard</button></div></div>`;
}

function submitMaintenanceRequest() {
  if (session.role !== 'tenant') return;
  const category = document.getElementById('maintenance-category').value;
  const priority = document.getElementById('maintenance-priority').value;
  const subject = document.getElementById('maintenance-subject').value.trim();
  const description = document.getElementById('maintenance-description').value.trim();
  if (!MAINTENANCE_CATEGORIES.includes(category) || !MAINTENANCE_PRIORITIES.includes(priority) || !subject || !description || subject.length > 120 || description.length > 2000) {
    showToast('Choose a category and priority, and enter a subject (up to 120 characters) and description (up to 2,000).', 'error');
    return;
  }
  const tenant = repository.getTenant(DEMO_TENANT_ID);
  const tenancyId = Number(document.getElementById('maintenance-tenancy')?.value);
  const assignment = repository.listActiveTenancies(DEMO_TENANT_ID).find(tenancy => tenancy.id === tenancyId);
  if (!tenant || tenant.archived || !assignment) {
    showToast('This demo tenant no longer has a tenancy. Restore the sample data by refreshing.', 'error');
    return;
  }
  const nextId = Math.max(0, ...repository.listMaintenanceRequests().map(request => Number(request.id.replace('MR-', '')))) + 1;
  const id = `MR-${String(nextId).padStart(3, '0')}`;
  repository.addMaintenanceRequest({ id, tenantId:tenant.id, tenancyId, category, priority, subject, description, date:formatDate(new Date()), status:'pending', managerNote:'' });
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

/* TENANT MODALS */
function openAddTenant(preferredUnit = '') {
  if (session.role !== 'admin') return;
  const availableUnits = getAvailableUnits();
  if (!availableUnits.length) {
    showToast('There are no vacant units available for a new tenant.','error');
    return;
  }
  openModal('Add New Tenant', `
    <div class="form-section-title">Tenant Information</div>
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label" for="nt-name">Full Name / Business Name</label><input class="form-input" placeholder="e.g. Adaeze Boutique" id="nt-name" maxlength="120"></div>
      <div class="form-group"><label class="form-label" for="nt-phone">Phone Number (optional)</label><input class="form-input" type="tel" placeholder="0801 234 5678" id="nt-phone" maxlength="40"></div>
    </div>
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label" for="nt-email">Email Address (optional)</label><input class="form-input" type="email" placeholder="tenant@email.com" id="nt-email" maxlength="254"></div>
      <div class="form-group"><label class="form-label">Business Type</label>
        <select class="form-input" id="nt-biz"><option>Fashion & Retail</option><option>Food & Catering</option><option>Electronics</option><option>Pharmacy & Health</option><option>Financial Services</option><option>Professional Services</option><option>Provisions / FMCG</option><option>Other</option></select>
      </div>
    </div>
    <div class="form-section-title">Shop & Lease</div>
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Shop / Unit Number</label>
        <select class="form-input" id="nt-unit">${availableUnits.map(unit => `<option${unit === preferredUnit ? ' selected' : ''}>${unit}</option>`).join('')}</select>
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
  if (session.role !== 'admin') return;
  const details = readTenantForm('nt');
  if (!details) return;
  if (repository.listOccupancies().some(tenant => tenant.shop === details.shop)) {
    showToast('That unit is already occupied. Choose a vacant unit.','error');
    return;
  }
  try { repository.addTenant(details); }
  catch (error) { showToast(error.message, 'error'); return; }
  closeModalDirect();
  renderTenants(repository.listTenants());
  renderUnits();
  showToast(`Tenant "${details.name}" added for this demo session.`,'success');
}

function openEditTenant(id) {
  if (session.role !== 'admin') return;
  const t = repository.listTenants().find(x => x.id === id);
  if (!t || t.archived) return;
  openModal(`Edit Tenant — ${t.name}`, `
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Business Name</label><input class="form-input" id="et-name" value="${escapeHtml(t.name)}"></div>
      <div class="form-group"><label class="form-label">Business Type</label><input class="form-input" id="et-biz" value="${escapeHtml(t.business)}"></div>
    </div>
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label" for="et-phone">Phone Number (optional)</label><input class="form-input" id="et-phone" type="tel" maxlength="40" value="${escapeHtml(t.phone || '')}"></div>
      <div class="form-group"><label class="form-label" for="et-email">Email Address (optional)</label><input class="form-input" id="et-email" type="email" maxlength="254" value="${escapeHtml(t.email || '')}"></div>
    </div>
    <p class="maint-meta">Profile changes apply to the tenant. Use Manage Shops for individual lease terms and assignment history.</p>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="saveTenantChanges(${t.id})">Save Changes</button>`);
}

function deleteTenant(id) {
  if (session.role !== 'admin') return;
  const t = repository.listTenants().find(x => x.id === id);
  if (!t || t.archived) return;
  if (repository.listActiveTenancies(id).length) { showToast('End active shop assignments in Manage Shops before archiving.', 'error'); return; }
  openModal('Archive Tenant', `<p>Archive <strong>${escapeHtml(t.name)}</strong>? Their profile, assignments, and payment history will be retained.</p>`,
  `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-red" onclick="removeTenant(${id})">Archive Tenant</button>`);
}

function saveTenantChanges(id) {
  if (session.role !== 'admin') return;
  const tenant = repository.listTenants().find(item => item.id === id);
  const details = readTenantProfile('et');
  if (!tenant || !details) return;
  try { repository.updateTenant(id, details); }
  catch (error) { showToast(error.message, 'error'); return; }
  closeModalDirect();
  renderTenants(repository.listTenants());
  renderUnits();
  renderTenantIdentity();
  showToast(`Tenant "${details.name}" updated for this demo session.`,'success');
}

function removeTenant(id) {
  if (session.role !== 'admin') return;
  const index = repository.listTenants().findIndex(tenant => tenant.id === id);
  if (index < 0) return;
  let removed;
  try { removed = repository.removeTenant(id); }
  catch (error) { showToast(error.message, 'error'); return; }
  closeModalDirect();
  renderTenants(repository.listTenants());
  renderUnits();
  renderTenantIdentity();
  showToast(`Tenant "${removed.name}" archived for this demo session.`,'info');
}

function getAvailableUnits() {
  return repository.listUnits().filter(unit => !repository.listActiveTenancies().some(tenancy => tenancy.unitId === unit.id)).map(unit => unit.number);
}

function readTenantProfile(prefix) {
  const name = document.getElementById(`${prefix}-name`)?.value.trim();
  const business = document.getElementById(`${prefix}-biz`)?.value.trim();
  const email = document.getElementById(`${prefix}-email`)?.value.trim() || '';
  const phoneInput = document.getElementById(`${prefix}-phone`)?.value.trim() || '';
  const phone = phoneInput.replace(/[\s()-]/g, '');
  if (!name || name.length > 120 || !business || business.length > 100) {
    showToast('Enter a name (up to 120 characters) and business type (up to 100).', 'error');
    return null;
  }
  if ((email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) || (phoneInput && (phoneInput.length > 40 || !/^\+?\d{7,15}$/.test(phone)))) {
    showToast('Enter a valid email and phone number, or leave the optional contact fields blank.', 'error');
    return null;
  }
  if (/[<>]/.test(name) || /[<>]/.test(business)) {
    showToast('Names and business types cannot contain angle brackets.','error');
    return null;
  }
  return { name, email, phone, business };
}

function readTenantForm(prefix) {
  const profile = readTenantProfile(prefix);
  if (!profile) return null;
  const shop = document.getElementById(`${prefix}-unit`)?.value;
  const rent = Number(document.getElementById(`${prefix}-rent`)?.value);
  const start = document.getElementById(`${prefix}-start`)?.value;
  const expires = document.getElementById(`${prefix}-end`)?.value;
  if (!repository.listUnits().some(unit => unit.number === shop) || !Number.isFinite(rent) || rent <= 0) {
    showToast('Choose an existing shop and enter positive rent.', 'error');
    return null;
  }
  if (!isValidDateOnly(start) || !isValidDateOnly(expires)) {
    showToast('Enter valid lease dates.', 'error');
    return null;
  }
  if (expires <= start) {
    showToast('The lease end date must be after the start date.','error');
    return null;
  }
  return { ...profile, shop, rent, start, expires };
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
  if (repository.listUnits().some(unit => unit.number === number)) {
    showToast('That unit number already exists.','error');
    return;
  }
  repository.addUnit({ number, block, size, suggestedRent });
  closeModalDirect();
  renderUnits();
  showToast(`Unit ${number} added for this demo session.`,'success');
}

function openRecordPayment() {
  openModal('Record Manual Payment', `
    <div class="form-grid-2 mb-14">
      <div class="form-group"><label class="form-label">Tenant / shop assignment</label>
        <select class="form-input" id="manual-payment-tenant">${repository.listOccupancies().map(t=>`<option value="${t.tenancyId}">${escapeHtml(t.name)} (${escapeHtml(t.shop)})</option>`).join('')}</select>
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
  if (session.role !== 'admin') return;
  const tenancyId = Number(document.getElementById('manual-payment-tenant')?.value);
  const amount = Number(document.getElementById('manual-payment-amount')?.value);
  const method = document.getElementById('manual-payment-method')?.value;
  const date = document.getElementById('manual-payment-date')?.value;
  const period = document.getElementById('manual-payment-period')?.value;
  const tenant = repository.getTenancyRow(tenancyId);
  if (!tenant || tenant.lifecycle !== 'active' || tenant.archived || tenant.plazaId !== DEMO_PLAZA_ID || !method || !period || !date || !Number.isFinite(amount) || amount <= 0) {
    showToast('Select a tenant and enter a positive amount, method, date, and period.','error');
    return;
  }
  if (Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
    showToast('Enter a valid payment date.','error');
    return;
  }
  const year = date.slice(0, 4);
  const ref = `MAN-${year}-${String(repository.listPayments().filter(payment => payment.ref.startsWith(`MAN-${year}-`)).length + 1).padStart(3, '0')}`;
  repository.addPayment({ ref, tenancyId, tenantId:tenant.id, tenant:tenant.name, unit:tenant.shop, amount, period, method, date, status:'paid', source:'manual' });
  closeModalDirect();
  renderPayments();
  renderAdminDashboard();
  renderTenantDashboard();
  renderReceipts();
  showToast(`Manual payment ${ref} recorded as paid for this demo session.`,'success');
}

function openPaymentReview(ref) {
  const payment = repository.listPayments().find(p => p.ref === ref);
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
  const payment = repository.listPayments().find(p => p.ref === ref);
  if (!payment || payment.status !== 'pending') return;
  repository.updatePayment(ref, { status:'paid', reviewReason:document.getElementById('payment-review-reason')?.value.trim() || 'Approved in demo' });
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
  const payment = repository.listPayments().find(p => p.ref === ref);
  if (!payment || payment.status !== 'pending') return;
  repository.updatePayment(ref, { status:'rejected', reviewReason:reason });
  closeModalDirect();
  renderPayments();
  showToast('Evidence rejected and the reason was recorded for this demo session.','info');
}

function openAddPlaza() {
  if (session.role !== 'super') return;
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
  if (session.role !== 'super') return;
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
  if (repository.listPlazas().some(plaza => normalize(plaza.name) === normalize(name) && normalize(plaza.city) === normalize(city))) {
    showToast('A plaza with that name already exists in this city.', 'error');
    return;
  }
  repository.addPlaza({ name, owner, email, city, units, tenants:0, plan:plan === 'trial' ? 'Standard' : plan, status:plan === 'trial' ? 'trial' : 'active', joined:new Date().toISOString().slice(0, 10) });
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
  if (session.role !== 'super' || !Object.hasOwn(repository.getPlans(), plan)) return;
  const details = repository.getPlans()[plan];
  openModal(`Edit ${details.name} Plan`, `
    <div class="form-group mb-14"><label class="form-label" for="plan-price">Monthly Price (₦)</label><input class="form-input" id="plan-price" type="number" min="1" step="1" value="${details.price}"></div>
    <div class="form-group mb-14"><label class="form-label" for="plan-units">Max Units (leave blank for unlimited)</label><input class="form-input" id="plan-units" type="number" min="1" step="1" value="${details.maxUnits ?? ''}"></div>
    <div class="form-group mb-4"><label class="form-label" for="plan-features">Features (one per line, up to 20)</label><textarea class="form-input" id="plan-features" rows="6" maxlength="4000">${escapeHtml(details.features.join('\n'))}</textarea></div>
    <p class="maint-meta">Changes update the demo catalog until refresh. Existing plazas and recorded payments stay as they are.</p>`,
    `<button class="btn btn-ghost" onclick="closeModalDirect()">Cancel</button><button class="btn btn-primary" onclick="savePlan('${plan}')">Save Plan</button>`);
}

function savePlan(plan) {
  if (session.role !== 'super' || !Object.hasOwn(repository.getPlans(), plan)) return;
  const price = Number(document.getElementById('plan-price').value);
  const unitValue = document.getElementById('plan-units').value.trim();
  const maxUnits = unitValue === '' ? null : Number(unitValue);
  const features = document.getElementById('plan-features').value.split('\n').map(value => value.trim()).filter(Boolean);
  if (!Number.isSafeInteger(price) || price < 1 || (maxUnits !== null && (!Number.isSafeInteger(maxUnits) || maxUnits < 1)) || features.length < 1 || features.length > 20 || features.some(value => value.length > 200)) {
    showToast('Use a positive whole price, a positive whole unit limit or blank for unlimited, and 1–20 features of up to 200 characters each.', 'error');
    return;
  }
  repository.updatePlan(plan, { price, maxUnits, features });
  closeModalDirect();
  renderPlanCards();
  showToast('Plan updated for this demo session.', 'success');
}

function renderPlanCards() {
  const container = document.getElementById('subscription-plan-cards');
  if (!container) return;
  container.innerHTML = Object.entries(repository.getPlans()).map(([key, plan]) => {
    const active = repository.listPlazas().filter(plaza => plaza.plan === plan.name && plaza.status === 'active').length;
    return `<article class="plan-card ${key === 'standard' ? 'active-plan' : ''}">
      <div class="flex items-center justify-between mb-16"><div><div class="font-bold">${plan.name}</div><div style="font-size:28px;font-weight:800;margin-top:4px;">${formatNaira(plan.price)}</div><div class="text-sm text-muted">per month</div></div><span class="badge badge-blue">${active} active</span></div>
      <div class="flex items-center justify-between text-sm mb-16"><span class="text-muted">Max Units</span><span>${plan.maxUnits ?? 'Unlimited'}</span></div>
      <ul class="plan-features">${plan.features.map(feature => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
      <button class="btn btn-ghost w-full" onclick="openEditPlan('${key}')">Edit Plan</button>
    </article>`;
  }).join('');
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
// Temporary bridge for existing inline HTML handlers. New modules remain scoped.
export { session, repository, ui };
export const actions = {
  showLanding, showLogin, showRegister, hideAll, switchLoginTab,
  doLogin, doRegister, switchRole, buildSidebar, navTo,
  renderPage, renderSuperDashboard, renderPlazasList, filterPlazas, renderPlazaSummary,
  openPlazaDetail, confirmPlazaStatusChange, savePlazaStatus, renderSubPayments, renderSuperRevenue,
  getMonthlyCollections, getQuarterlyCollections, getTenantApprovedAmount, calculateOperationalSummary, renderOperationalSummaries,
  renderAdminDashboard, renderTenants, filterTenants, renderUnits, showUnitDetail,
  renderPayments, renderReports, getUnitReportRows, buildCsv, getExportData,
  exportCsv, renderAdminNotifs, renderTenantIdentity, renderTenantDashboard, renderReceipts,
  renderMaintenance, renderMaintenanceCard, renderAdminMaintenance, openMaintenanceReview, saveMaintenanceReview,
  renderTenantNotifs, renderPayStep, selectPayMethod, processPayment, submitTransferEvidence,
  renderEvidenceSubmitted, submitMaintenanceRequest, buildBarChart, openModal, closeModal,
  closeModalDirect, openAddTenant, saveTenant, openEditTenant, deleteTenant,
  saveTenantChanges, removeTenant, getAvailableUnits, readTenantForm, isValidDateOnly,
  openAddUnit, saveUnit, openRecordPayment, saveManualPayment, openPaymentReview,
  approvePaymentEvidence, rejectPaymentEvidence, openAddPlaza, savePlaza, openEditPlan,
  savePlan, renderPlanCards, showToast, toggleThis, toggleMobileSidebar,
  formatDate, formatNaira, daysUntil, expiryBadge, payStatusBadge,
  escapeHtml, statusBadge, avatarStyle, checkMobile, scrollToFeatures,
  openManageTenancies, openAssignTenancy, saveAssignment, openEditTenancy, saveTenancyTerms,
  openEndTenancy, endTenancy, getSelectedTenantTenancy, selectTenantTenancy, readTenantProfile,
  refreshTenantViews
};
const inlineHandlers = {
  approvePaymentEvidence, closeModal, closeModalDirect, confirmPlazaStatusChange, deleteTenant,
  doLogin, doRegister, exportCsv, filterPlazas, filterTenants,
  navTo, openAddPlaza, openAddTenant, openAddUnit, openEditPlan,
  openEditTenant, openMaintenanceReview, openPaymentReview, openPlazaDetail, openRecordPayment,
  processPayment, rejectPaymentEvidence, removeTenant, renderAdminMaintenance, renderPayStep,
  renderPlazasList, saveMaintenanceReview, saveManualPayment, savePlan, savePlaza,
  savePlazaStatus, saveTenant, saveTenantChanges, saveUnit, selectPayMethod,
  showLanding, showLogin, showRegister, showToast, showUnitDetail,
  submitMaintenanceRequest, switchLoginTab, switchRole, toggleMobileSidebar, toggleThis,
  openManageTenancies, openAssignTenancy, saveAssignment, openEditTenancy, saveTenancyTerms,
  openEndTenancy, endTenancy, selectTenantTenancy
};
Object.assign(window, inlineHandlers);

showLanding();
