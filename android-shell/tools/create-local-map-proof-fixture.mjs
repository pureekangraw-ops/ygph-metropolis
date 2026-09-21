import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

function varint(value) {
  const out = [];
  let n = value;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>= 7;
  }
  out.push(n);
  return Buffer.from(out);
}

function u64(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

function i32(value) {
  const out = Buffer.alloc(4);
  out.writeInt32LE(value);
  return out;
}

export async function createLocalMapProofFixture(outputPath) {
  const png = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 255, g: 0, b: 255, alpha: 1 },
    },
  }).png().toBuffer();

  const directory = Buffer.concat([
    varint(1),
    varint(0),
    varint(1),
    varint(png.length),
    varint(1),
  ]);
  const metadata = Buffer.from('{}', 'utf8');

  const rootOffset = 127;
  const metadataOffset = rootOffset + directory.length;
  const tileOffset = metadataOffset + metadata.length;

  const header = Buffer.concat([
    Buffer.from('PMTiles', 'ascii'),
    Buffer.from([3]),
    u64(rootOffset),
    u64(directory.length),
    u64(metadataOffset),
    u64(metadata.length),
    u64(tileOffset),
    u64(0),
    u64(tileOffset),
    u64(png.length),
    u64(1),
    u64(1),
    u64(1),
    Buffer.from([1]),
    Buffer.from([1]),
    Buffer.from([1]),
    Buffer.from([2]),
    Buffer.from([0]),
    Buffer.from([0]),
    i32(-1800000000),
    i32(-850000000),
    i32(1800000000),
    i32(850000000),
    Buffer.from([0]),
    i32(0),
    i32(0),
  ]);

  if (header.length !== 127) throw new Error(`LOCAL_MAP_PROOF_HEADER_LENGTH:${header.length}`);
  const archive = Buffer.concat([header, directory, metadata, png]);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, archive);
  return {
    outputPath,
    byteLength: archive.length,
    sha256: createHash('sha256').update(archive).digest('hex'),
    expectedPixel: { r: 255, g: 0, b: 255 },
  };
}

async function main() {
  const outputPath = process.argv[2] || 'release/gate1-proof.pmtiles';
  console.log(JSON.stringify(await createLocalMapProofFixture(outputPath)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
