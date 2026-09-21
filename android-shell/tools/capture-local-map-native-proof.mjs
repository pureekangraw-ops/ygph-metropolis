import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createLocalMapProofFixture } from './create-local-map-proof-fixture.mjs';

function runAdb(args, { allowFailure = false, binary = false } = {}) {
  const result = spawnSync('adb', args, {
    encoding: binary ? null : 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    const stderr = binary ? String(result.stderr || '') : result.stderr;
    throw new Error(`LOCAL_MAP_PROOF_ADB_FAILED:${args.join(' ')}:${stderr || result.status}`);
  }
  return result;
}

function shell(...args) {
  return runAdb(['shell', ...args]);
}

function readSetting(namespace, key) {
  return shell('settings', 'get', namespace, key).stdout.trim();
}

function restoreToggle(kind, value) {
  const enabled = value === '1' || value === 'enabled';
  shell('svc', kind, enabled ? 'enable' : 'disable');
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForRenderMarker(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const logs = runAdb(['logcat', '-d', '-s', 'LIGHTHOUSE_LOCAL_MAP:I', '*:S'], { allowFailure: true }).stdout || '';
    if (logs.includes('PROOF_FAILED')) throw new Error(`LOCAL_MAP_PROOF_ACTIVITY_FAILED:${logs.trim()}`);
    if (logs.includes('SOURCE_ATTACHED') && logs.includes('RENDER_COMPLETE')) return logs;
    await sleep(750);
  }
  throw new Error('LOCAL_MAP_PROOF_RENDER_TIMEOUT');
}

export async function captureLocalMapNativeProof({
  applicationId = 'com.yggdrasil.lighthouse',
  evidencePath = 'release/local-map-native-proof.json',
} = {}) {
  const work = await mkdtemp(join(tmpdir(), 'lighthouse-local-map-proof-'));
  const fixturePath = join(work, 'gate1-proof.pmtiles');
  const screenshotPath = join(work, 'gate1-proof.png');
  const fixture = await createLocalMapProofFixture(fixturePath);

  const wifiBefore = readSetting('global', 'wifi_on');
  const dataBefore = readSetting('global', 'mobile_data');
  let proof;

  try {
    runAdb(['get-state']);
    runAdb(['push', fixturePath, '/data/local/tmp/lighthouse-gate1-proof.pmtiles']);

    const runAs = shell('run-as', applicationId, 'sh', '-c', 'mkdir -p files/maps && cp /data/local/tmp/lighthouse-gate1-proof.pmtiles files/maps/gate1-proof.pmtiles', { allowFailure: true });
    if (runAs.status !== 0) {
      throw new Error('LOCAL_MAP_PROOF_REQUIRES_DEBUGGABLE_APP');
    }

    shell('svc', 'wifi', 'disable');
    shell('svc', 'data', 'disable');
    await sleep(1500);

    const networkProbe = shell('ping', '-c', '1', '-W', '1', '1.1.1.1', { allowFailure: true });
    if (networkProbe.status === 0) throw new Error('LOCAL_MAP_PROOF_NETWORK_STILL_REACHABLE');

    runAdb(['logcat', '-c']);
    const component = `${applicationId}/com.yggdrasil.lighthouse.LocalPmtilesProofActivity`;
    const launch = shell('run-as', applicationId, 'am', 'start', '-n', component, { allowFailure: true });
    if (launch.status !== 0) throw new Error(`LOCAL_MAP_PROOF_LAUNCH_FAILED:${launch.stderr || launch.stdout}`);

    const logs = await waitForRenderMarker();
    const screenshot = runAdb(['exec-out', 'screencap', '-p'], { binary: true });
    if (screenshot.status !== 0 || !screenshot.stdout?.length) throw new Error('LOCAL_MAP_PROOF_SCREENSHOT_FAILED');
    await writeFile(screenshotPath, screenshot.stdout);

    const image = sharp(screenshotPath);
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error('LOCAL_MAP_PROOF_SCREENSHOT_DIMENSIONS_MISSING');
    const left = Math.floor(metadata.width / 2);
    const top = Math.floor(metadata.height / 2);
    const pixel = await image.extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    const [r, g, b] = [...pixel];
    const magenta = r >= 220 && g <= 40 && b >= 220;
    if (!magenta) throw new Error(`LOCAL_MAP_PROOF_PIXEL_MISMATCH:${r},${g},${b}`);

    proof = {
      status: 'PASS',
      applicationId,
      fixture: {
        byteLength: fixture.byteLength,
        sha256: fixture.sha256,
        expectedPixel: fixture.expectedPixel,
      },
      offline: {
        wifiDisabled: true,
        mobileDataDisabled: true,
        networkProbeStatus: networkProbe.status,
      },
      render: {
        sourceAttached: logs.includes('SOURCE_ATTACHED'),
        renderComplete: logs.includes('RENDER_COMPLETE'),
        centerPixel: { r, g, b },
      },
      capturedAt: new Date().toISOString(),
    };
  } finally {
    restoreToggle('wifi', wifiBefore);
    restoreToggle('data', dataBefore);
    shell('rm', '-f', '/data/local/tmp/lighthouse-gate1-proof.pmtiles', { allowFailure: true });
  }

  await mkdir(dirnameCompat(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  await rm(work, { recursive: true, force: true });
  return proof;
}

function dirnameCompat(path) {
  const normalized = path.replaceAll('\\\\', '/');
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '.';
}

async function main() {
  const applicationId = process.argv[2] || 'com.yggdrasil.lighthouse';
  const evidencePath = process.argv[3] || 'release/local-map-native-proof.json';
  console.log(JSON.stringify(await captureLocalMapNativeProof({ applicationId, evidencePath })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
