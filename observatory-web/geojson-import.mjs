/** Parse a bounded GeoJSON FeatureCollection of 2D Point features for the local web map. */
export async function parseGeoJSONImport(text) {
  const MAX_FILE_BYTES = 1_048_576;
  const MAX_FEATURES = 500;
  const MAX_PROPERTIES_BYTES = 8_192;
  const MAX_PROPERTY_DEPTH = 8;
  const MAX_ID_LENGTH = 128;

  function safeJsonValue(value, depth = 0) {
    if (depth > MAX_PROPERTY_DEPTH) throw new Error("properties nesting exceeds 8 levels");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > 2_048) throw new Error("property string exceeds 2048 characters");
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("property number must be finite");
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > 100) throw new Error("property array exceeds 100 items");
      return value.map(item => safeJsonValue(item, depth + 1));
    }
    if (!value || typeof value !== "object") throw new Error("properties must contain JSON values only");
    const keys = Object.keys(value);
    if (keys.length > 100) throw new Error("property object exceeds 100 fields");
    const copy = Object.create(null);
    for (const key of keys) {
      if (!key || key.length > 128 || ["__proto__", "prototype", "constructor"].includes(key)) {
        throw new Error("unsafe property key");
      }
      copy[key] = safeJsonValue(value[key], depth + 1);
    }
    return copy;
  }

  async function fallbackId(feature) {
    const bytes = new TextEncoder().encode(JSON.stringify(feature));
    if (!globalThis.crypto?.subtle) throw new Error("secure fingerprinting is unavailable");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    return "geojson:sha256:" + hex;
  }

  if (typeof text !== "string") throw new Error("file text is required");
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) throw new Error("file exceeds 1 MiB");
  let document;
  try { document = JSON.parse(text); }
  catch { throw new Error("invalid JSON"); }
  if (!document || document.type !== "FeatureCollection" || !Array.isArray(document.features)) {
    throw new Error("expected a GeoJSON FeatureCollection");
  }
  if (document.features.length > MAX_FEATURES) throw new Error("file exceeds 500 features");

  const pins = [];
  const seen = new Set();
  for (let index = 0; index < document.features.length; index++) {
    const feature = document.features[index];
    if (!feature || feature.type !== "Feature" || !feature.geometry || feature.geometry.type !== "Point") {
      throw new Error("feature " + (index + 1) + " must be a Point");
    }
    const coordinates = feature.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2 ||
        !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) ||
        coordinates[0] < -180 || coordinates[0] > 180 || coordinates[1] < -90 || coordinates[1] > 90) {
      throw new Error("feature " + (index + 1) + " must have valid 2D WGS84 coordinates");
    }
    const sourceProperties = feature.properties == null ? Object.create(null) : feature.properties;
    if (!sourceProperties || typeof sourceProperties !== "object" || Array.isArray(sourceProperties)) {
      throw new Error("feature " + (index + 1) + " properties must be an object or null");
    }
    const properties = safeJsonValue(sourceProperties);
    if (new TextEncoder().encode(JSON.stringify(properties)).byteLength > MAX_PROPERTIES_BYTES) {
      throw new Error("feature " + (index + 1) + " properties exceed 8 KiB");
    }
    const candidateName = [properties.name, properties.title, properties.label]
      .find(value => typeof value === "string" && value.trim().length > 0);
    const name = (candidateName || "จุด " + (index + 1)).trim();
    if (name.length > 140) throw new Error("feature " + (index + 1) + " name exceeds 140 characters");

    let id;
    if (feature.id === undefined) id = await fallbackId(feature);
    else if ((typeof feature.id === "string" && feature.id.length > 0 && feature.id.length <= 110) ||
             (typeof feature.id === "number" && Number.isFinite(feature.id))) {
      const sourceId = String(feature.id);
      // Preserve IDs emitted by this app so export → import remains idempotent.
      id = sourceId.startsWith("geojson:") ? sourceId : "geojson:" + sourceId;
    } else throw new Error("feature " + (index + 1) + " has an invalid id");
    if (id.length > MAX_ID_LENGTH) throw new Error("feature " + (index + 1) + " id exceeds " + MAX_ID_LENGTH + " characters");
    if (seen.has(id)) throw new Error("duplicate feature id: " + id);
    seen.add(id);
    pins.push({ id, name, lat: coordinates[1], lng: coordinates[0], properties });
  }
  return { pins, featureCount: pins.length };
}

/** Plan an additive import: exact duplicates are skipped; conflicts and overflow fail closed. */
export function planGeoJSONMerge(existingPins, incomingPins, maxPins = 500) {
  function stableJson(value) {
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
    }
    return JSON.stringify(value);
  }
  const existing = new Map(existingPins.map(pin => [pin.id, pin]));
  const additions = [];
  let duplicates = 0, conflicts = 0;
  for (const pin of incomingPins) {
    const prior = existing.get(pin.id);
    if (!prior) { additions.push(pin); existing.set(pin.id, pin); continue; }
    const same = prior.name === pin.name && prior.lat === pin.lat && prior.lng === pin.lng &&
      stableJson(prior.properties || {}) === stableJson(pin.properties || {});
    if (same) duplicates++;
    else conflicts++;
  }
  const overflow = Math.max(0, existingPins.length + additions.length - maxPins);
  const canApply = conflicts === 0 && overflow === 0 && additions.length > 0;
  return { pinsToAdd: canApply ? additions : [], duplicates, conflicts, overflow, canApply };
}

/** Serialize local map pins without changing their identity or source properties. */
export function pinsToGeoJSONFeatureCollection(pins) {
  if (!Array.isArray(pins)) throw new Error("pins must be an array");
  return {
    type: "FeatureCollection",
    features: pins.map(pin => {
      const properties = { ...(pin.properties || {}) };
      const hasDisplayName = ["name", "title", "label"].some(key =>
        typeof properties[key] === "string" && properties[key].trim().length > 0
      );
      if (!hasDisplayName) properties.name = pin.name;
      return {
        type: "Feature",
        id: pin.id,
        properties,
        geometry: { type: "Point", coordinates: [pin.lng, pin.lat] }
      };
    })
  };
}
