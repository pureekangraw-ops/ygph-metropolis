function nativeCapacitor(capacitor) {
  if (!capacitor || typeof capacitor !== 'object') return null;
  if (typeof capacitor.isNativePlatform === 'function' && !capacitor.isNativePlatform()) return null;
  return capacitor;
}

export function resolveRideMapPlugin(capacitor = globalThis.Capacitor) {
  const native = nativeCapacitor(capacitor);
  if (!native) return null;
  const existing = native.Plugins?.LighthouseRideMap;
  if (existing) return existing;
  if (typeof native.isPluginAvailable === 'function' && !native.isPluginAvailable('LighthouseRideMap')) return null;
  if (typeof native.registerPlugin !== 'function') return null;
  return native.registerPlugin('LighthouseRideMap');
}

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const output = { lat, lng };
  const label = String(value.label || '').trim();
  const address = String(value.address || '').trim();
  if (label) output.label = label;
  if (address) output.address = address;
  return output;
}

export async function readRideMapNativeStatus({ capacitor = globalThis.Capacitor } = {}) {
  const plugin = resolveRideMapPlugin(capacitor);
  if (!plugin || typeof plugin.getPackageStatus !== 'function') {
    return Object.freeze({ available:false, packageState:'UNAVAILABLE' });
  }
  const result = await plugin.getPackageStatus();
  return Object.freeze({
    available:true,
    packageState:String(result?.packageState || 'UNKNOWN'),
    packageVersion:result?.packageVersion ? String(result.packageVersion) : null,
    region:result?.region ? String(result.region) : null,
    fileName:result?.fileName ? String(result.fileName) : null,
  });
}

export async function openRideMap({ job, capacitor = globalThis.Capacitor } = {}) {
  const plugin = resolveRideMapPlugin(capacitor);
  if (!plugin || typeof plugin.openMap !== 'function') throw new Error('LIGHTHOUSE_RIDE_MAP_NATIVE_UNAVAILABLE');
  const pickup = point(job?.pickup);
  const dropoff = point(job?.dropoff);
  return plugin.openMap({
    jobId:String(job?.recordId || ''),
    pickup,
    dropoff,
  });
}

export async function importRideMapPackage({ capacitor = globalThis.Capacitor } = {}) {
  const plugin = resolveRideMapPlugin(capacitor);
  if (!plugin || typeof plugin.importPackage !== 'function') throw new Error('LIGHTHOUSE_RIDE_MAP_NATIVE_UNAVAILABLE');
  return plugin.importPackage();
}


export async function openRideNavigation({ destination, capacitor = globalThis.Capacitor } = {}) {
  const plugin = resolveRideMapPlugin(capacitor);
  if (!plugin || typeof plugin.navigate !== 'function') throw new Error('LIGHTHOUSE_RIDE_MAP_NATIVE_UNAVAILABLE');
  const pointValue = point(destination);
  if (!pointValue) throw new Error('LIGHTHOUSE_RIDE_MAP_GEOGRAPHY_REQUIRED');
  return plugin.navigate({ destination:pointValue });
}
