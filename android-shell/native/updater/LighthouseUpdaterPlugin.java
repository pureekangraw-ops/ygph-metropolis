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
import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.URL;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(name = "LighthouseUpdater")
public class LighthouseUpdaterPlugin extends Plugin {
    private static final String PREFS = "lighthouse_updater_jobs";
    private static final String PREFIX = "job:";
    private static final String PENDING_INSTALL_JOB = "pendingInstallJobId";
    private static final long PROGRESS_CHECKPOINT_MS = 500L;
    private static final long SPEED_SAMPLE_WINDOW_MS = 3000L;
    private static final int MAX_NETWORK_RETRIES = 3;
    private static final long[] RETRY_BACKOFF_MS = new long[] { 1000L, 2000L, 4000L };
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Set<String> activeDownloads = ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<String, HttpURLConnection> activeConnections = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, InputStream> activeStreams = new ConcurrentHashMap<>();
    private final AtomicLong workerSequence = new AtomicLong();
    private final ConcurrentHashMap<String, Long> currentWorkerTokens = new ConcurrentHashMap<>();
    private final ThreadLocal<Long> executingWorkerToken = new ThreadLocal<>();

    private static final class SpeedSample {
        final long atMs;
        final long bytes;

        SpeedSample(long atMs, long bytes) {
            this.atMs = atMs;
            this.bytes = bytes;
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        String jobId = prefs().getString(PENDING_INSTALL_JOB, null);
        if (jobId == null || jobId.isBlank()) return;
        JSObject snapshot = load(jobId);
        if (snapshot == null) return;
        if ("PERMISSION_REQUIRED".equals(snapshot.getString("state"))) {
            boolean permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                    || getContext().getPackageManager().canRequestPackageInstalls();
            if (!permissionGranted) return;
            snapshot.put("state", "READY_TO_INSTALL");
            save(snapshot);
            prefs().edit().remove(PENDING_INSTALL_JOB).apply();
            return;
        }
        if (!"WAITING_ANDROID_CONFIRMATION".equals(snapshot.getString("state"))) return;
        try {
            reconcileInstalledJob(jobId, snapshot);
        } catch (Exception e) {
            android.util.Log.e("LighthouseUpdater", "INSTALLED_READBACK_FAILED", e);
        }
    }

