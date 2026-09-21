import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

function shell(...items) {
  let options = {};
  if (items.length && typeof items[items.length - 1] === 'object' && !Array.isArray(items[items.length - 1])) {
    options = items.pop();
  }
  return runAdb(['shell', ...items], options);
}

function readSetting(namespace, key) {
  return shell('settings', 'get', namespace, key).stdout.trim();
}

function restoreToggle(kind, value) {
  const enabled = value === '1' || value === 'enabled';
  shell('svc', kind, enabled ? 'enable' : 'disable', { allowFailure: true });
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function readProofLogs() {
  return runAdb(['logcat', '-d', '-s', 'LIGHTHOUSE_LOCAL_MAP:I', '*:S'], { allowFailure: true }).stdout || '';
}

function readRelevantDiagnostics() {
  const all = runAdb(['logcat', '-d'], { allowFailure: true }).stdout || '';
  return all
    .split('\n')
    .filter(line => /LIGHTHOUSE_LOCAL_MAP|com\.yggdrasil\.lighthouse|AndroidRuntime|MapLibre|libmaplibre|FATAL EXCEPTION|UnsatisfiedLinkError/i.test(line))
    .slice(-160)
    .join('\n');
}

function assertProofActivityResumed() {
  const activities = shell('dumpsys', 'activity', 'activities', { allowFailure: true }).stdout || '';
  if (!activities.includes('LocalPmtilesProofActivity')) {
    throw new Error(`LOCAL_MAP_PROOF_ACTIVITY_NOT_RESUMED:${readRelevantDiagnostics()}`);
  }
}

async function waitForMagentaPixel(screenshotPath, timeoutMs = 30000) {
  const started = Date.now();
  let lastPixel = null;
  while (Date.now() - started < timeoutMs) {
    const screenshot = runAdb(['exec-out', 'screencap', '-p'], { binary: true, allowFailure: true });
    if (screenshot.status === 0 && screenshot.stdout?.length) {
      await writeFile(screenshotPath, screenshot.stdout);
      const image = sharp(screenshotPath);
      const metadata = await image.metadata();
      if (metadata.width && metadata.height) {
        const left = Math.floor(metadata.width / 2);
        const top = Math.floor(metadata.height / 2);
        const pixel = await image.extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
        const [r, g, b] = [...pixel];
        lastPixel = { r, g, b };
        if (r >= 220 && g <= 40 && b >= 220) {
          return { pixel: lastPixel, width: metadata.width, height: metadata.height };
        }
      }
    }
    await sleep(500);
  }
  const diagnostics = readRelevantDiagnostics();
  throw new Error(`LOCAL_MAP_PROOF_PIXEL_TIMEOUT:last=${JSON.stringify(lastPixel)} logs=${diagnostics.slice(-12000)}`);
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
  const airplaneBefore = readSetting('global', 'airplane_mode_on');
  let proof;

  try {
    runAdb(['get-state']);
    shell('svc', 'wifi', 'disable');
    shell('svc', 'data', 'disable');
    const airplaneCommand = shell('cmd', 'connectivity', 'airplane-mode', 'enable', { allowFailure: true });
    await sleep(1500);

    const networkProbe = shell('ping', '-c', '1', '-W', '1', '1.1.1.1', { allowFailure: true });
    if (networkProbe.status === 0) throw new Error('LOCAL_MAP_PROOF_NETWORK_STILL_REACHABLE');

    runAdb(['logcat', '-c']);
    const component = `${applicationId}/com.yggdrasil.lighthouse.LocalPmtilesProofActivity`;
    const launch = shell('am', 'start', '-W', '-n', component, { allowFailure: true });
    const launchOutput = `${launch.stdout || ''}\n${launch.stderr || ''}`.trim();
    console.log(`LOCAL_MAP_PROOF_LAUNCH ${launchOutput.replaceAll('\n', ' | ')}`);
    if (launch.status !== 0 || /Error(?:\s+type\s+\d+)?:|Exception|Permission Denial/i.test(launchOutput)) {
      throw new Error(`LOCAL_MAP_PROOF_LAUNCH_FAILED:${launchOutput}`);
    }
    await sleep(1000);
    assertProofActivityResumed();

    const rendered = await waitForMagentaPixel(screenshotPath);
    const { r, g, b } = rendered.pixel;
    const logs = readProofLogs();
    if (logs.includes('PROOF_FAILED')) {
      throw new Error(`LOCAL_MAP_PROOF_ACTIVITY_FAILED:${logs.trim()}`);
    }

    const screenshotEvidencePath = evidencePath.replace(/\.json$/i, '.png');
    await mkdir(dirnameCompat(screenshotEvidencePath), { recursive: true });
    await copyFile(screenshotPath, screenshotEvidencePath);
    const screenshotBytes = await readFile(screenshotEvidencePath);

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
        airplaneModeCommandStatus: airplaneCommand.status,
        networkProbeStatus: networkProbe.status,
      },
      render: {
        packageStagedMarkerObserved: logs.includes('PACKAGE_STAGED'),
        sourceAttachedMarkerObserved: logs.includes('SOURCE_ATTACHED'),
        renderCompleteEventObserved: logs.includes('RENDER_COMPLETE'),
        pixelProof: true,
        centerPixel: { r, g, b },
        screenshotSize: { width: rendered.width, height: rendered.height },
        screenshotPath: screenshotEvidencePath,
        screenshotSha256: createHash('sha256').update(screenshotBytes).digest('hex'),
      },
      capturedAt: new Date().toISOString(),
    };
  } finally {
    shell('cmd', 'connectivity', 'airplane-mode', airplaneBefore === '1' ? 'enable' : 'disable', { allowFailure: true });
    restoreToggle('wifi', wifiBefore);
    restoreToggle('data', dataBefore);
  }

  await mkdir(dirnameCompat(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  await rm(work, { recursive: true, force: true });
  return proof;
}

function dirnameCompat(path) {
  const normalized = path.replaceAll('\\', '/');
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
