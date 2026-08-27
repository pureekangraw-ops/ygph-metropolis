let activeRuntime = null;

function assertRuntime(runtime) {
  if (!runtime || typeof runtime.readState !== 'function' || typeof runtime.project !== 'function') {
    throw new Error('RUNTIME_SESSION_INVALID');
  }
}

export function activateRuntimeSession(runtime) {
  assertRuntime(runtime);
  activeRuntime = runtime;
  return runtime;
}

export function deactivateRuntimeSession(runtime = activeRuntime) {
  if (!activeRuntime) return false;
  if (runtime && runtime !== activeRuntime) return false;
  activeRuntime = null;
  return true;
}

export async function withRuntimeSession(operation) {
  if (typeof operation !== 'function') throw new Error('RUNTIME_SESSION_OPERATION_INVALID');
  const runtime = activeRuntime;
  if (!runtime) throw new Error('RUNTIME_SESSION_LOCKED');
  return operation(runtime);
}