    @PluginMethod
    public void startDownload(PluginCall call) {
        String url = call.getString("url");
        String expectedSha256 = normalizeHex(call.getString("expectedSha256"));
        Long targetVersionCode = call.getLong("targetVersionCode");
        String targetVersionName = call.getString("targetVersionName");
        if (url == null || url.isBlank()) {
            call.reject("UPDATE_URL_REQUIRED");
            return;
        }
        if (expectedSha256 == null || expectedSha256.isBlank()) {
            call.reject("UPDATE_EXPECTED_SHA256_REQUIRED");
            return;
        }
        if (targetVersionCode == null || targetVersionCode <= 0L) {
            call.reject("UPDATE_TARGET_VERSION_CODE_REQUIRED");
            return;
        }
        if (targetVersionName == null || targetVersionName.isBlank()) {
            call.reject("UPDATE_TARGET_VERSION_NAME_REQUIRED");
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
        snapshot.put("retryAttempt", 0);
        snapshot.put("expectedSha256", expectedSha256);
        snapshot.put("targetVersionCode", targetVersionCode);
        snapshot.put("targetVersionName", targetVersionName);
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
        boolean orphanedDownloading = "DOWNLOADING".equals(snapshot.getString("state")) && !activeDownloads.contains(jobId);
        boolean orphanedRetrying = "RETRYING".equals(snapshot.getString("state")) && !activeDownloads.contains(jobId);
        boolean orphanedVerifying = "VERIFYING".equals(snapshot.getString("state")) && !activeDownloads.contains(jobId);
        if (orphanedDownloading || orphanedRetrying || orphanedVerifying) {
            String stagedPath = snapshot.getString("stagedPath");
            File part;
            if (stagedPath == null || stagedPath.isBlank()) {
                part = new File(new File(getContext().getFilesDir(), "updates"), jobId + ".apk.part");
            } else {
                part = new File(stagedPath);
                if (!part.getName().endsWith(".part") && !part.getName().endsWith(".apk") && part.getParentFile() != null) {
                    part = new File(part.getParentFile(), jobId + ".apk.part");
                }
            }
            if (orphanedVerifying) {
                File dir = part.getParentFile() != null ? part.getParentFile() : new File(getContext().getFilesDir(), "updates");
                File apk = new File(dir, jobId + ".apk");
                if (!part.isFile() && apk.isFile()) part = apk;
            }
            Long durableBytes = nullableLong(snapshot, "bytesDownloaded");
            long actualBytes = part.exists() ? part.length() : 0L;
            if (durableBytes == null || durableBytes != actualBytes) {
                snapshot.put("state", "FAILED");
                snapshot.put("error", "UPDATE_PARTIAL_FILE_MISMATCH");
                snapshot.remove("speedBps");
                save(snapshot);
            } else if (orphanedRetrying) {
                recoverRetryingJob(jobId, snapshot, part);
            } else if (orphanedVerifying) {
                recoverVerifyingJob(jobId, snapshot, part);
            } else {
                snapshot.put("state", "PAUSED");
                snapshot.remove("nextRetryAt");
                snapshot.remove("error");
                snapshot.remove("speedBps");
                save(snapshot);
            }
        }
        call.resolve(snapshot);
    }

    @PluginMethod
    public void pauseDownload(PluginCall call) {
        String jobId = call.getString("jobId");
        synchronized (this) {
            JSObject snapshot = load(jobId);
            if (snapshot == null) {
                call.reject("UPDATE_JOB_NOT_FOUND");
                return;
            }
            if (!requireState(call, snapshot, "DOWNLOADING")) return;
            String stagedPath = snapshot.getString("stagedPath");
            if (stagedPath != null && !stagedPath.isBlank()) {
                File part = new File(stagedPath);
                if (!part.getName().endsWith(".part") && part.getParentFile() != null) {
                    part = new File(part.getParentFile(), jobId + ".apk.part");
                }
                if (part.exists()) snapshot.put("bytesDownloaded", part.length());
                else snapshot.put("bytesDownloaded", 0L);
            }
            snapshot.put("state", "PAUSED");
            snapshot.remove("speedBps");
            save(snapshot);
            InputStream activeStream = activeStreams.get(jobId);
            if (activeStream != null) {
                try {
                    activeStream.close();
                } catch (IOException ignored) {
                }
            }
            HttpURLConnection activeConnection = activeConnections.get(jobId);
            if (activeConnection != null) activeConnection.disconnect();
            call.resolve(snapshot);
        }
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
        if (!requireState(call, snapshot, "PAUSED")) return;
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
        Long durableBytes = nullableLong(snapshot, "bytesDownloaded");
        long actualBytes = part.exists() ? part.length() : 0L;
        if (durableBytes == null || durableBytes != actualBytes) {
            snapshot.put("state", "FAILED");
            snapshot.put("error", "UPDATE_PARTIAL_FILE_MISMATCH");
            snapshot.remove("speedBps");
            save(snapshot);
            call.reject("UPDATE_PARTIAL_FILE_MISMATCH");
            return;
        }
        snapshot.put("state", "DOWNLOADING");
        snapshot.put("stagedPath", part.getAbsolutePath());
        snapshot.remove("stagedSha256");
        snapshot.remove("speedBps");
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
        if (!requireState(call, snapshot, "DOWNLOADING", "PAUSED", "RETRYING", "VERIFYING", "READY_TO_INSTALL", "FAILED")) return;
        Long cancelledWorker = currentWorkerTokens.remove(jobId);
        if (cancelledWorker != null) activeDownloads.remove(jobId);
        InputStream activeStream = activeStreams.get(jobId);
        if (activeStream != null) {
            try {
                activeStream.close();
            } catch (IOException ignored) {
            }
        }
        HttpURLConnection activeConnection = activeConnections.get(jobId);
        if (activeConnection != null) activeConnection.disconnect();
        String path = snapshot.getString("stagedPath");
        File dir = new File(getContext().getFilesDir(), "updates");
        if (path != null && !path.isBlank()) {
            File staged = new File(path);
            staged.delete();
            if (staged.getParentFile() != null) dir = staged.getParentFile();
        }
        new File(dir, jobId + ".apk.part").delete();
        new File(dir, jobId + ".apk").delete();
        prefs().edit().remove(PREFIX + jobId).apply();
        JSObject result = new JSObject();
        result.put("jobId", jobId);
        result.put("state", "CANCELLED");
        call.resolve(result);
    }

    @PluginMethod
    public void requestInstall(PluginCall call) {
        String jobId = call.getString("jobId");
        JSObject snapshot = load(jobId);
        if (snapshot == null) {
            call.reject("UPDATE_JOB_NOT_FOUND");
            return;
        }
        if (!requireState(call, snapshot, "READY_TO_INSTALL", "PERMISSION_REQUIRED")) return;
        String path = snapshot.getString("stagedPath");
        if (path == null || path.isBlank()) {
            call.reject("UPDATE_STAGE_PATH_REQUIRED");
            return;
        }
        File apk = new File(path);
        if (!apk.isFile()) {
            call.reject("UPDATE_APK_MISSING");
            return;
        }
        String stagedSha256 = normalizeHex(snapshot.getString("stagedSha256"));
        if (stagedSha256 == null || stagedSha256.isBlank()) {
            call.reject("UPDATE_STAGED_SHA256_REQUIRED");
            return;
        }
        try {
            String currentSha256 = normalizeHex(sha256File(apk));
            if (!stagedSha256.equals(currentSha256)) {
                snapshot.put("state", "FAILED");
                snapshot.put("error", "UPDATE_ARTIFACT_MISMATCH");
                save(snapshot);
                call.reject("UPDATE_ARTIFACT_MISMATCH");
                return;
            }
        } catch (Exception e) {
            call.reject("UPDATE_ARTIFACT_VERIFY_FAILED", e);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            snapshot.put("state", "PERMISSION_REQUIRED");
            save(snapshot);
            prefs().edit().putString(PENDING_INSTALL_JOB, jobId).apply();
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
        snapshot.put("state", "WAITING_ANDROID_CONFIRMATION");
        save(snapshot);
        prefs().edit().putString(PENDING_INSTALL_JOB, jobId).apply();
        getContext().startActivity(install);
        JSObject result = new JSObject();
        result.put("status", "REQUESTED");
        call.resolve(result);
    }

    @PluginMethod
    public void reconcileInstalledVersion(PluginCall call) {
        String jobId = call.getString("jobId");
        JSObject snapshot = load(jobId);
        if (snapshot == null) {
            call.reject("UPDATE_JOB_NOT_FOUND");
            return;
        }
        if (!requireState(call, snapshot, "WAITING_ANDROID_CONFIRMATION")) return;
        try {
            call.resolve(reconcileInstalledJob(jobId, snapshot));
        } catch (IllegalStateException e) {
            if ("UPDATE_TARGET_VERSION_CODE_REQUIRED".equals(e.getMessage())) {
                call.reject("UPDATE_TARGET_VERSION_CODE_REQUIRED");
            } else {
                call.reject("INSTALLED_READBACK_FAILED", e);
            }
        } catch (Exception e) {
            call.reject("INSTALLED_READBACK_FAILED", e);
        }
    }

    private JSObject reconcileInstalledJob(String jobId, JSObject snapshot) throws Exception {
        Long targetVersionCode = nullableLong(snapshot, "targetVersionCode");
        if (targetVersionCode == null || targetVersionCode <= 0L) {
            throw new IllegalStateException("UPDATE_TARGET_VERSION_CODE_REQUIRED");
        }
        snapshot.put("state", "READBACK");
        save(snapshot);
        try {
            PackageManager pm = getContext().getPackageManager();
            PackageInfo info = pm.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
            long installedVersionCode = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
            String installedSignerSha256 = signerSha256(info);
            snapshot.put("installedVersionCode", installedVersionCode);
            snapshot.put("installedVersionName", info.versionName);
            snapshot.put("installedSignerSha256", installedSignerSha256);
            snapshot.put("readbackAt", System.currentTimeMillis());
            if (installedVersionCode >= targetVersionCode) {
                snapshot.put("state", "DONE");
            } else {
                snapshot.put("state", "READY_TO_INSTALL");
                snapshot.put("message", "ยังไม่ได้ติดตั้ง");
            }
            save(snapshot);
            return snapshot;
        } catch (Exception e) {
            snapshot.put("state", "WAITING_ANDROID_CONFIRMATION");
            snapshot.put("error", "INSTALLED_READBACK_FAILED");
            save(snapshot);
            throw e;
        }
    }

    private boolean requireState(PluginCall call, JSObject snapshot, String... allowedStates) {
        String current = snapshot.getString("state");
        for (String allowed : allowedStates) {
            if (allowed.equals(current)) return true;
        }
        call.reject("UPDATE_INVALID_STATE", "Current state " + current + " does not allow this transition");
        return false;
    }

    private void launch(String jobId, String url, File part) {
        JSObject current = load(jobId);
        if (current != null) {
            current.put("url", url);
            current.put("attempts", intValue(current, "attempts") + 1);
            current.put("lastAttemptAt", System.currentTimeMillis());
            current.remove("error");
            current.remove("speedBps");
            save(current);
        }
        long workerToken = claimWorker(jobId);
        activeDownloads.add(jobId);
        executor.execute(() -> {
            executingWorkerToken.set(workerToken);
            try {
                download(jobId, url, part);
            } finally {
                executingWorkerToken.remove();
                if (currentWorkerTokens.remove(jobId, workerToken)) activeDownloads.remove(jobId);
            }
        });
    }

    private void download(String jobId, String urlString, File part) {
        HttpURLConnection connection = null;
        InputStream inputStream = null;
        try {
            long existing = part.exists() ? part.length() : 0L;
            JSObject durable = load(jobId);
            if (durable == null) return;
            String etag = durable.getString("etag");
            String lastModified = durable.getString("lastModified");

            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            if (existing > 0) {
                connection.setRequestProperty("Range", "bytes=" + existing + "-");
                String validator = etag != null && !etag.isBlank() ? etag : lastModified;
                if (validator != null && !validator.isBlank()) {
                    connection.setRequestProperty("If-Range", validator);
                }
            }
            activeConnections.put(jobId, connection);
            if (!isCurrentDownloadState(jobId)) return;
            connection.connect();
            if (!isCurrentDownloadState(jobId)) return;
            int code = connection.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK && code != HttpURLConnection.HTTP_PARTIAL) {
                fail(jobId, "HTTP_" + code);
                return;
            }

            String responseEtag = connection.getHeaderField("ETag");
            String responseLastModified = connection.getHeaderField("Last-Modified");
            boolean validatorMatches = resumeValidatorMatches(etag, lastModified, responseEtag, responseLastModified);
            String contentRange = connection.getHeaderField("Content-Range");
            boolean resumeAccepted = existing > 0
                    && code == HttpURLConnection.HTTP_PARTIAL
                    && contentRangeStartsAt(contentRange, existing)
                    && validatorMatches;
            if (existing > 0 && !resumeAccepted) {
                activeConnections.remove(jobId, connection);
                connection.disconnect();
                connection = null;
                restartPartialFromZero(jobId, urlString, part);
                return;
            }

            JSObject responseState = load(jobId);
            if (responseState == null || !isCurrentDownloadState(jobId)) return;
            if (responseEtag != null && !responseEtag.isBlank()) responseState.put("etag", responseEtag);
            else if (existing == 0) responseState.remove("etag");
            if (responseLastModified != null && !responseLastModified.isBlank()) responseState.put("lastModified", responseLastModified);
            else if (existing == 0) responseState.remove("lastModified");
            save(responseState);

            long contentLength = connection.getContentLengthLong();
            Long total = contentLength >= 0 ? (resumeAccepted ? existing + contentLength : contentLength) : null;
            inputStream = connection.getInputStream();
            activeStreams.put(jobId, inputStream);
            if (!isCurrentDownloadState(jobId)) return;
            try (InputStream in = inputStream;
                 FileOutputStream out = new FileOutputStream(part, resumeAccepted)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                long downloaded = resumeAccepted ? existing : 0L;
                long lastCheckpointAt = System.currentTimeMillis();
                Deque<SpeedSample> speedSamples = new ArrayDeque<>();
                speedSamples.addLast(new SpeedSample(lastCheckpointAt, downloaded));
                while ((read = in.read(buffer)) != -1) {
                    synchronized (this) {
                        JSObject control = load(jobId);
                        if (control == null || !isCurrentWorker(jobId)) return;
                        String phase = control.getString("state");
                        if ("PAUSED".equals(phase) || "CANCELLED".equals(phase)) return;
                        out.write(buffer, 0, read);
                        downloaded += read;
                    }
                    long now = System.currentTimeMillis();
                    if (now - lastCheckpointAt >= PROGRESS_CHECKPOINT_MS) {
                        JSObject state = load(jobId);
                        if (state == null) return;
                        if (!"DOWNLOADING".equals(state.getString("state")) || !isCurrentWorker(jobId)) return;
                        speedSamples.addLast(new SpeedSample(now, downloaded));
                        while (speedSamples.size() > 2 && now - speedSamples.peekFirst().atMs > SPEED_SAMPLE_WINDOW_MS) {
                            speedSamples.removeFirst();
                        }
                        Long speedBps = rollingSpeedBps(speedSamples);
                        state.put("bytesDownloaded", downloaded);
                        if (total != null) state.put("totalBytes", total);
                        else state.remove("totalBytes");
                        if (speedBps != null) state.put("speedBps", speedBps);
                        else state.remove("speedBps");
                        save(state);
                        lastCheckpointAt = now;
                    }
                }
            }
            JSObject done = load(jobId);
            if (done == null || !isCurrentWorker(jobId) || !"DOWNLOADING".equals(done.getString("state"))) return;
            done.put("state", "VERIFYING");
            done.put("verifiedBytes", 0L);
            done.put("bytesDownloaded", part.length());
            done.remove("speedBps");
            save(done);
            completeVerification(jobId, part);
        } catch (Exception e) {
            if (!isCurrentWorker(jobId)) return;
            JSObject state = load(jobId);
            if (state == null) return;
            String phase = state.getString("state");
            if ("PAUSED".equals(phase) || "CANCELLED".equals(phase)) return;
            if (isRetryableNetworkError(e) && retryNetworkFailure(jobId, urlString, part, e)) return;
            fail(jobId, e.getClass().getSimpleName());
        } finally {
            if (inputStream != null) activeStreams.remove(jobId, inputStream);
            if (connection != null) {
                activeConnections.remove(jobId, connection);
                connection.disconnect();
            }
            Long workerToken = executingWorkerToken.get();
            if (workerToken != null && currentWorkerTokens.remove(jobId, workerToken)) activeDownloads.remove(jobId);
        }
    }

    private static Long rollingSpeedBps(Deque<SpeedSample> speedSamples) {
        if (speedSamples == null || speedSamples.size() < 2) return null;
        SpeedSample first = speedSamples.peekFirst();
        SpeedSample last = speedSamples.peekLast();
        if (first == null || last == null) return null;
        long elapsedMs = last.atMs - first.atMs;
        long transferred = last.bytes - first.bytes;
        if (elapsedMs <= 0L || transferred < 0L) return null;
        return Math.round((transferred * 1000.0d) / elapsedMs);
    }

    private static boolean contentRangeStartsAt(String contentRange, long expectedStart) {
        if (contentRange == null) return false;
        String value = contentRange.trim();
        if (!value.startsWith("bytes ")) return false;
        int dash = value.indexOf('-', 6);
        if (dash < 0) return false;
        try {
            return Long.parseLong(value.substring(6, dash).trim()) == expectedStart;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private static boolean resumeValidatorMatches(String etag, String lastModified, String responseEtag, String responseLastModified) {
        if (etag != null && !etag.isBlank()) return etag.equals(responseEtag);
        if (lastModified != null && !lastModified.isBlank()) return lastModified.equals(responseLastModified);
        return true;
    }

    private boolean restartPartialFromZero(String jobId, String urlString, File part) {
        if (part.exists() && !part.delete()) {
            fail(jobId, "UPDATE_PARTIAL_RESET_FAILED");
            return false;
        }
        JSObject state = load(jobId);
        if (state == null) return false;
        state.put("bytesDownloaded", 0L);
        state.remove("totalBytes");
        state.remove("etag");
        state.remove("lastModified");
        state.remove("speedBps");
        save(state);
        download(jobId, urlString, part);
        return true;
    }

    private void completeVerification(String jobId, File part) throws Exception {
        JSObject done = load(jobId);
        if (done == null || !isCurrentWorker(jobId) || !"VERIFYING".equals(done.getString("state"))) return;
        String stagedSha256 = sha256File(part);
        if (!isCurrentWorker(jobId)) return;
        done = load(jobId);
        if (done == null || !"VERIFYING".equals(done.getString("state"))) return;
        done.put("stagedSha256", stagedSha256);
        String expectedSha256 = normalizeHex(done.getString("expectedSha256"));
        if (expectedSha256 == null || !expectedSha256.equals(normalizeHex(stagedSha256))) {
            done.put("state", "FAILED");
            done.put("error", "UPDATE_ARTIFACT_MISMATCH");
            done.remove("speedBps");
            save(done);
            return;
        }
        File apk = part.getName().endsWith(".apk") ? part : new File(part.getParentFile(), jobId + ".apk");
        if (apk != part) {
            if (apk.exists()) apk.delete();
            if (!part.renameTo(apk)) {
                fail(jobId, "STAGE_RENAME_FAILED");
                return;
            }
        }
        if (!isCurrentWorker(jobId)) return;
        done = load(jobId);
        if (done == null || !"VERIFYING".equals(done.getString("state"))) return;
        done.put("stagedPath", apk.getAbsolutePath());
        done.put("bytesDownloaded", apk.length());
        done.put("verifiedBytes", apk.length());
        done.remove("speedBps");
        Long totalBytes = nullableLong(done, "totalBytes");
        if (totalBytes != null && totalBytes < apk.length()) done.put("totalBytes", apk.length());
        done.put("state", "READY_TO_INSTALL");
        save(done);
    }

    private void recoverVerifyingJob(String jobId, JSObject snapshot, File part) {
        long workerToken = claimWorker(jobId);
        activeDownloads.add(jobId);
        executor.execute(() -> {
            executingWorkerToken.set(workerToken);
            try {
                completeVerification(jobId, part);
            } catch (Exception error) {
                if (isCurrentWorker(jobId)) fail(jobId, error.getClass().getSimpleName());
            } finally {
                executingWorkerToken.remove();
                if (currentWorkerTokens.remove(jobId, workerToken)) activeDownloads.remove(jobId);
            }
        });
    }

    private void recoverRetryingJob(String jobId, JSObject snapshot, File part) {
        Long durableRetryAt = nullableLong(snapshot, "nextRetryAt");
        if (durableRetryAt == null) {
            fail(jobId, "UPDATE_RETRY_SCHEDULE_MISSING");
            return;
        }
        long nextRetryAt = durableRetryAt;
        long delayMs = Math.max(0L, nextRetryAt - System.currentTimeMillis());
        String url = snapshot.getString("url");
        if (url == null || url.isBlank()) {
            fail(jobId, "UPDATE_URL_REQUIRED");
            return;
        }
        long workerToken = claimWorker(jobId);
        activeDownloads.add(jobId);
        executor.execute(() -> {
            executingWorkerToken.set(workerToken);
            try {
                Thread.sleep(delayMs);
                if (!isCurrentWorker(jobId)) return;
                JSObject state = load(jobId);
                if (state == null) return;
                if (!"RETRYING".equals(state.getString("state"))) return;
                state.put("state", "DOWNLOADING");
                state.put("attempts", intValue(state, "attempts") + 1);
                state.put("lastAttemptAt", System.currentTimeMillis());
                state.remove("nextRetryAt");
                state.remove("error");
                state.remove("speedBps");
                save(state);
                download(jobId, url, part);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                if (isCurrentWorker(jobId)) fail(jobId, "RETRY_INTERRUPTED");
            } finally {
                executingWorkerToken.remove();
                if (currentWorkerTokens.remove(jobId, workerToken)) activeDownloads.remove(jobId);
            }
        });
    }

    private boolean retryNetworkFailure(String jobId, String urlString, File part, Exception error) {
        JSObject state = load(jobId);
        if (state == null || !isCurrentWorker(jobId)) return false;
        int retryAttempt = intValue(state, "retryAttempt") + 1;
        if (retryAttempt > MAX_NETWORK_RETRIES) return false;

        long delayMs = RETRY_BACKOFF_MS[retryAttempt - 1];
        long nextRetryAt = System.currentTimeMillis() + delayMs;
        state.put("state", "RETRYING");
        state.put("retryAttempt", retryAttempt);
        state.put("nextRetryAt", nextRetryAt);
        state.put("error", error.getClass().getSimpleName());
        state.remove("speedBps");
        save(state);

        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            if (isCurrentWorker(jobId)) fail(jobId, "RETRY_INTERRUPTED");
            return true;
        }

        if (!isCurrentWorker(jobId)) return true;
        state = load(jobId);
        if (state == null) return true;
        if (!"RETRYING".equals(state.getString("state"))) return true;
        state.put("state", "DOWNLOADING");
        state.put("attempts", intValue(state, "attempts") + 1);
        state.put("lastAttemptAt", System.currentTimeMillis());
        state.remove("nextRetryAt");
        state.remove("error");
        state.remove("speedBps");
        save(state);
        download(jobId, urlString, part);
        return true;
    }

    private boolean isRetryableNetworkError(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof SocketTimeoutException
                    || current instanceof ConnectException
                    || current instanceof UnknownHostException
                    || current instanceof SocketException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private long claimWorker(String jobId) {
        long workerToken = workerSequence.incrementAndGet();
        currentWorkerTokens.put(jobId, workerToken);
        return workerToken;
    }

    private boolean isCurrentWorker(String jobId) {
        Long executingToken = executingWorkerToken.get();
        Long currentToken = currentWorkerTokens.get(jobId);
        return executingToken != null && currentToken != null && executingToken.equals(currentToken);
    }

    private boolean isCurrentDownloadState(String jobId) {
        if (!isCurrentWorker(jobId)) return false;
        JSObject state = load(jobId);
        return state != null && "DOWNLOADING".equals(state.getString("state"));
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
        state.remove("speedBps");
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

    private static String normalizeHex(String value) {
        return value == null ? null : value.trim().toLowerCase(Locale.ROOT);
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
