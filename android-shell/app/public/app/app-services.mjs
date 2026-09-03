const REQUIRED_SERVICES = Object.freeze([
  'session',
  'chat',
  'manual',
  'modules',
  'recovery',
  'backup',
  'updates',
  'events',
]);

export async function createAppServices(dependencies = {}) {
  const services = {};

  for (const name of REQUIRED_SERVICES) {
    const service = dependencies[name];
    if (!service) throw new Error(`MISSING_APP_SERVICE:${name}`);
    services[name] = service;
  }

  return Object.freeze(services);
}
