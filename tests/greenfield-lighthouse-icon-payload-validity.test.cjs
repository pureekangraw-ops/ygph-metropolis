const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const iconPath = path.join(root, 'lighthouse-next/assets/lighthouse-icon.svg');

function embeddedRaster(svg) {
  const match = svg.match(/href="data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)"/i);
  assert.ok(match, 'LIGHTHOUSE icon must embed one PNG or JPEG raster payload');
  const [, mime, encoded] = match;
  assert.equal(encoded.length % 4, 0, 'embedded icon base64 must be complete');
  return { mime: mime.toLowerCase(), bytes: Buffer.from(encoded, 'base64') };
}

test('owner-approved LIGHTHOUSE icon contains a complete decodable raster payload', () => {
  const svg = fs.readFileSync(iconPath, 'utf8');
  const { mime, bytes } = embeddedRaster(svg);

  assert.ok(bytes.length > 1024, 'embedded icon payload is unexpectedly small');

  if (mime === 'png') {
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(bytes.subarray(-8, -4).toString('ascii'), 'IEND');
  } else {
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
    assert.deepEqual([...bytes.subarray(-2)], [0xff, 0xd9]);
  }
});
