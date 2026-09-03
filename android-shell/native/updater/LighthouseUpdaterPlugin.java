package com.yggdrasil.lighthouse;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LighthouseUpdater")
public class LighthouseUpdaterPlugin extends Plugin {
    private static final String PREFS = "lighthouse_updater_jobs";
    private static final String PREFIX = "job:";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void startDownload(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isBlank()) {
            call.reject("UPDATE_URL_REQUIRED");
            return;
        }
        String jobId = call.getString("jobId", UUID.randomUUID().toString());
        File dir = new File(getContext().getFilesDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("UPDATE_DIR_CREATE_FAILED");
            return;
        }
        File part = new File(dir, jobId + ".apk.part");
        JSObject snapshot = snapshot(jobId, "DOWNLOADING", part.getAbsolutePath(), part.length(), null, null);
        snapshot.put("attempts", 0);
        save(snapshot);
        launch(jobId, url, part);
        call.resolve(load(jobId));
    }

    @PluginMethod
    public void getJobSnapshot(PluginCall call) {
        String jobId = call.getString("jobId");
        JSObject snapshot = load(jobId);
        if (snapshot == null) {
            call.reject("UPDATE_JOB_NOT_FOUND");
            return;
        }
        call.resolve(snapshot);
    }

    @PluginMethod
    public void pauseDownload(PluginCall call) {
        String jobId = call.getString("jobId");
        JSObject snapshot = load(jobId);
        if (snapshot == null) {
            call.reject("UPDATE_JOB_NOT_FOUND");
            return;
        }
        snapshot.put("state", "PAUSED");
        save(snapshot);
        call.resolve(snapshot);
    }

    @PluginMethod
    public void resumeDownload(PluginCall call) {
        String jobId = call.getString("jobId");
        String url = call.getString("url");
        JSObject snapshot = load(jobId);
        if (snapshot == null) {
            call.reject("UPDATE_JOB_NOT_FOUND");
            return;
        }
        if (url == null || url.isBlank()) url = snapshot.getString("url");
        if (url == null || url.isBlank()) {
            call.reject("UPDATE_URL_REQUIRED");
            return;
        }
        String stagedPath = snapshot.getString("stagedPath");
        if (stagedPath == null || stagedPath.isBlank()) {
            call.reject("UPDATE_STAGE_PATH_REQUIRED");
            return;
        }
        File part = new File(stagedPath);
        if (!part.getName().endsWith(".part")) part = new File(part.getParentFile(), jobId + ".apk.part");
        snapshot.put("state", "DOWNLOADING");
        snapshot.put("stagedPath", part.getAbsolutePath());
        snapshot.remove("stagedSha256");
        save(snapshot);
        launch(jobId, url, part);
        call.resolve(load(jobId));
    }

    @PluginMethod
    public void discardDownload(PluginCall call) {
        String jobId = call.getString("jobId");
        JSObject snapshot = load(jobId);
        if (snapshot == null) {
            call.reject("UPDATE_JOB_NOT_FOUND");
            return;
        }
        snapshot.put("state", "CANCELLED");
        save(snapshot);
        String path = snapshot.getString("stagedPath");
        if (path != null) new File(path).delete();
        call.resolve(snapshot);
    }

    @PluginMethod
    public void requestInstall(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isBlank()) {
            call.reject("UPDATE_PATH_REQUIRED");
            return;
        }
        File apk = new File(path);
        if (!apk.isFile()) {
            call.reject("UPDATE_APK_MISSING");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            JSObject result = new JSObject();
            result.put("status", "PERMISSION_REQUIRED");
            call.resolve(result);
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(uri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(install);
        JSObject result = new JSObject();
        result.put("status", "REQUESTED");
        call.resolve(result);
    }

    @PluginMethod
    public void reconcileInstalledVersion(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            PackageInfo info = pm.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
            JSObject out = new JSObject();
            out.put("applicationId", info.packageName);
            out.put("versionName", info.versionName);
            out.put("versionCode", Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode);
            out.put("signerCertificateSha256", signerSha256(info));
            call.resolve(out);
        } catch (Exception e) {
            call.reject("INSTALLED_READBACK_FAILED", e);
        }
    }

    private void launch(String jobId, String url, File part) {
        JSObject current = load(jobId);
        if (current != null) {
            current.put("url", url);
            current.put("attempts", intValue(current, "attempts") + 1);
            current.put("lastAttemptAt", System.currentTimeMillis());
            current.remove("error");
            save(current);
        }
        executor.execute(() -> download(jobId, url, part));
    }

    private void download(String jobId, String urlString, File part) {
        HttpURLConnection connection = null;
        try {
            long existing = part.exists() ? part.length() : 0L;
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            if (existing > 0) connection.setRequestProperty("Range", "bytes=" + existing + "-");
            connection.connect();
            int code = connection.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK && code != HttpURLConnection.HTTP_PARTIAL) {
                fail(jobId, "HTTP_" + code);
                return;
            }
            long contentLength = connection.getContentLengthLong();
            Long total = contentLength >= 0 ? existing + contentLength : null;
            try (InputStream in = connection.getInputStream();
                 FileOutputStream out = new FileOutputStream(part, existing > 0 && code == HttpURLConnection.HTTP_PARTIAL)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                long downloaded = existing;
                while ((read = in.read(buffer)) != -1) {
                    JSObject state = load(jobId);
                    if (state == null) return;
                    String phase = state.getString("state");
                    if ("PAUSED".equals(phase) || "CANCELLED".equals(phase)) return;
                    out.write(buffer, 0, read);
                    downloaded += read;
                    state.put("bytesDownloaded", downloaded);
                    if (total != null) state.put("totalBytes", total);
                    save(state);
                }
            }
            File apk = new File(part.getParentFile(), jobId + ".apk");
            if (apk.exists()) apk.delete();
            if (!part.renameTo(apk)) {
                fail(jobId, "STAGE_RENAME_FAILED");
                return;
            }
            JSObject done = load(jobId);
            if (done == null) return;
            done.put("state", "STAGED");
            done.put("stagedPath", apk.getAbsolutePath());
            done.put("bytesDownloaded", apk.length());
            done.put("stagedSha256", sha256File(apk));
            Long totalBytes = nullableLong(done, "totalBytes");
            if (totalBytes != null && totalBytes < apk.length()) done.put("totalBytes", apk.length());
            save(done);
        } catch (Exception e) {
            fail(jobId, e.getClass().getSimpleName());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private JSObject snapshot(String jobId, String state, String path, long bytes, Long total, String error) {
        JSObject out = new JSObject();
        out.put("jobId", jobId);
        out.put("state", state);
        out.put("stagedPath", path);
        out.put("bytesDownloaded", bytes);
        if (total != null) out.put("totalBytes", total);
        if (error != null) out.put("error", error);
        return out;
    }

    private void fail(String jobId, String error) {
        JSObject state = load(jobId);
        if (state == null) return;
        state.put("state", "FAILED");
        state.put("error", error);
        save(state);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void save(JSObject snapshot) {
        String jobId = snapshot.getString("jobId");
        if (jobId == null) return;
        prefs().edit().putString(PREFIX + jobId, snapshot.toString()).apply();
    }

    private JSObject load(String jobId) {
        if (jobId == null) return null;
        String raw = prefs().getString(PREFIX + jobId, null);
        if (raw == null) return null;
        try {
            JSONObject object = new JSONObject(raw);
            JSObject out = new JSObject();
            java.util.Iterator<String> keys = object.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                out.put(key, object.get(key));
            }
            return out;
        } catch (JSONException e) {
            return null;
        }
    }

    private static int intValue(JSObject object, String key) {
        try {
            Object value = object.get(key);
            if (value instanceof Number) return ((Number) value).intValue();
            return value == null ? 0 : Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return 0;
        }
    }

    private static Long nullableLong(JSObject object, String key) {
        try {
            Object value = object.get(key);
            if (value == null || value == JSONObject.NULL) return null;
            if (value instanceof Number) return ((Number) value).longValue();
            return Long.parseLong(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }

    private static String sha256File(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
        return hex.toString();
    }

    private static String signerSha256(PackageInfo info) throws Exception {
        if (info.signingInfo == null) return null;
        android.content.pm.Signature[] signatures = info.signingInfo.hasMultipleSigners()
                ? info.signingInfo.getApkContentsSigners()
                : info.signingInfo.getSigningCertificateHistory();
        if (signatures == null || signatures.length == 0) return null;
        Certificate cert = java.security.cert.CertificateFactory.getInstance("X.509")
                .generateCertificate(new java.io.ByteArrayInputStream(signatures[0].toByteArray()));
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(cert.getEncoded());
        StringBuilder hex = new StringBuilder();
        for (byte b : digest) hex.append(String.format(Locale.ROOT, "%02x", b));
        return hex.toString();
    }
}
