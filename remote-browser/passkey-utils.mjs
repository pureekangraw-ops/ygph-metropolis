export const PASSKEY_FLOW_COOKIE = "observatory_passkey_flow";
export const PASSKEY_SESSION_COOKIE = "observatory_owner_session";
export const PASSKEY_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const PASSKEY_FLOW_TTL_MS = 2 * 60 * 1000;

export function randomBase64Url(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return bytesToBase64Url(bytes);
}

export function bytesToBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function base64UrlToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/u.test(value)) {
    throw new Error("INVALID_BASE64URL");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function makeSecureCookie(name, value, maxAge, path = "/") {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSecureCookie(name, path = "/") {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function hasSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(request.url);
    return url.protocol === "https:" && origin === url.origin;
  } catch {
    return false;
  }
}

export function validFlowId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);
}