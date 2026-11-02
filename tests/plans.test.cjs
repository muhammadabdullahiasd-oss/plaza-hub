const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createDemo() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value:'', innerHTML:'', style:{} });
    return elements.get(id);
  };
  const context = vm.createContext({ document:{ getElementById:element, querySelectorAll:() => [] }, window:{ innerWidth:1024, addEventListener() {} }, setTimeout() {} });
  const run = code => vm.runInContext(code, context);
  run(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'));
  run("currentRole = 'super'; closeModalDirect = () => {}; showToast = (message, type) => {globalThis.toast = {message, type};}; openModal = (title, body) => {globalThis.modal = body;};");
  const fill = (price = '20000', units = '30', features = 'Tenant management\nReports') => {
    element('plan-price').value = price;
    element('plan-units').value = units;
    element('plan-features').value = features;
  };
  return { run, element, fill };
}

test('plan edits survive rerender and reopening without changing recorded payments', () => {
  const { run, element, fill } = createDemo();
  const payments = run('JSON.stringify(SUB_PAYMENTS)');
  const plazas = run('JSON.stringify(PLAZAS)');
  fill();
  run("savePlan('basic'); renderPlanCards(); openEditPlan('basic');");
  assert.equal(run('PLANS.basic.price'), 20000);
  assert.match(element('subscription-plan-cards').innerHTML, /₦20,000/);
  assert.match(run('modal'), /value="20000"/);
  assert.match(run('modal'), /Reports/);
  assert.equal(run('JSON.stringify(SUB_PAYMENTS)'), payments);
  assert.equal(run('JSON.stringify(PLAZAS)'), plazas);
});

test('blank unit limit means unlimited and features render as text', () => {
  const { run, element, fill } = createDemo();
  fill('90000', '', '<img src=x onerror=alert(1)>\nA & B');
  run("savePlan('premium'); openEditPlan('premium');");
  assert.equal(run('PLANS.premium.maxUnits'), null);
  assert.match(element('subscription-plan-cards').innerHTML, /Unlimited/);
  assert.match(element('subscription-plan-cards').innerHTML, /&lt;img/);
  assert.doesNotMatch(element('subscription-plan-cards').innerHTML, /<img/);
  assert.match(run('modal'), /&amp;/);
});

test('invalid prices, limits, and feature lists are rejected', () => {
  const { run, fill } = createDemo();
  for (const inputs of [['0', '30', 'Feature'], ['3.5', '30', 'Feature'], ['100', '0', 'Feature'], ['100', '2.5', 'Feature'], ['100', '30', '  '], ['100', '30', 'x'.repeat(201)], ['100', '30', Array(21).fill('Feature').join('\n')]]) {
    fill(...inputs);
    run("savePlan('basic');");
    assert.equal(run('PLANS.basic.price'), 15000);
    assert.equal(run('toast.type'), 'error');
  }
});

test('active counts follow plaza status and plan editing requires super role', () => {
  const { run, element, fill } = createDemo();
  run('renderPlanCards();');
  assert.match(element('subscription-plan-cards').innerHTML, /2 active/);
  run("PLAZAS.forEach(p => {p.status = 'suspended';}); renderPlanCards();");
  assert.doesNotMatch(element('subscription-plan-cards').innerHTML, /[1-9] active/);
  fill();
  run("currentRole = 'tenant'; savePlan('basic'); openEditPlan('basic');");
  assert.equal(run('PLANS.basic.price'), 15000);
  assert.equal(run('typeof modal'), 'undefined');
  run("currentRole = 'super'; savePlan('__proto__'); openEditPlan('unknown');");
  assert.equal(run('typeof modal'), 'undefined');
});
