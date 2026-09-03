import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shellRoot = resolve(here, '..');
const templateRoot = resolve(shellRoot, 'android-template');
const applicationId = 'com.yggdrasil.lighthouse';

function addManifestUpdaterContract(source) {
  let text = String(source);
  if (!text.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
    text = text.replace(
      /<application\b/,
      '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n\n    <application',
    );
  }
  if (!text.includes(`${applicationId}.updater.files`)) {
    const provider = `\n        <provider\n            android:name="androidx.core.content.FileProvider"\n            android:authorities="${applicationId}.updater.files"\n            android:exported="false"\n            android:grantUriPermissions="true">\n            <meta-data\n                android:name="android.support.FILE_PROVIDER_PATHS"\n                android:resource="@xml/file_paths" />\n        </provider>\n`;
    text = text.replace(/\s*<\/application>/, `${provider}    </application>`);
  }
  return text;
}

function renderUpdaterPlugin(source) {
  const text = String(source);
  const generated = text.replace(
    'verified.getBool("ok", false)',
    'Boolean.TRUE.equals(verified.getBool("ok"))',
  );
  if (generated === text) throw new Error('ANDROID_UPDATER_TEMPLATE_BOOL_COMPAT_PATCH_MISSING');
  return generated;
}

export async function applyUpdaterAndroid(androidRoot = 'android') {
  const root = resolve(shellRoot, androidRoot);
  const javaDir = resolve(root, 'app/src/main/java/com/yggdrasil/lighthouse');
  const resXmlDir = resolve(root, 'app/src/main/res/xml');
  const manifestPath = resolve(root, 'app/src/main/AndroidManifest.xml');
  await mkdir(javaDir, { recursive:true });
  await mkdir(resXmlDir, { recursive:true });

  const pluginTemplate = await readFile(resolve(templateRoot, 'LighthouseUpdaterPlugin.java'), 'utf8');
  await writeFile(resolve(javaDir, 'LighthouseUpdaterPlugin.java'), renderUpdaterPlugin(pluginTemplate), 'utf8');
  await cp(resolve(templateRoot, 'file_paths.xml'), resolve(resXmlDir, 'file_paths.xml'));

  const mainActivity = `package ${applicationId};\n\nimport android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(LighthouseUpdaterPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}\n`;
  await writeFile(resolve(javaDir, 'MainActivity.java'), mainActivity, 'utf8');

  const manifest = await readFile(manifestPath, 'utf8');
  const nextManifest = addManifestUpdaterContract(manifest);
  await writeFile(manifestPath, nextManifest, 'utf8');

  return Object.freeze({
    applicationId,
    permission:'android.permission.REQUEST_INSTALL_PACKAGES',
    fileProviderAuthority:`${applicationId}.updater.files`,
    plugin:'LighthouseUpdaterPlugin',
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(await applyUpdaterAndroid(process.argv[2] || 'android')));
}
