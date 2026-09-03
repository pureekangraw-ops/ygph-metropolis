import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? 'android';
const packageDir = path.join(root, 'app/src/main/java/com/yggdrasil/lighthouse');
const template = path.join('native/updater/LighthouseUpdaterPlugin.java');
const pluginTarget = path.join(packageDir, 'LighthouseUpdaterPlugin.java');
const activityPath = path.join(packageDir, 'MainActivity.java');
const manifestPath = path.join(root, 'app/src/main/AndroidManifest.xml');
const versionPath = 'version.json';
const appGradlePath = path.join(root, 'app/build.gradle');

await fs.mkdir(packageDir, { recursive: true });
await fs.copyFile(template, pluginTarget);

let activity = await fs.readFile(activityPath, 'utf8');
if (!activity.includes('registerPlugin(LighthouseUpdaterPlugin.class);')) {
  activity = activity.replace(
    '  public void onCreate(Bundle savedInstanceState) {\n    super.onCreate(savedInstanceState);',
    '  public void onCreate(Bundle savedInstanceState) {\n    registerPlugin(LighthouseUpdaterPlugin.class);\n    super.onCreate(savedInstanceState);'
  );
}
await fs.writeFile(activityPath, activity);

let manifest = await fs.readFile(manifestPath, 'utf8');
if (!manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
  manifest = manifest.replace(
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
  );
}
if (!manifest.includes('${applicationId}.fileprovider')) {
  manifest = manifest.replace(
    '</application>',
    `        <provider\n            android:name="androidx.core.content.FileProvider"\n            android:authorities="\${applicationId}.fileprovider"\n            android:exported="false"\n            android:grantUriPermissions="true">\n            <meta-data\n                android:name="android.support.FILE_PROVIDER_PATHS"\n                android:resource="@xml/file_paths" />\n        </provider>\n    </application>`
  );
}
await fs.writeFile(manifestPath, manifest);

const version = JSON.parse(await fs.readFile(versionPath, 'utf8'));
let gradle = await fs.readFile(appGradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${Number(version.versionCode)}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${String(version.versionName)}"`);
await fs.writeFile(appGradlePath, gradle);

console.log(JSON.stringify({
  pluginTarget,
  applicationId: 'com.yggdrasil.lighthouse',
  versionCode: Number(version.versionCode),
  versionName: String(version.versionName),
  requestInstallPackages: true,
  fileProvider: true,
}));
