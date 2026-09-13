const REQUIRED_OPERATIONS = Object.freeze([
  'identify',
  'currentVersion',
  'verify',
  'stage',
  'test',
  'activate',
  'readback',
  'rollback',
]);

function assertDependencies(deps) {
  if (!deps || typeof deps !== 'object') {
    throw new TypeError('Local Patch Client missing dependencies');
  }

  for (const operation of REQUIRED_OPERATIONS) {
    if (typeof deps[operation] !== 'function') {
      throw new TypeError(`Local Patch Client missing dependency: ${operation}`);
    }
  }
}

export function createLocalPatchClient(deps) {
  assertDependencies(deps);

  return Object.freeze({
    identify: (...args) => deps.identify(...args),
    currentVersion: (...args) => deps.currentVersion(...args),
    verify: (...args) => deps.verify(...args),
    stage: (...args) => deps.stage(...args),
    test: (...args) => deps.test(...args),
    activate: (...args) => deps.activate(...args),
    readback: (...args) => deps.readback(...args),
    rollback: (...args) => deps.rollback(...args),
  });
}

export { REQUIRED_OPERATIONS };
