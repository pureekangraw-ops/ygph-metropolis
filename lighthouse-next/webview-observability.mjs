const WEBVIEW_EVIDENCE_SCHEMA = 'lighthouse-webview-evidence-v1';

function text(value) {
  const output = String(value ?? '').trim();
  return output || null;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function iso(value) {
  if (value == null || value === '') return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

function sanitizeFocus(control) {
  if (!control || typeof control !== 'object') return null;
  const tagName = text(control.tagName)?.toLowerCase();
  if (!tagName || !['input', 'textarea', 'button', 'select'].includes(tagName)) return null;
  const type = text(control.type)?.toLowerCase();
  const rootTarget = text(control.dataset?.rootTarget);
  return {
    tagName,
    type: type && ['button', 'checkbox', 'email', 'number', 'password', 'submit', 'text', 'url'].includes(type) ? type : null,
    controlId: text(control.id),
    rootTarget,
  };
}

function sanitizeMap(mapEvidence) {
  const source = mapEvidence?.evidence || mapEvidence;
  if (!source || typeof source !== 'object') return null;
  const packageSource = source.package && typeof source.package === 'object' ? source.package : {};
  const point = (value) => {
    if (!value || typeof value !== 'object') return null;
    const safe = { label:text(value.label), address:text(value.address) };
    return Object.values(safe).some(Boolean) ? safe : null;
  };
  return {
    schemaVersion: text(source.schemaVersion) || 'lighthouse-map-evidence-v1',
    status: text(source.status) || 'UNKNOWN',
    mapAvailable: source.mapAvailable === true,
    jobId: text(source.jobId),
    package: {
      state: text(packageSource.state) || 'UNKNOWN',
      version: text(packageSource.version),
      sha256: text(packageSource.sha256),
      byteLength: Number.isSafeInteger(Number(packageSource.byteLength)) ? Number(packageSource.byteLength) : null,
      region: text(packageSource.region),
    },
    lastOpenedAt: iso(source.lastOpenedAt),
    pickup: point(source.pickup),
    dropoff: point(source.dropoff),
    coordinatesShared: false,
  };
}

export function createLighthouseWebViewEvidence({
  root = null,
  appShell = null,
  bottomNav = null,
  activeRoot = 'UNKNOWN',
  keyboardOpen = false,
  focusedControl = null,
  mapEvidence = null,
  nativeBridgeState = 'UNKNOWN',
  viewport = null,
  now = () => new Date().toISOString(),
} = {}) {
  const view = viewport || globalThis.window || globalThis;
  const width = finite(view?.innerWidth);
  const height = finite(view?.innerHeight);
  const visualWidth = finite(view?.visualViewport?.width);
  const visualHeight = finite(view?.visualViewport?.height);
  const ownerVisible = Boolean(appShell && appShell.hidden !== true);
  return freeze({
    schemaVersion: WEBVIEW_EVIDENCE_SCHEMA,
    capturedAt: iso(now()) || new Date().toISOString(),
    route: text(activeRoot) || 'UNKNOWN',
    surface: text(root?.querySelector?.('.app-page.active')?.dataset?.root) || text(activeRoot) || 'UNKNOWN',
    viewport: { width, height, visualWidth, visualHeight },
    scroll: {
      owner: ownerVisible ? 'app-shell' : 'auth-screen',
      top: ownerVisible ? finite(appShell?.scrollTop) : null,
      height: ownerVisible ? finite(appShell?.scrollHeight) : null,
      clientHeight: ownerVisible ? finite(appShell?.clientHeight) : null,
      bodyScrollDisabled: true,
    },
    keyboardOpen: keyboardOpen === true,
    bottomNav: {
      visible: ownerVisible && bottomNav?.hidden !== true && bottomNav?.offsetParent !== null,
      activeRoot: text(activeRoot) || 'UNKNOWN',
    },
    focusedControl: sanitizeFocus(focusedControl),
    map: sanitizeMap(mapEvidence),
    nativeBridge: { state: text(nativeBridgeState) || 'UNKNOWN' },
  });
}

export { WEBVIEW_EVIDENCE_SCHEMA };
