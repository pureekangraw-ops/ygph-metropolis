import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE='com.yggdrasil.lighthouse';
const JAVA_REL=['app','src','main','java','com','yggdrasil','lighthouse'];

function once(text,needle,replacement){return text.includes(needle)?text:text.replace(replacement.match,replacement.with);}

const PLUGIN_SOURCE=`package com.yggdrasil.lighthouse;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.cert.CertificateEncodingException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LighthouseUpdater")
public class LighthouseUpdaterPlugin extends Plugin {
    private static final String APK_NAME = "lighthouse-update.apk";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean cancelled = false;
    private volatile HttpURLConnection activeConnection = null;

    private File apkFile() { return new File(getContext().getCacheDir(), APK_NAME); }

    @PluginMethod
    public void getInstalledIdentity(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject out = new JSObject();
            out.put("packageName", getContext().getPackageName());
            out.put("versionName", info.versionName == null ? "" : info.versionName);
            out.put("versionCode", Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode);
            call.resolve(out);
        } catch (Exception error) { call.reject("UPDATE_IDENTITY_FAILED", error); }
    }

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String source = call.getString("url");
        if (source == null || !source.startsWith("https://")) { call.reject("UPDATE_APK_URL_HTTPS_REQUIRED"); return; }
        cancelled = false;
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                File target = apkFile();
                if (target.exists() && !target.delete()) throw new IllegalStateException("UPDATE_STAGED_APK_DELETE_FAILED");
                connection = (HttpURLConnection) new URL(source).openConnection();
                activeConnection = connection;
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();
                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new IllegalStateException("UPDATE_DOWNLOAD_HTTP_" + code);
                long total = connection.getContentLengthLong();
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long downloaded = 0;
                try (InputStream input = new BufferedInputStream(connection.getInputStream()); FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[32768];
                    int count;
                    while ((count = input.read(buffer)) >= 0) {
                        if (cancelled) throw new IllegalStateException("UPDATE_CANCELLED");
                        if (count == 0) continue;
                        output.write(buffer, 0, count);
                        digest.update(buffer, 0, count);
                        downloaded += count;
                        JSObject progress = new JSObject();
                        progress.put("downloadedBytes", downloaded);
                        progress.put("totalBytes", total);
                        progress.put("percent", total > 0 ? Math.min(100, (downloaded * 100.0) / total) : 0);
                        notifyListeners("downloadProgress", progress);
                    }
                    output.getFD().sync();
                }
                if (cancelled) throw new IllegalStateException("UPDATE_CANCELLED");
                JSObject out = new JSObject();
                out.put("sha256", hex(digest.digest(), false));
                out.put("sizeBytes", target.length());
                call.resolve(out);
            } catch (Exception error) {
                File target = apkFile();
                if (target.exists()) target.delete();
                call.reject(error.getMessage() == null ? "UPDATE_DOWNLOAD_FAILED" : error.getMessage(), error);
            } finally {
                activeConnection = null;
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelled = true;
        HttpURLConnection connection = activeConnection;
        if (connection != null) connection.disconnect();
        File target = apkFile();
        if (target.exists()) target.delete();
        JSObject out = new JSObject(); out.put("cancelled", true); call.resolve(out);
    }

    @PluginMethod
    public void inspectApk(PluginCall call) {
        try {
            File target = apkFile();
            if (!target.isFile()) { call.reject("UPDATE_APK_NOT_DOWNLOADED"); return; }
            PackageManager pm = getContext().getPackageManager();
            int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            PackageInfo info = pm.getPackageArchiveInfo(target.getAbsolutePath(), flags);
            if (info == null) { call.reject("UPDATE_APK_PARSE_FAILED"); return; }
            JSObject out = new JSObject();
            out.put("packageName", info.packageName == null ? "" : info.packageName);
            out.put("versionName", info.versionName == null ? "" : info.versionName);
            out.put("versionCode", Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode);
            out.put("signerSha256", signerSha256(info));
            call.resolve(out);
        } catch (Exception error) { call.reject("UPDATE_APK_INSPECTION_FAILED", error); }
    }

    @PluginMethod
    public void canRequestInstalls(PluginCall call) {
        JSObject out = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
        out.put("allowed", allowed); call.resolve(out);
    }

    @PluginMethod
    public void openUnknownSourcesSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(intent);
            }
            JSObject out = new JSObject(); out.put("opened", true); call.resolve(out);
        } catch (Exception error) { call.reject("UPDATE_UNKNOWN_SOURCES_SETTINGS_FAILED", error); }
    }

    @PluginMethod
    public void openInstaller(PluginCall call) {
        try {
            File target = apkFile();
            if (!target.isFile()) { call.reject("UPDATE_APK_NOT_DOWNLOADED"); return; }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".updater.fileprovider", target);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject out = new JSObject(); out.put("opened", true); call.resolve(out);
        } catch (Exception error) { call.reject("UPDATE_INSTALLER_OPEN_FAILED", error); }
    }

    private String signerSha256(PackageInfo info) throws Exception {
        byte[] bytes;
        if (Build.VERSION.SDK_INT >= 28 && info.signingInfo != null) {
            android.content.pm.Signature[] signers = info.signingInfo.hasMultipleSigners() ? info.signingInfo.getApkContentsSigners() : info.signingInfo.getSigningCertificateHistory();
            if (signers == null || signers.length == 0) throw new CertificateEncodingException("UPDATE_SIGNER_MISSING");
            bytes = signers[0].toByteArray();
        } else {
            if (info.signatures == null || info.signatures.length == 0) throw new CertificateEncodingException("UPDATE_SIGNER_MISSING");
            bytes = info.signatures[0].toByteArray();
        }
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return hex(digest.digest(bytes), true);
    }

    private static String hex(byte[] bytes, boolean colon) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < bytes.length; i++) {
            if (colon && i > 0) out.append(':');
            out.append(String.format(Locale.US, "%02X", bytes[i]));
        }
        return colon ? out.toString() : out.toString().toLowerCase(Locale.US);
    }
}
`;

