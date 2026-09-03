import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXPECTED_APPLICATION_ID = 'com.yggdrasil.lighthouse';
const ALLOWED_PERMISSIONS = new Set([
  'android.permission.INTERNET',
  'android.permission.REQUEST_INSTALL_PACKAGES',
]);
const DYNAMIC_RECEIVER_PERMISSION = `${EXPECTED_APPLICATION_ID}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;
const PROFILE_INSTALL_RECEIVER = 'androidx.profileinstaller.ProfileInstallReceiver';
const PROFILE_INSTALL_PERMISSION = 'android.permission.DUMP';
const PROFILE_INSTALL_ACTIONS = new Set([
  'androidx.profileinstaller.action.INSTALL_PROFILE',
  'androidx.profileinstaller.action.SAVE_PROFILE',
  'androidx.profileinstaller.action.SKIP_FILE',
  'androidx.profileinstaller.action.BENCHMARK_OPERATION',
]);
const COMPONENT_TAGS = ['activity', 'activity-alias', 'service', 'receiver', 'provider'];

function attr(text, name) {
  const match = new RegExp(`\\bandroid:${name}="([^"]*)"`).exec(text);
  return match ? match[1] : undefined;
}

function boolAttr(text, name) {
  const value = attr(text, name);
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`ANDROID_SECURITY_INVALID_BOOLEAN:${name}/${value}`);
}

function manifestPackage(manifestText) {
  const tag = /<manifest\b[^>]*>/s.exec(manifestText)?.[0];
  if (!tag) throw new Error('ANDROID_SECURITY_MANIFEST_TAG_MISSING');
  return /\bpackage="([^"]+)"/.exec(tag)?.[1];
}

function applicationTag(manifestText) {
  const tag = /<application\b[^>]*>/s.exec(manifestText)?.[0];
  if (!tag) throw new Error('ANDROID_SECURITY_APPLICATION_TAG_MISSING');
  return tag;
}

