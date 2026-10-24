// Pure request policy used by the remote worker and local tests.
const DENIED_HOSTS = /(^localhost$|\.localhost$|\.local$|\.internal$|\.test$|\.invalid$|\.example$|\.onion$)/i;
const PRIVATE_IPV4 = /^(?:127|10|0|169\.254|192\.168|172\.(?:1[6-9]|2[0-9]|3[01]))\./;
export function validPageUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || DENIED_HOSTS.test(url.hostname)) return null;
    if (PRIVATE_IPV4.test(url.hostname) || url.hostname.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}
export function mayGoAct(url, hosts) {
  const normalized = validPageUrl(url);
  if (!normalized) return false;
  const host = new URL(normalized).hostname.toLowerCase();
  return String(hosts || "").split(",").map(s => s.trim().toLowerCase()).some(allowed =>
    allowed && (host === allowed || (allowed.startsWith("*.") && host.endsWith(allowed.slice(1)) && host !== allowed.slice(2))));
}
export function allowedAction(action) {
  if (!action || typeof action !== "object") return false;
  const operation = action.type;
  if (!["navigate", "back", "forward", "reload", "scroll", "click", "type"].includes(operation)) return false;
  if (operation === "navigate") return !!validPageUrl(action.url);
  if (["click", "type"].includes(operation)) {
    if (typeof action.selector !== "string" || action.selector.length > 150 || !/^[a-zA-Z0-9_#.\[\]="':*()\- >+~,]+$/.test(action.selector)) return false;
    if (/password|submit|delete|remove|purchase|pay|confirm|checkout|token|otp|secret|transfer|withdraw/i.test(action.selector)) return false;
  }
  if (operation === "type" && (typeof action.value !== "string" || action.value.length > 500)) return false;
  if (operation === "scroll" && (!Number.isFinite(action.y) || Math.abs(action.y) > 1800)) return false;
  return true;
}
export function cleanStep(step) {
  if (!allowedAction(step)) throw new Error("ACTION_NOT_ALLOWED");
  return { type:step.type, url:step.url, selector:step.selector, value:step.value, y:step.y };
}
