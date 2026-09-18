export function getNativeCapacitorApp(capacitor = globalThis.Capacitor) {
  if (!capacitor || typeof capacitor.isNativePlatform !== 'function' || capacitor.isNativePlatform() !== true ||
      typeof capacitor.isPluginAvailable !== 'function' || capacitor.isPluginAvailable('App') !== true) {
    return null;
  }
  const existing = capacitor.Plugins?.App;
  if (existing) return existing;
  if (typeof capacitor.registerPlugin !== 'function') return null;
  return capacitor.registerPlugin('App');
}
