import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';

test('creates LIGHTHOUSE from the new-base surface', () => {
  const app = createApp();
  assert.equal(app.id, 'lighthouse');
  assert.equal(app.surface, 'new-base');
  assert.deepEqual(app.shell, {
    home: 'chat',
    sections: ['chat', 'manual', 'settings'],
  });
});
