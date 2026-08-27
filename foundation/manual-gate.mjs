export function createManualGate(areas) {
  if (!Array.isArray(areas) || areas.length === 0) throw new Error('MANUAL_GATE_AREAS_REQUIRED');
  const registry = new Map();
  for (const area of areas) {
    const id = String(area?.id || '').trim().toUpperCase();
    if (!id || registry.has(id)) throw new Error(`MANUAL_GATE_INVALID_AREA:${id || 'EMPTY'}`);
    registry.set(id, Object.freeze({ ...area, id }));
  }
  return Object.freeze({
    list:() => Object.freeze([...registry.values()]),
    route(appLanguage) {
      const target = String(appLanguage?.target || '').trim().toUpperCase();
      const area = registry.get(target);
      if (!area) throw new Error(`MANUAL_GATE_DESTINATION_NOT_FOUND:${target || 'EMPTY'}`);
      return area;
    },
  });
}
