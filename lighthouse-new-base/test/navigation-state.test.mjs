import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNavigationState,
  navigateTop,
  openManualHouse,
} from '../src/navigation-state.mjs';

const houses = ['income', 'outcome', 'calendar', 'ledger'];

test('navigation starts at CHAT with no Manual house selected', () => {
  assert.deepEqual(createNavigationState(), { top: 'chat', manualHouse: null });
});

test('MANUAL opens its dashboard and each approved house opens directly', () => {
  let state = navigateTop(createNavigationState(), 'manual');
  assert.deepEqual(state, { top: 'manual', manualHouse: null });

  for (const house of houses) {
    state = openManualHouse(state, house);
    assert.deepEqual(state, { top: 'manual', manualHouse: house });
    state = navigateTop(state, 'manual');
    assert.deepEqual(state, { top: 'manual', manualHouse: null });
  }
});

test('CHAT and SETTINGS clear Manual house detail through the same route owner', () => {
  const calendar = openManualHouse(navigateTop(createNavigationState(), 'manual'), 'calendar');
  assert.deepEqual(navigateTop(calendar, 'chat'), { top: 'chat', manualHouse: null });
  assert.deepEqual(navigateTop(calendar, 'settings'), { top: 'settings', manualHouse: null });
});

test('unknown top routes and Manual houses fail closed without changing state', () => {
  const state = openManualHouse(navigateTop(createNavigationState(), 'manual'), 'ledger');
  assert.equal(navigateTop(state, 'store'), state);
  assert.equal(openManualHouse(state, 'ride'), state);
});
