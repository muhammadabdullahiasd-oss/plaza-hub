const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp } = require('./helpers/load-app.cjs');
const { createPreviewServer } = require('../scripts/preview.cjs');

test('repositories have independent fixtures and protect tenant identity on update', async () => {
  const { createRepository } = await import('../js/data/repository.js');
  const first = createRepository();
  const second = createRepository();
  first.updateTenant(6, { name:'Changed name', id:123, paid:false });
  assert.equal(first.getTenant(6).name, 'Changed name');
  assert.equal(first.getInvoiceSummary(1).balance, 0);
  assert.equal(second.getTenant(6).name, 'Funmi Boutique');
  assert.equal(first.getTenantApprovedAmount(6), 480000);
  assert.throws(() => first.addTenant({ name:'Duplicate shop', shop:'D-09' }), /occupied/);
  assert.throws(() => first.addTenant({ name:'Unknown shop', shop:'Z-99' }), /existing/);
  first.endTenancy(6, 'Moved out');
  first.removeTenant(6);
  const replacement = first.addTenant({ name:'Funmi Boutique', shop:'D-09', id:6, paid:true, rent:480000, start:'2026-01-01', expires:'2027-01-01' });
  assert.notEqual(replacement.id, 6);
  assert.equal(first.listInvoiceSummaries().some(invoice => invoice.tenantId === replacement.id), false);
  assert.equal(first.getTenantApprovedAmount(replacement.id), 0);
});

test('all page routes and inline handler names remain connected after module extraction', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const elements = new Map();
  const element = () => ({ value:'', innerHTML:'', textContent:'', style:{}, classList:{ add() {}, remove() {}, toggle() {} }, appendChild() {} });
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], element());
  const events = [];
  const context = vm.createContext({
    document:{ getElementById:id => elements.get(id) || null, querySelectorAll:() => [], createElement:element },
    window:{ innerWidth:1024, addEventListener:name => events.push(name) },
    setTimeout() {},
  });
  const { actions, session } = await loadApp(context);
  assert.deepEqual(events, ['resize']);
  assert.equal(context.window.repository, undefined);
  const sources = [html, ...['app.js', 'ui.js', 'features/tenancies.js', 'features/invoices.js', 'features/payments.js', 'features/receipts.js', 'features/announcements.js', 'features/rent-adjustments.js'].map(file => fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'))];
  for (const source of sources) for (const handler of source.matchAll(/\bon(?:click|input|change|submit)="([^"]+)"/g)) {
    for (const call of handler[1].matchAll(/(?<![.\w])([A-Za-z_]\w*)\(/g)) {
      assert.equal(typeof actions[call[1]], 'function', `Missing handler: ${call[1]}`);
      assert.equal(typeof context.window[call[1]], 'function', `Handler not exposed to HTML: ${call[1]}`);
    }
  }
  for (const role of ['super', 'admin', 'tenant']) {
    actions.switchRole(role);
    for (const id of elements.keys()) if (id.startsWith(`page-${role}-`)) {
      actions.navTo(id.slice(5));
      assert.equal(session.page, id.slice(5));
      assert.notEqual(elements.get('topbar-title').textContent, 'PlazaHub');
    }
  }
});

test('preview serves the complete module graph and keeps private files unavailable', async () => {
  const server = createPreviewServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const routes = ['/', '/index.html', '/plazahub.html', '/css/style.css', '/js/app.js', '/js/navigation.js', '/js/utils.js', '/js/ui.js', '/js/data/repository.js', '/js/data/demo-data.js', '/js/data/ledger.js', '/js/data/announcements.js', '/js/data/rent-adjustments.js', '/js/features/tenancies.js', '/js/features/invoices.js', '/js/features/payments.js', '/js/features/receipts.js', '/js/features/announcements.js', '/js/features/rent-adjustments.js'];
    for (const route of routes) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      if (route.endsWith('.js')) {
        assert.match(response.headers.get('content-type'), /javascript/);
        const source = await response.text();
        for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
          const dependency = await fetch(new URL(match[1], base + route));
          assert.equal(dependency.status, 200, `Import ${match[1]} from ${route}`);
        }
      }
    }
    assert.match(await (await fetch(base + '/')).text(), /<script type="module" src="js\/app.js"><\/script>/);
    assert.match(await (await fetch(base + '/plazahub.html')).text(), /url=index.html/);
    for (const route of ['/package.json', '/.git/config', '/tests/tenants.test.cjs', '/js/no-such-module.js']) assert.equal((await fetch(base + route)).status, 404);
    const head = await fetch(base + '/index.html', { method:'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