function permissions(manifestText) {
  return [...manifestText.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"[^>]*\/?\s*>/gs)]
    .map(match => match[1])
    .sort();
}

function declaredPermissions(manifestText) {
  return [...manifestText.matchAll(/<permission\b([^>]*)\/?\s*>/gs)]
    .map(match => {
      const tag = `<permission${match[1]}>`;
      return { name:attr(tag, 'name') || '', protectionLevel:attr(tag, 'protectionLevel') || null };
    })
    .filter(permission => permission.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function actions(body) {
  return [...body.matchAll(/<action\b[^>]*android:name="([^"]+)"[^>]*\/?\s*>/gs)]
    .map(match => match[1])
    .sort();
}

function components(manifestText) {
  const found = [];
  for (const tagName of COMPONENT_TAGS) {
    const paired = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'g');
    for (const match of manifestText.matchAll(paired)) {
      const open = `<${tagName}${match[1]}>`;
      const body = match[2];
      found.push({
        type:tagName,
        name:attr(open, 'name') || '',
        exported:boolAttr(open, 'exported'),
        permission:attr(open, 'permission') || null,
        actions:actions(body),
        launcher:/android\.intent\.action\.MAIN/.test(body) && /android\.intent\.category\.LAUNCHER/.test(body),
        hasIntentFilter:/<intent-filter\b/.test(body),
      });
    }
    const selfClosing = new RegExp(`<${tagName}\\b([^>]*)\\/\s*>`, 'g');
    for (const match of manifestText.matchAll(selfClosing)) {
      const open = `<${tagName}${match[1]}/>`;
      found.push({
        type:tagName,
        name:attr(open, 'name') || '',
        exported:boolAttr(open, 'exported'),
        permission:attr(open, 'permission') || null,
        actions:[],
        launcher:false,
        hasIntentFilter:false,
      });
    }
  }
  return found.sort((a, b) => `${a.type}/${a.name}`.localeCompare(`${b.type}/${b.name}`));
}

function enabledPluginSurface(capacitorConfig) {
  if (!capacitorConfig || typeof capacitorConfig !== 'object' || Array.isArray(capacitorConfig)) throw new Error('ANDROID_SECURITY_CAPACITOR_CONFIG_MISSING');
  const plugins = capacitorConfig.plugins;
  if (plugins === undefined) return [];
  if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) throw new Error('ANDROID_SECURITY_CAPACITOR_PLUGINS_INVALID');
  return Object.entries(plugins)
    .filter(([, value]) => !(value && typeof value === 'object' && value.enabled === false))
    .map(([name]) => name)
    .sort();
}

function isTrustedExportedProfileReceiver(component) {
  if (component.type !== 'receiver' || component.name !== PROFILE_INSTALL_RECEIVER) return false;
  if (component.permission !== PROFILE_INSTALL_PERMISSION) return false;
  if (!component.hasIntentFilter || component.actions.length === 0) return false;
  return component.actions.every(action => PROFILE_INSTALL_ACTIONS.has(action));
}

export function inspectAndroidSecurity({ manifestText, capacitorConfig, manifestPath = null }) {
  if (typeof manifestText !== 'string' || !manifestText.trim()) throw new Error('ANDROID_SECURITY_MANIFEST_MISSING');
  const packageId = manifestPackage(manifestText);
  const appTag = applicationTag(manifestText);
  const requestedPermissions = permissions(manifestText);
  const permissionDeclarations = declaredPermissions(manifestText);
  const componentInventory = components(manifestText);
  const exportedComponents = componentInventory.filter(component => component.exported === true);
  const allowBackup = boolAttr(appTag, 'allowBackup');
  const usesCleartextTraffic = boolAttr(appTag, 'usesCleartextTraffic');
  const debuggable = boolAttr(appTag, 'debuggable') ?? false;
  const configAppId = String(capacitorConfig?.appId || '');

  return {
    status:'PROVEN',
    manifestPath,
    applicationId:packageId || configAppId || null,
    capacitorAppId:configAppId || null,
    requestedPermissions,
    declaredPermissions:permissionDeclarations,
    components:componentInventory,
    exportedComponents,
    backupPolicy:{ allowBackup:allowBackup ?? null },
    networkPolicy:{ usesCleartextTraffic:usesCleartextTraffic ?? null },
    debuggable,
    enabledNativePluginSurface:enabledPluginSurface(capacitorConfig),
  };
}

export function verifyAndroidSecurity(input) {
  const evidence = inspectAndroidSecurity(input);
  if (!evidence.applicationId || evidence.applicationId !== EXPECTED_APPLICATION_ID) {
    throw new Error(`ANDROID_SECURITY_APPLICATION_ID_MISMATCH:${evidence.applicationId || 'UNKNOWN'}`);
  }
  if (evidence.capacitorAppId && evidence.capacitorAppId !== EXPECTED_APPLICATION_ID) {
    throw new Error(`ANDROID_SECURITY_CAPACITOR_APP_ID_MISMATCH:${evidence.capacitorAppId}`);
  }

  for (const permission of evidence.requestedPermissions) {
    if (ALLOWED_PERMISSIONS.has(permission)) continue;
    if (permission !== DYNAMIC_RECEIVER_PERMISSION) throw new Error(`ANDROID_SECURITY_UNEXPECTED_PERMISSION:${permission}`);
    const declaration = evidence.declaredPermissions.find(item => item.name === permission);
    if (!declaration) throw new Error('ANDROID_SECURITY_DYNAMIC_PERMISSION_DECLARATION_MISSING');
    if (declaration.protectionLevel !== 'signature') throw new Error(`ANDROID_SECURITY_DYNAMIC_PERMISSION_NOT_SIGNATURE_PROTECTED:${declaration.protectionLevel || 'UNKNOWN'}`);
  }

  for (const declaration of evidence.declaredPermissions) {
    if (declaration.name !== DYNAMIC_RECEIVER_PERMISSION) throw new Error(`ANDROID_SECURITY_UNEXPECTED_DECLARED_PERMISSION:${declaration.name}`);
    if (declaration.protectionLevel !== 'signature') throw new Error(`ANDROID_SECURITY_DYNAMIC_PERMISSION_NOT_SIGNATURE_PROTECTED:${declaration.protectionLevel || 'UNKNOWN'}`);
  }

  if (evidence.backupPolicy.allowBackup === null) throw new Error('ANDROID_SECURITY_BACKUP_POLICY_UNKNOWN');
  if (evidence.backupPolicy.allowBackup !== false) throw new Error('ANDROID_SECURITY_BACKUP_NOT_DISABLED');
  if (evidence.networkPolicy.usesCleartextTraffic === null) throw new Error('ANDROID_SECURITY_CLEARTEXT_POLICY_UNKNOWN');
  if (evidence.networkPolicy.usesCleartextTraffic !== false) throw new Error('ANDROID_SECURITY_CLEARTEXT_ALLOWED');
  if (evidence.debuggable) throw new Error('ANDROID_SECURITY_DEBUGGABLE_RELEASE');

  const launcherExported = evidence.exportedComponents.filter(component => component.type === 'activity' && component.launcher);
  if (launcherExported.length !== 1) throw new Error(`ANDROID_SECURITY_LAUNCHER_EXPORT_COUNT:${launcherExported.length}`);
  for (const component of evidence.exportedComponents) {
    if (component.type === 'activity' && component.launcher) continue;
    if (isTrustedExportedProfileReceiver(component)) continue;
    if (component.type === 'receiver' && component.name === PROFILE_INSTALL_RECEIVER) {
      if (component.permission !== PROFILE_INSTALL_PERMISSION) throw new Error(`ANDROID_SECURITY_PROFILE_RECEIVER_PERMISSION:${component.permission || 'UNKNOWN'}`);
      const unexpected = component.actions.filter(action => !PROFILE_INSTALL_ACTIONS.has(action));
      if (unexpected.length) throw new Error(`ANDROID_SECURITY_PROFILE_RECEIVER_ACTION:${unexpected.join(',')}`);
      throw new Error('ANDROID_SECURITY_PROFILE_RECEIVER_INTENT_FILTER_MISSING');
    }
    throw new Error(`ANDROID_SECURITY_UNEXPECTED_EXPORTED_COMPONENT:${component.type}/${component.name || 'UNKNOWN'}`);
  }
  for (const component of evidence.components) {
    if (component.hasIntentFilter && component.exported === undefined) {
      throw new Error(`ANDROID_SECURITY_EXPORTED_POLICY_UNKNOWN:${component.type}/${component.name || 'UNKNOWN'}`);
    }
    if (component.type === 'provider' && component.exported !== false) {
      throw new Error(`ANDROID_SECURITY_PROVIDER_NOT_PRIVATE:${component.name || 'UNKNOWN'}`);
    }
  }
  return evidence;
}

async function findFiles(root, filename, out = []) {
  const entries = await readdir(root, { withFileTypes:true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await findFiles(path, filename, out);
    else if (entry.isFile() && entry.name === filename) out.push(path);
  }
  return out;
}

async function findMergedReleaseManifest(androidRoot) {
  const intermediatesRoot = join(androidRoot, 'app', 'build', 'intermediates');
  let allManifests;
  try { allManifests = await findFiles(intermediatesRoot, 'AndroidManifest.xml'); }
  catch (error) {
    if (error?.code === 'ENOENT') throw new Error('ANDROID_SECURITY_MERGED_MANIFEST_MISSING');
    throw error;
  }

  const matches = allManifests.filter(path => {
    const normalized = path.replaceAll('\\', '/');
    return /\/merged_manifests?\/release\//.test(normalized);
  });
  if (matches.length === 0) throw new Error('ANDROID_SECURITY_MERGED_MANIFEST_MISSING');
  if (matches.length !== 1) throw new Error(`ANDROID_SECURITY_MERGED_MANIFEST_COUNT:${matches.length}`);
  return matches[0];
}

async function readGeneratedCapacitorConfig(androidRoot) {
  const configPath = join(androidRoot, 'app', 'src', 'main', 'assets', 'capacitor.config.json');
  let text;
  try { text = await readFile(configPath, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') throw new Error('ANDROID_SECURITY_GENERATED_CAPACITOR_CONFIG_MISSING');
    throw error;
  }
  try { return { configPath, config:JSON.parse(text) }; }
  catch { throw new Error('ANDROID_SECURITY_GENERATED_CAPACITOR_CONFIG_INVALID'); }
}

export async function verifyGeneratedAndroidSecurity(androidRoot) {
  const manifestPath = await findMergedReleaseManifest(androidRoot);
  const manifestText = await readFile(manifestPath, 'utf8');
  const { configPath, config } = await readGeneratedCapacitorConfig(androidRoot);
  const evidence = verifyAndroidSecurity({ manifestText, capacitorConfig:config, manifestPath:relative(androidRoot, manifestPath) });
  return { ...evidence, capacitorConfigPath:relative(androidRoot, configPath) };
}

async function main() {
  const [, , androidRoot, evidencePath] = process.argv;
  if (!androidRoot || !evidencePath) throw new Error('USAGE: node tools/verify-android-security.mjs <android-root> <evidence-json>');
  const evidence = await verifyGeneratedAndroidSecurity(androidRoot);
  await mkdir(dirname(evidencePath), { recursive:true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status:evidence.status, evidencePath }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
