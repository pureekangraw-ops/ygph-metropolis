import {bytesToBase64Url,base64UrlToBytes,sha256Base64Url} from "./passkey-utils.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function encodeHubContext(context) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(canonical(context))));
}

export function decodeHubContext(value) {
  try {
    const bytes = base64UrlToBytes(value);
    return JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes));
  } catch {
    return null;
  }
}

export async function computeHubRequestDigest(context, args) {
  const payload = {
    name:context.name,
    issuer:context.issuer,
    audience:context.audience,
    subject:context.subject,
    issuedAt:context.issuedAt,
    expiresAt:context.expiresAt,
    browserSessionId:context.browserSessionId || null,
    grantId:context.grantId || null,
    requestId:context.requestId,
    args:canonical(args),
  };
  return sha256Base64Url(JSON.stringify(payload));
}