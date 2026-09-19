export async function installControlPortBackgroundSync({
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  nativeApp = null,
  canSync = () => true,
  ensureLive,
  reconcile,
} = {}) {
  if (!windowTarget?.addEventListener || !documentTarget?.addEventListener ||
      typeof canSync !== 'function' || typeof ensureLive !== 'function' || typeof reconcile !== 'function') {
    throw new Error('LIGHTHOUSE_BACKGROUND_SYNC_DEPENDENCY_REQUIRED');
  }

  const wake = () => {
    if (!canSync()) return;
    void ensureLive({ force:true });
    void reconcile({ force:true });
  };
  const flush = () => {
    if (!canSync()) return;
    void reconcile({ force:true });
  };

  documentTarget.addEventListener('visibilitychange', () => {
    if (documentTarget.visibilityState === 'visible') wake();
    else flush();
  });
  windowTarget.addEventListener('focus', wake);
  windowTarget.addEventListener('online', wake);

  if (nativeApp && typeof nativeApp.addListener === 'function') {
    await nativeApp.addListener('appStateChange', state => {
      if (state?.isActive === true) wake();
      else flush();
    });
  }

  return Object.freeze({ status:'INSTALLED' });
}
