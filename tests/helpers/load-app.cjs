const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

// Load real ES modules in a fresh browser-like context for each workflow test.
// No source concatenation or import stripping: missing imports fail the test.
async function loadApp(context) {
  if (!vm.SourceTextModule) throw new Error('Run tests with npm test (it enables Node VM modules).');
  const modules = new Map();
  const getModule = filename => {
    const absolute = path.resolve(filename);
    if (!modules.has(absolute)) modules.set(absolute, new vm.SourceTextModule(fs.readFileSync(absolute, 'utf8'), {
      context,
      identifier:absolute,
      initializeImportMeta(meta) { meta.url = pathToFileURL(absolute).href; },
    }));
    return modules.get(absolute);
  };
  const app = getModule(path.join(__dirname, '../../js/app.js'));
  await app.link((specifier, parent) => getModule(path.resolve(path.dirname(parent.identifier), specifier)));
  await app.evaluate();
  const { repository, session, ui, actions } = app.namespace;
  Object.assign(context, actions, { repository, session });
  // Legacy fixture aliases are test-only; production screens use repository queries.
  Object.assign(context, {
    TENANTS:repository.listTenants(), UNITS:repository.listUnits(), PAYMENTS:repository.listPayments(),
    PLAZAS:repository.listPlazas(), PLANS:repository.getPlans(), SUB_PAYMENTS:repository.listSubscriptionPayments(),
    MAINTENANCE_REQUESTS:repository.listMaintenanceRequests(),
  });
  for (const key of ['showToast', 'openModal', 'closeModalDirect']) Object.defineProperty(context, key, {
    configurable:true, get:() => ui[key], set:value => { ui[key] = value; },
  });
  return app.namespace;
}

module.exports = { loadApp };
