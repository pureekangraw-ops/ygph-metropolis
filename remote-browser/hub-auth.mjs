const JWKS_TTL_MS = 5 * 60 * 1000;
const jwksCache = new Map();
const encoder = new TextEncoder();

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("INVALID_JWT_ENCODING");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(decodeBase64Url(value)));
}

function configuredIssuer(env) {
  const domain = String(env?.CF_ACCESS_TEAM_DOMAIN || "").trim().toLowerCase();
  const audience = String(env?.CF_ACCESS_AUD || "").trim();
  if (!/^[a-z0-9.-]+\.cloudflareaccess\.com$/u.test(domain) || !audience) return null;
  return {issuer:`https://${domain}`, audience};
}

async function loadJwks(issuer, fetcher) {
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const url = `${issuer}/cdn-cgi/access/certs`;
  const response = await fetcher(url, {headers:{accept:"application/json"}});
  if (!response?.ok) throw new Error("JWKS_UNAVAILABLE");
  const data = await response.json();
  if (!Array.isArray(data?.keys)) throw new Error("JWKS_INVALID");
  const keys = data.keys.filter(key => key?.kty === "RSA" &&
    key?.use === "sig" && key?.alg === "RS256" &&
    typeof key.kid === "string" && typeof key.n === "string" &&
    typeof key.e === "string");
  if (!keys.length) throw new Error("JWKS_NO_SIGNING_KEYS");
  jwksCache.set(issuer, {keys, expiresAt:Date.now() + JWKS_TTL_MS});
  return keys;
}

/**
 * Verify the original Cloudflare Access JWT forwarded by Hub.
 * No identity claims are accepted outside the signed token.
 */
export async function verifyHubAccessAssertion(token, env, fetcher=fetch, nowMs=Date.now()) {
  const configured = configuredIssuer(env);
  if (!configured || typeof token !== "string" || token.length > 16384) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeJsonPart(parts[0]);
    const claims = decodeJsonPart(parts[1]);
    if (header?.alg !== "RS256" || typeof header.kid !== "string" ||
        header.kid.length > 128 || (header.typ !== undefined && header.typ !== "JWT")) return null;

    const now = Math.floor(nowMs / 1000);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== configured.issuer ||
        !aud.includes(configured.audience) ||
        typeof claims.sub !== "string" || !claims.sub.trim() ||
        claims.sub.length > 255 ||
        !Number.isSafeInteger(claims.exp) ||
        !Number.isSafeInteger(claims.iat) ||
        claims.exp <= now || claims.iat > now + 60 ||
        (claims.nbf !== undefined &&
          (!Number.isSafeInteger(claims.nbf) || claims.nbf > now + 60))) return null;

    const jwks = await loadJwks(configured.issuer, fetcher);
    const jwk = jwks.find(key => key.kid === header.kid);
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey(
      "jwk", jwk, {name:"RSASSA-PKCS1-v1_5", hash:"SHA-256"}, false, ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;
    return {
      issuer:configured.issuer,
      audience:configured.audience,
      subject:claims.sub,
      issuedAt:claims.iat,
      expiresAt:claims.exp,
    };
  } catch {
    return null;
  }
}

export function clearHubAccessJwksCache() {
  jwksCache.clear();
}