"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Lighthouse Ride surface exposes map as a Ride sub-surface without creating a root MAP owner', () => {
  const surface = source('lighthouse-next/surface-contract.mjs');
  assert.match(surface, /ledgerBridge\.readRideMapTruth\(\)/);
  assert.match(surface, /openRideMap\(\{ job \}\)/);
  assert.match(surface, /importRideMapPackage\(\)/);
  assert.match(surface, /แผนที่งาน/);
  assert.match(surface, /อ่านจุดรับ–ส่งจาก RIDE owner เท่านั้น/);
  assert.doesNotMatch(surface, /data-task=["']map["']/);
});

test('Ride map surface fails closed when owner geography or native package is unavailable', () => {
  const surface = source('lighthouse-next/surface-contract.mjs');
  assert.match(surface, /openMapButton\.disabled = !job\?\.hasGeography/);
  assert.match(surface, /ยังไม่มี Local map/);
  assert.match(surface, /ยังไม่มีพิกัด/);
  assert.match(surface, /nativeStatus\.packageState === 'ACTIVE'/);
});
