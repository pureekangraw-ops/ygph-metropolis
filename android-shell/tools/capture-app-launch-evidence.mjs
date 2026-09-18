import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

function defaultRunner(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { stdio:['ignore','pipe','pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolveRun({ status:null, stdout, stderr:String(error?.message ?? error) }));
    child.on('close', code => resolveRun({ status:code, stdout, stderr }));
  });
}

function assertRun(result, command) {
  if (!result || result.status !== 0) {
    const detail = String(result?.stderr || result?.stdout || '').trim();
    throw new Error(`ADB_LAUNCH_TOOL_FAILED:${command}:${detail}`);
  }
  return result;
}

export function parseResolvedActivity(output, applicationId) {
  const appId = String(applicationId || '').trim();
  const lines = String(output ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const component = lines.find(line => line.includes('/') && line.startsWith(appId));
  if (!component) throw new Error('ADB_LAUNCH_ACTIVITY_MISSING');
  return component;
}

export function parseAmStartWait(output) {
  const text = String(output ?? '');
  const status = text.match(/^Status:\s*(\S+)/mi)?.[1]?.toLowerCase() || null;
  const activity = text.match(/^Activity:\s*(\S+)/mi)?.[1] || null;
  const totalTime = Number(text.match(/^TotalTime:\s*(\d+)/mi)?.[1]);
  if (status !== 'ok') throw new Error('ADB_LAUNCH_FAILED');
  return Object.freeze({
    status:'ok',
    activity,
    totalTimeMs:Number.isSafeInteger(totalTime) ? totalTime : null,
  });
}

export async function captureAppLaunchEvidence({
  applicationId,
  adb = 'adb',
  runner = defaultRunner,
  capturedAt = new Date().toISOString(),
} = {}) {
  const appId = String(applicationId ?? '').trim();
  if (!appId) throw new TypeError('ADB_LAUNCH_APPLICATION_ID_REQUIRED');

  const resolveResult = assertRun(
    await runner(adb, ['shell','cmd','package','resolve-activity','--brief',appId]),
    `${adb} shell cmd package resolve-activity`,
  );
  const component = parseResolvedActivity(resolveResult.stdout, appId);

  assertRun(
    await runner(adb, ['shell','am','force-stop',appId]),
    `${adb} shell am force-stop`,
  );

  const launchResult = assertRun(
    await runner(adb, ['shell','am','start','-W','-n',component]),
    `${adb} shell am start -W`,
  );
  const receipt = parseAmStartWait(launchResult.stdout);

  const pidResult = assertRun(
    await runner(adb, ['shell','pidof',appId]),
    `${adb} shell pidof`,
  );
  const processId = String(pidResult.stdout || '').trim().split(/\s+/).find(Boolean) || null;
  if (!processId || !/^\d+$/.test(processId)) throw new Error('ADB_LAUNCH_PROCESS_MISSING');

  return Object.freeze({
    source:'ADB_AM_START_WAIT',
    capturedAt,
    applicationId:appId,
    component,
    launched:true,
    processId,
    activity:receipt.activity,
    totalTimeMs:receipt.totalTimeMs,
  });
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const applicationId = process.argv[2] || 'com.yggdrasil.lighthouse';
  const evidence = await captureAppLaunchEvidence({ applicationId });
  console.log(JSON.stringify(evidence, null, 2));
}