export async function applyAndroidUpdater(androidRoot){
  const manifestPath=join(androidRoot,'app','src','main','AndroidManifest.xml');
  const javaDir=join(androidRoot,...JAVA_REL);
  const mainPath=join(javaDir,'MainActivity.java');
  const pluginPath=join(javaDir,'LighthouseUpdaterPlugin.java');
  const xmlDir=join(androidRoot,'app','src','main','res','xml');
  const pathsFile=join(xmlDir,'lighthouse_update_paths.xml');

  let manifest=await readFile(manifestPath,'utf8');
  if(!manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES')){
    manifest=manifest.replace(/<manifest\b([^>]*)>/,match=>`${match}\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />`);
  }
  if(!manifest.includes('androidx.core.content.FileProvider')){
    manifest=manifest.replace(/<\/application>/,`        <provider\n            android:name="androidx.core.content.FileProvider"\n            android:authorities="\${applicationId}.updater.fileprovider"\n            android:exported="false"\n            android:grantUriPermissions="true">\n            <meta-data\n                android:name="android.support.FILE_PROVIDER_PATHS"\n                android:resource="@xml/lighthouse_update_paths" />\n        </provider>\n    </application>`);
  }
  await writeFile(manifestPath,manifest,'utf8');

  await mkdir(javaDir,{recursive:true});
  let main=await readFile(mainPath,'utf8');
  if(!main.includes('LighthouseUpdaterPlugin')){
    if(!main.includes('android.os.Bundle')) main=main.replace(/package com\.yggdrasil\.lighthouse;\s*/,`package com.yggdrasil.lighthouse;\n\nimport android.os.Bundle;\n`);
    main=main.replace(/public class MainActivity extends BridgeActivity\s*\{[^}]*\}/s,`public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(LighthouseUpdaterPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}`);
  }
  await writeFile(mainPath,main,'utf8');
  await writeFile(pluginPath,PLUGIN_SOURCE,'utf8');
  await mkdir(xmlDir,{recursive:true});
  await writeFile(pathsFile,`<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n    <cache-path name="lighthouse_updates" path="." />\n</paths>\n`,'utf8');

  const readback=await readFile(manifestPath,'utf8');
  const mainReadback=await readFile(mainPath,'utf8');
  if(!readback.includes('android.permission.REQUEST_INSTALL_PACKAGES')||!readback.includes('androidx.core.content.FileProvider')||!mainReadback.includes('registerPlugin(LighthouseUpdaterPlugin.class)'))throw new Error('ANDROID_UPDATER_READBACK_FAILED');
  return {packageName:PACKAGE,manifestPath,pluginPath,pathsFile};
}

async function main(){
  const [, , androidRoot]=process.argv;
  if(!androidRoot)throw new Error('USAGE: node tools/apply-android-updater.mjs <android-root>');
  console.log(JSON.stringify(await applyAndroidUpdater(androidRoot)));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){main().catch(error=>{console.error(error?.stack||String(error));process.exitCode=1;});}
