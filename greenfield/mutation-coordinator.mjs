export const GREENFIELD_WRITE_LOCK = 'ygph-metropolis-greenfield-write';

export function createMutationCoordinator({ lockManager = globalThis.navigator?.locks ?? null } = {}) {
  const hasWebLocks = Boolean(lockManager && typeof lockManager.request === 'function');
  let localTail = Promise.resolve();

  function localRun(task) {
    const run = localTail.then(task, task);
    localTail = run.catch(() => undefined);
    return run;
  }

  function run(task) {
    if (typeof task !== 'function') throw new TypeError('INVALID_MUTATION_TASK');
    if (hasWebLocks) return lockManager.request(GREENFIELD_WRITE_LOCK, { mode: 'exclusive' }, task);
    return localRun(task);
  }

  function status() {
    return hasWebLocks
      ? { mode: 'WEB_LOCKS', crossContextSafety: 'LOCKED' }
      : { mode: 'LOCAL_QUEUE', crossContextSafety: 'LIMITED' };
  }

  return Object.freeze({ run, status });
}
