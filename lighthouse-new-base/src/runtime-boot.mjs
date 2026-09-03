export function createRuntimeBoot({ inspectUnlock, openWithPin, activateSession } = {}) {
  if (typeof inspectUnlock !== 'function' || typeof openWithPin !== 'function' || typeof activateSession !== 'function') {
    throw new Error('RUNTIME_BOOT_DEPENDENCY_REQUIRED');
  }

  async function inspect() {
    const result = await inspectUnlock();
    if (result?.status === 'ENROLLED') return { state:'locked' };
    if (result?.status === 'UNENROLLED') return { state:'setup-required' };
    if (result?.status === 'INCOMPLETE') return { state:'repair-required' };
    return { state:'repair-required' };
  }

  async function unlock(pin) {
    const current = await inspect();
    if (current.state !== 'locked') throw new Error('RUNTIME_BOOT_NOT_READY');
    const runtime = await openWithPin({ pin });
    activateSession(runtime);
    const state = await runtime.readState();
    return { state:'ready', revision:state?.revision ?? null };
  }

  return Object.freeze({ inspect, unlock });
}
