import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function setApplicationAttribute(manifestText, name, value) {
  const openTag = /<application\b[^>]*>/s.exec(manifestText);
  if (!openTag) throw new Error('ANDROID_SECURITY_APPLICATION_TAG_MISSING');
  const attr = new RegExp(`\\sandroid:${name}="[^"]*"`);
  let replacement = openTag[0];
  if (attr.test(replacement)) replacement = replacement.replace(attr, ` android:${name}="${value}"`);
  else replacement = replacement.replace(/>$/, ` android:${name}="${value}">`);
  return manifestText.slice(0, openTag.index) + replacement + manifestText.slice(openTag.index + openTag[0].length);
}

async function findMainActivity(directory) {
  const entries = await readdir(directory, { withFileTypes:true });
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = await findMainActivity(full);
      if (found) return found;
    } else if (entry.isFile() && entry.name === 'MainActivity.java') return full;
  }
  return null;
}

function ensureImport(source, statement) {
  if (source.includes(statement)) return source;
  const packageLine = /^package\s+[^;]+;\s*/m.exec(source);
  if (!packageLine) throw new Error('ANDROID_MAIN_ACTIVITY_PACKAGE_MISSING');
  const at = packageLine.index + packageLine[0].length;
  return source.slice(0, at) + `\n${statement}\n` + source.slice(at);
}

function applyWebViewZoomLock(source) {
  if (source.includes('setSupportZoom(false)') && source.includes('setBuiltInZoomControls(false)') && source.includes('setDisplayZoomControls(false)')) return source;

  source = ensureImport(source, 'import android.os.Bundle;');
  source = ensureImport(source, 'import android.webkit.WebView;');
  const zoomLines = [
    '    WebView webView = getBridge().getWebView();',
    '    webView.getSettings().setSupportZoom(false);',
    '    webView.getSettings().setBuiltInZoomControls(false);',
    '    webView.getSettings().setDisplayZoomControls(false);',
  ].join('\n');

  if (/void\s+onCreate\s*\(\s*Bundle\s+\w+\s*\)/.test(source)) {
    const superCall = /super\.onCreate\([^)]*\);/;
    if (!superCall.test(source)) throw new Error('ANDROID_MAIN_ACTIVITY_SUPER_ONCREATE_MISSING');
    return source.replace(superCall, match => `${match}\n${zoomLines}`);
  }

  const lastBrace = source.lastIndexOf('}');
  if (lastBrace < 0) throw new Error('ANDROID_MAIN_ACTIVITY_CLASS_MISSING');
  const method = `\n  @Override\n  public void onCreate(Bundle savedInstanceState) {\n    super.onCreate(savedInstanceState);\n${zoomLines}\n  }\n`;
  return source.slice(0, lastBrace) + method + source.slice(lastBrace);
}

export async function applyAndroidSecurityBaseline(androidRoot) {
  const manifestPath = join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
  let manifest = await readFile(manifestPath, 'utf8');
  manifest = setApplicationAttribute(manifest, 'allowBackup', 'false');
  manifest = setApplicationAttribute(manifest, 'usesCleartextTraffic', 'false');
  await writeFile(manifestPath, manifest, 'utf8');

  const javaRoot = join(androidRoot, 'app', 'src', 'main', 'java');
  const mainActivityPath = await findMainActivity(javaRoot);
  if (!mainActivityPath) throw new Error('ANDROID_MAIN_ACTIVITY_MISSING');
  const activity = applyWebViewZoomLock(await readFile(mainActivityPath, 'utf8'));
  await writeFile(mainActivityPath, activity, 'utf8');

  return { manifestPath, mainActivityPath, allowBackup:false, usesCleartextTraffic:false, webViewZoom:false };
}

async function main() {
  const [, , androidRoot] = process.argv;
  if (!androidRoot) throw new Error('USAGE: node tools/apply-android-security.mjs <android-root>');
  const result = await applyAndroidSecurityBaseline(androidRoot);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
