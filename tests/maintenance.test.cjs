const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

function createDemo() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value:'', innerHTML:'', textContent:'', style:{}, classList:{ remove() {}, add() {}, toggle() {} } });
    return elements.get(id);
  };
  const context = vm.createContext({
    document:{ getElementById:element, querySelectorAll:() => [] },
    window:{ innerWidth:1024, addEventListener() {} },
    setTimeout() {},
  });
  const run = code => vm.runInContext(code, context);
  run(source);
  run("showToast = (message, type) => { globalThis.lastToast = {message, type}; }; closeModalDirect = () => {}; openModal = (title, body) => { globalThis.modal = body; };");
  element('maintenance-form').reset = () => {
    element('maintenance-subject').value = '';
    element('maintenance-description').value = '';
  };
  element('maintenance-filter').value = 'all';
  function submit(subject = 'Leaking pipe', description = 'Water is leaking beside the shop entrance.') {
    element('maintenance-category').value = 'Plumbing';
    element('maintenance-priority').value = 'High';
    element('maintenance-subject').value = subject;
    element('maintenance-description').value = description;
    run("currentRole = 'tenant'; submitMaintenanceRequest();");
  }
  return { element, run, submit };
}

test('submission retains actual details and unique references across re-renders', () => {
  const { run, submit, element } = createDemo();
  submit();
  assert.equal(run('MAINTENANCE_REQUESTS[0].id'), 'MR-005');
  assert.equal(run('MAINTENANCE_REQUESTS[0].unit'), 'D-09');
  assert.equal(run('MAINTENANCE_REQUESTS[0].priority'), 'High');
  assert.equal(run('MAINTENANCE_REQUESTS[0].status'), 'pending');
  assert.equal(element('maintenance-subject').value, '');
  run('renderMaintenance(); renderAdminMaintenance();');
  assert.match(element('maintenance-list').innerHTML, /Leaking pipe/);
  assert.match(element('admin-maintenance-list').innerHTML, /Water is leaking/);
  assert.match(element('maintenance-summary').textContent, /1 open/);
  submit('Broken door');
  assert.equal(run('MAINTENANCE_REQUESTS[0].id'), 'MR-006');
});

test('validation rejects blank fields, invalid options, and oversized input', () => {
  const { run, submit, element } = createDemo();
  for (const [subject, description] of [['  ', 'Details'], ['Subject', '  '], ['x'.repeat(121), 'Details'], ['Subject', 'x'.repeat(2001)]]) {
    submit(subject, description);
    assert.equal(run('MAINTENANCE_REQUESTS.length'), 3);
    assert.equal(run('lastToast.type'), 'error');
  }
  element('maintenance-subject').value = 'Valid subject';
  element('maintenance-description').value = 'Valid description';
  element('maintenance-category').value = 'invalid';
  run('submitMaintenanceRequest();');
  assert.equal(run('MAINTENANCE_REQUESTS.length'), 3);
  element('maintenance-category').value = 'Plumbing';
  element('maintenance-priority').value = 'invalid';
  run('submitMaintenanceRequest();');
  assert.equal(run('MAINTENANCE_REQUESTS.length'), 3);
});

test('admin updates appear for tenants and resolution requires a note', () => {
  const { run, submit, element } = createDemo();
  submit();
  run("currentRole = 'admin'; openMaintenanceReview('MR-005');");
  assert.match(run('modal'), /Leaking pipe/);
  element('maintenance-status').value = 'in-progress';
  element('maintenance-note').value = 'A plumber is on the way.';
  run("saveMaintenanceReview('MR-005');");
  assert.equal(run('MAINTENANCE_REQUESTS[0].status'), 'in-progress');
  assert.match(element('maintenance-list').innerHTML, /A plumber is on the way/);
  element('maintenance-status').value = 'resolved';
  element('maintenance-note').value = '  ';
  run("saveMaintenanceReview('MR-005');");
  assert.equal(run('MAINTENANCE_REQUESTS[0].status'), 'in-progress');
  element('maintenance-note').value = 'Pipe replaced and tested.';
  run("saveMaintenanceReview('MR-005');");
  assert.equal(run('MAINTENANCE_REQUESTS[0].status'), 'resolved');
  assert.match(element('maintenance-list').innerHTML, /Resolved/);
  assert.match(element('maintenance-summary').textContent, /0 open/);
});

test('filters include historical completions and display empty states', () => {
  const { run, element } = createDemo();
  element('maintenance-filter').value = 'resolved';
  run('renderAdminMaintenance();');
  assert.match(element('admin-maintenance-list').innerHTML, /MR-002/);
  assert.match(element('admin-maintenance-list').innerHTML, /MR-004/);
  element('maintenance-filter').value = 'pending';
  run('renderAdminMaintenance();');
  assert.match(element('admin-maintenance-list').innerHTML, /No requests match/);
});

test('user text is escaped, tenant lists are scoped, and review is admin-only', () => {
  const { run, submit, element } = createDemo();
  submit('<img src=x onerror=alert(1)>', '<script>alert(1)</script>');
  assert.match(element('maintenance-list').innerHTML, /&lt;img/);
  assert.doesNotMatch(element('maintenance-list').innerHTML, /<script>|<img/);
  element('maintenance-status').value = 'resolved';
  element('maintenance-note').value = 'Unauthorized';
  run("saveMaintenanceReview('MR-005');");
  assert.equal(run('MAINTENANCE_REQUESTS[0].status'), 'pending');
  run("MAINTENANCE_REQUESTS[0].tenant = 'Another tenant'; renderMaintenance();");
  assert.doesNotMatch(element('maintenance-list').innerHTML, /MR-005/);
});

test('page contains the form and admin controls referenced by the workflow', () => {
  const html = fs.readFileSync(path.join(__dirname, '../plazahub.html'), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  for (const id of ['maintenance-form', 'maintenance-category', 'maintenance-priority', 'maintenance-subject', 'maintenance-description', 'maintenance-summary', 'maintenance-filter', 'admin-maintenance-list', 'page-admin-maintenance']) {
    assert.equal(ids.filter(value => value === id).length, 1, `${id} must exist exactly once`);
  }
});
