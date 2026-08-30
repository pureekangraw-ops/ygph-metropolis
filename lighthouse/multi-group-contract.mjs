const CONFIRMATIONS = new Set(['NOT_REQUIRED', 'CONFIRMED', 'REQUIRED']);

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function cloneObject(value, code) {
  if (!plainObject(value)) throw new Error(code);
  return structuredClone(value);
}

export function validateMultiGroupPlan(input) {
  if (!plainObject(input)) throw new Error('MULTI_GROUP_INVALID_PLAN');
  if (input.version !== '1') throw new Error('MULTI_GROUP_UNSUPPORTED_VERSION');
  const planId = requiredText(input.planId, 'MULTI_GROUP_PLAN_ID_REQUIRED');
  if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0) throw new Error('MULTI_GROUP_INVALID_BASE_REVISION');
  if (!Array.isArray(input.groups) || input.groups.length === 0) throw new Error('MULTI_GROUP_GROUPS_REQUIRED');

  const seen = new Set();
  const groups = input.groups.map(group => {
    if (!plainObject(group)) throw new Error('MULTI_GROUP_INVALID_GROUP');
    const groupId = requiredText(group.groupId, 'MULTI_GROUP_GROUP_ID_REQUIRED');
    if (seen.has(groupId)) throw new Error(`MULTI_GROUP_DUPLICATE_GROUP_ID:${groupId}`);
    seen.add(groupId);
    const action = requiredText(group.action, 'MULTI_GROUP_ACTION_REQUIRED').toUpperCase();
    const object = requiredText(group.object, 'MULTI_GROUP_OBJECT_REQUIRED').toUpperCase();
    const fields = cloneObject(group.fields ?? {}, 'MULTI_GROUP_INVALID_FIELDS');
    const references = cloneObject(group.references ?? {}, 'MULTI_GROUP_INVALID_REFERENCES');
    if (!Array.isArray(group.dependsOn)) throw new Error(`MULTI_GROUP_INVALID_DEPENDS_ON:${groupId}`);
    const dependsOn = group.dependsOn.map(value => requiredText(value, `MULTI_GROUP_INVALID_DEPENDENCY:${groupId}`));
    if (new Set(dependsOn).size !== dependsOn.length) throw new Error(`MULTI_GROUP_DUPLICATE_DEPENDENCY:${groupId}`);
    const requiredResult = cloneObject(group.requiredResult, `MULTI_GROUP_REQUIRED_RESULT_REQUIRED:${groupId}`);
    const confirmation = requiredText(group.confirmation, `MULTI_GROUP_CONFIRMATION_REQUIRED:${groupId}`).toUpperCase();
    if (!CONFIRMATIONS.has(confirmation)) throw new Error(`MULTI_GROUP_INVALID_CONFIRMATION:${groupId}`);
    return { groupId, action, object, fields, references, dependsOn, requiredResult, confirmation };
  });

  return deepFreeze({ version:'1', planId, baseRevision:input.baseRevision, groups });
}

export const MULTI_GROUP_CONFIRMATIONS = Object.freeze([...CONFIRMATIONS]);
