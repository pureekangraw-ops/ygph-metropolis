export async function handleAndroidBack({ root = globalThis.document?.querySelector?.('#demo-root'), App } = {}) {
  if (!root || !App) return 'UNAVAILABLE';

  const recovery = root.querySelector?.('#recovery-form');
  if (recovery && recovery.hidden === false) {
    root.querySelector?.('#cancel-recovery')?.click?.();
    return 'RECOVERY_LOGIN';
  }

  const dialog = root.querySelector?.('dialog[open]');
  if (dialog) {
    dialog.close?.();
    return 'CLOSE_DIALOG';
  }

  const detail = root.querySelector?.('#manual-detail');
  if (detail && detail.hidden === false) {
    root.querySelector?.('#manual-back')?.click?.();
    return 'MANUAL_HUB';
  }

  const activeRoot = root.querySelector?.('.nav-item.active')?.dataset?.rootTarget || null;
  if (activeRoot && activeRoot !== 'manual') {
    root.querySelector?.('[data-root-target="manual"]')?.click?.();
    return 'MANUAL_ROOT';
  }

  if (typeof App.minimizeApp === 'function') {
    await App.minimizeApp();
    return 'MINIMIZE';
  }
  return 'UNAVAILABLE';
}

export async function installAndroidBackHandler({
  root = globalThis.document?.querySelector?.('#demo-root'),
  capacitor = globalThis.Capacitor,
} = {}) {
  if (!root || !capacitor || typeof capacitor.isNativePlatform !== 'function' ||
      capacitor.isNativePlatform() !== true || typeof capacitor.isPluginAvailable !== 'function' ||
      capacitor.isPluginAvailable('App') !== true || typeof capacitor.registerPlugin !== 'function') {
    return false;
  }

  const App = capacitor.registerPlugin('App');
  if (!App || typeof App.addListener !== 'function') return false;

  await App.addListener('backButton', () => {
    void handleAndroidBack({ root, App });
  });
  return true;
}

if (typeof document !== 'undefined') {
  void installAndroidBackHandler();
}
