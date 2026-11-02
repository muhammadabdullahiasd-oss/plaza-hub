const AVATAR_COLORS = [
  'rgba(59,130,246,0.2);color:var(--accent2)',
  'rgba(16,185,129,0.2);color:var(--green)',
  'rgba(245,158,11,0.2);color:var(--gold)',
  'rgba(239,68,68,0.2);color:var(--red)',
  'rgba(139,92,246,0.2);color:var(--purple)',
  'rgba(249,115,22,0.2);color:var(--orange)',
];

export function getMonthlyCollections(records) {
  const monthly = Array(12).fill(0);
  records.filter(record => record.status === 'paid').forEach(record => {
    const month = new Date(record.date).getMonth();
    if (month >= 0 && month < 12) monthly[month] += record.amount;
  });
  return monthly;
}

export function getQuarterlyCollections(records) {
  const quarterly = Array(4).fill(0);
  records.filter(record => record.status === 'paid').forEach(record => {
    const month = new Date(record.date).getMonth();
    if (month >= 0 && month < 12) quarterly[Math.floor(month / 3)] += record.amount;
  });
  return quarterly;
}

export function buildCsv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    // Keep numbers numeric, but prevent user text from becoming spreadsheet formulas.
    let cell = String(value ?? '');
    if (typeof value === 'string' && (/^[\s\uFEFF]*[=+@-]/.test(cell) || /^[\t\r\n]/.test(cell))) cell = "'" + cell;
    return '"' + cell.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n');
}

export function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' });
}

export function formatNaira(amount) {
  return `₦${Number(amount).toLocaleString('en-NG')}`;
}

export function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr);
  return Math.ceil((target - today) / (1000*60*60*24));
}

export function expiryBadge(days) {
  if (days < 0)  return `<span class="badge badge-red">🔴 Overdue</span>`;
  if (days <= 30) return `<span class="badge badge-red">🔴 ${days}d left</span>`;
  if (days <= 60) return `<span class="badge badge-orange">🟠 ${days}d left</span>`;
  return `<span class="badge badge-green">🟢 Active</span>`;
}

export function payStatusBadge(s) {
  if (s==='rejected') return '<span class="badge badge-red">Rejected</span>';
  if (s==='paid')    return '<span class="badge badge-green">✓ Paid</span>';
  if (s==='pending') return '<span class="badge badge-orange">⏳ Pending</span>';
  if (s==='overdue') return '<span class="badge badge-red">✗ Overdue</span>';
  return '<span class="badge badge-gray">—</span>';
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
}

export function statusBadge(s) {
  const map = { active:'<span class="badge badge-green">Active</span>', trial:'<span class="badge badge-blue">Trial</span>', suspended:'<span class="badge badge-red">Suspended</span>', expired:'<span class="badge badge-gray">Expired</span>' };
  return map[s] || '<span class="badge badge-gray">—</span>';
}

export function avatarStyle(name) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return `background:${AVATAR_COLORS[idx]};`;
}
