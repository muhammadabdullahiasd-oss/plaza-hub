const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createDemo() {
  const nodes = new Map();
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { value:'', innerHTML:'', textContent:'', style:{}, classList:{ add() {}, remove() {}, toggle() {} } });
    return nodes.get(id);
  };
  const context = vm.createContext({ document:{ getElementById:element, querySelectorAll:() => [] }, window:{ innerWidth:1024, addEventListener() {} }, setTimeout() {} });
  const run = code => vm.runInContext(code, context);
  run(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'));
  run("currentRole = 'super'; showToast = (message, type) => {globalThis.toast = {message, type};}; closeModalDirect = () => {}; openModal = (title, body, footer) => {globalThis.modal = {title, body, footer};};");
  element('plaza-status-filter').value = 'all';
  element('plaza-plan-filter').value = 'all';
  function fill(overrides = {}) {
    const values = { name:'New Plaza', owner:'New Owner', email:'owner@example.com', city:'Lagos', units:'30', plan:'Standard', ...overrides };
    for (const [key, value] of Object.entries(values)) element(`plaza-${key}`).value = value;
  }
  return { run, element, fill };
}

test('onboarding adds distinct records, resets filters, and updates dashboard', () => {
  const { run, element, fill } = createDemo();
  element('plaza-search').value = 'no match';
  element('plaza-status-filter').value = 'suspended';
  fill();
  run('savePlaza();');
  assert.equal(run('PLAZAS.length'), 9);
  assert.equal(run('PLAZAS[0].id'), 9);
  assert.equal(run('PLAZAS[0].tenants'), 0);
  assert.equal(element('plaza-search').value, '');
  assert.equal(element('plaza-status-filter').value, 'all');
  assert.equal(element('super-plaza-count').textContent, 9);
  assert.match(element('super-recent-plazas').innerHTML, /New Plaza/);
  assert.match(element('plazas-list').innerHTML, /New Plaza/);
  fill({ name:'Trial Plaza', plan:'trial' });
  run('savePlaza();');
  assert.equal(run('PLAZAS[0].id'), 10);
  assert.equal(run('PLAZAS[0].status'), 'trial');
  assert.equal(run('PLAZAS[0].plan'), 'Standard');
});

test('invalid fields and duplicate plazas are rejected without mutation', () => {
  const { run, fill } = createDemo();
  for (const invalid of [{name:' '}, {owner:''}, {city:''}, {email:'not-email'}, {units:'0'}, {units:'2.5'}, {units:'Infinity'}, {plan:'Unknown'}, {name:'x'.repeat(121)}]) {
    fill(invalid);
    run('savePlaza();');
    assert.equal(run('PLAZAS.length'), 8);
    assert.equal(run('toast.type'), 'error');
  }
  fill({ name:' sunshine  BUSINESS plaza ', city:'LAGOS' });
  run('savePlaza();');
  assert.equal(run('PLAZAS.length'), 8);
  assert.match(run('toast.message'), /already exists/);
});

test('combined filters preserve functioning View and Suspend actions', () => {
  const { run, element } = createDemo();
  element('plaza-plan-filter').value = 'Premium';
  element('plaza-status-filter').value = 'active';
  run("filterPlazas(' nwosu ');");
  const html = element('plazas-list').innerHTML;
  assert.match(html, /Nwosu Commercial Plaza/);
  assert.doesNotMatch(html, /Sunshine Business Plaza|Eko Market Suites/);
  assert.match(html, /openPlazaDetail\(3\)/);
  assert.match(html, /confirmPlazaStatusChange\(3\)/);
  element('plaza-status-filter').value = 'suspended';
  run('renderPlazasList();');
  assert.match(element('plazas-list').innerHTML, /No plazas found/);
});

test('confirmation is non-mutating and restore preserves trial status', () => {
  const { run, element } = createDemo();
  run('confirmPlazaStatusChange(6);');
  assert.equal(run('PLAZAS.find(p => p.id === 6).status'), 'trial');
  assert.match(run('modal.footer'), /savePlazaStatus\(6, true\)/);
  run('savePlazaStatus(6, true);');
  assert.equal(run('PLAZAS.find(p => p.id === 6).status'), 'suspended');
  assert.match(element('plaza-summary').textContent, /2 suspended/);
  // A repeated save must not overwrite the remembered trial state.
  run('savePlazaStatus(6, true); savePlazaStatus(6, false);');
  assert.equal(run('PLAZAS.find(p => p.id === 6).status'), 'trial');
  run('savePlazaStatus(8, false);');
  assert.equal(run('PLAZAS.find(p => p.id === 8).status'), 'active');
});

test('details, list, and dashboard escape user text and guard role mutations', () => {
  const { run, element, fill } = createDemo();
  fill({ name:'<img src=x onerror=alert(1)>', owner:"O'Neil <script>", city:'<b>Lagos</b>' });
  run('savePlaza(); openPlazaDetail(9);');
  for (const html of [element('plazas-list').innerHTML, element('super-recent-plazas').innerHTML, run('modal.body')]) {
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img|<script>/);
  }
  run("currentRole = 'tenant'; savePlazaStatus(9, true);");
  assert.equal(run('PLAZAS[0].status'), 'active');
  fill({ name:'Unauthorized Plaza' });
  run('savePlaza();');
  assert.equal(run('PLAZAS.length'), 9);
});

test('dashboard distribution handles no active plazas without NaN', () => {
  const { run, element } = createDemo();
  run("PLAZAS.forEach(p => {p.status = 'suspended';}); renderPlazaSummary();");
  assert.match(element('super-plan-distribution').innerHTML, /0%/);
  assert.doesNotMatch(element('super-plan-distribution').innerHTML, /NaN|Infinity/);
});
