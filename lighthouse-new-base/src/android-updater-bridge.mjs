function updaterPlugin() {
  const plugin = globalThis?.Capacitor?.Plugins?.LighthouseUpdater;
  if (!plugin) throw new Error('ANDROID_UPDATER_PLUGIN_UNAVAILABLE');
  return plugin;
}

async function fetchJson(url) {
  const response = await fetch(url, { method:'GET', cache:'no-store', redirect:'follow' });
  if (!response.ok) throw new Error(`UPDATE_MANIFEST_HTTP_${response.status}`);
  return response.json();
}

export function createAndroidUpdaterBridge() {
  return Object.freeze({
    fetchManifest:url => fetchJson(url),
    getInstalledIdentity:() => updaterPlugin().getInstalledIdentity(),
    enqueueDownload:input => updaterPlugin().enqueueDownload(input),
    readDownloadState:() => updaterPlugin().readDownloadState(),
    retryDownload:() => updaterPlugin().retryDownload(),
    verifyDownloadedApk:input => updaterPlugin().verifyDownloadedApk(input),
    canInstallPackages:() => updaterPlugin().canInstallPackages(),
    requestInstallPermission:() => updaterPlugin().requestInstallPermission(),
    installDownloadedApk:() => updaterPlugin().installDownloadedApk(),
    reconcileInstalledVersion:() => updaterPlugin().reconcileInstalledVersion(),
    cancelUpdate:input => updaterPlugin().cancelUpdate(input),
  });
}
