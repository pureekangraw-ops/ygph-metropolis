import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigationState, navigateTop, openManualHouse } from '../src/navigation-state.mjs';

const EXPECTED_WALK = [
  ['top', 'chat'],
  ['top', 'manual'],
  ['house', 'income'],
  ['top', 'manual'],
  ['house', 'outcome'],
  ['top', 'manual'],
  ['house', 'calendar'],
  ['top', 'manual'],
  ['house', 'ledger'],
  ['top', 'chat'],
  ['top', 'settings'],
];

test('whole-app route owner walks CHAT -> MANUAL four houses -> CHAT -> SETTINGS with no dead route', () => {
  let state = createNavigationState();
  const visited = [['top', state.top]];

  for (const [kind, target] of EXPECTED_WALK.slice(1)) {
    if (kind === 'top') state = navigateTop(state, target);
    else state = openManualHouse(state, target);
    visited.push(kind === 'top' ? ['top', state.top] : ['house', state.manualHouse]);
  }

  assert.deepEqual(visited, EXPECTED_WALK);
  assert.deepEqual(state, { top:'settings', manualHouse:null });
});

test('whole-app route owner never admits legacy Store Ride or Money houses', () => {
  let state = navigateTop(createNavigationState(), 'manual');
  for (const legacy of ['store', 'ride', 'money']) {
    const before = state;
    state = openManualHouse(state, legacy);
    assert.equal(state, before);
    assert.equal(state.manualHouse, null);
  }
});
