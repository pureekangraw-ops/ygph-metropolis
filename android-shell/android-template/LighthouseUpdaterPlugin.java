package com.yggdrasil.lighthouse;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;

@CapacitorPlugin(name = "LighthouseUpdater")
public class LighthouseUpdaterPlugin extends Plugin {
    private static final String PREFS = "lighthouse_updater_state";
    private static final String FILE_NAME = "lighthouse-update.apk";
    private static final String STATE = "state";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private DownloadManager downloads() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    private File stagedFile() {
        return new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), FILE_NAME);
    }

    private void setState(String state) {
        prefs().edit().putString(STATE, state).apply();
    }

    private long installedVersionCode(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return info.getLongVersionCode();
        return info.versionCode;
    }

    private PackageInfo packageInfo(String packageName) throws Exception {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        return getContext().getPackageManager().getPackageInfo(packageName, flags);
    }

    private PackageInfo archiveInfo(File file) {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        return getContext().getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), flags);
    }

    private Signature firstSignature(PackageInfo info) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) throw new Exception("signer-missing");
            Signature[] signers = info.signingInfo.hasMultipleSigners()
                ? info.signingInfo.getApkContentsSigners()
                : info.signingInfo.getSigningCertificateHistory();
            if (signers == null || signers.length == 0) throw new Exception("signer-missing");
            return signers[0];
        }
        if (info.signatures == null || info.signatures.length == 0) throw new Exception("signer-missing");
        return info.signatures[0];
    }

    private String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) out.append(String.format("%02x", value));
        return out.toString();
    }

    private String signerSha256(PackageInfo info) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return hex(digest.digest(firstSignature(info).toByteArray()));
    }

    private String fileSha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) > 0) digest.update(buffer, 0, read);
        }
        return hex(digest.digest());
    }

    private JSObject installedIdentity() throws Exception {
        String packageName = getContext().getPackageName();
        PackageInfo info = packageInfo(packageName);
        JSObject result = new JSObject();
        result.put("packageName", packageName);
        result.put("versionName", info.versionName == null ? "" : info.versionName);
        result.put("versionCode", installedVersionCode(info));
        result.put("signerSha256", signerSha256(info));
        return result;
    }

    private JSObject candidateObject() {
        SharedPreferences p = prefs();
        String packageName = p.getString("packageName", null);
        if (packageName == null) return null;
        JSObject candidate = new JSObject();
        candidate.put("versionName", p.getString("versionName", ""));
        candidate.put("versionCode", p.getLong("versionCode", 0));
        candidate.put("packageName", packageName);
        candidate.put("apkUrl", p.getString("apkUrl", ""));
        candidate.put("sha256", p.getString("sha256", ""));
        candidate.put("sizeBytes", p.getLong("sizeBytes", 0));
        candidate.put("releaseNotes", p.getString("releaseNotes", ""));
        return candidate;
    }

    private void persistCandidate(PluginCall call) {
        prefs().edit()
            .putString("versionName", call.getString("versionName", ""))
            .putLong("versionCode", call.getLong("versionCode", 0L))
            .putString("packageName", call.getString("packageName", ""))
            .putString("apkUrl", call.getString("apkUrl", ""))
            .putString("sha256", call.getString("sha256", ""))
            .putLong("sizeBytes", call.getLong("sizeBytes", 0L))
            .putString("releaseNotes", call.getString("releaseNotes", ""))
            .apply();
    }

    private void deleteStagedFile() {
        File file = stagedFile();
        if (file.exists()) file.delete();
    }

    private JSObject failure(String reason, String message, boolean deleteFile) {
        if (deleteFile) deleteStagedFile();
        prefs().edit().putString(STATE, "Failed").putString("failureReason", reason).putString("failureMessage", message).apply();
        JSObject result = new JSObject();
        result.put("ok", false);
        result.put("state", "Failed");
        result.put("reason", reason);
        result.put("message", message);
        JSObject candidate = candidateObject();
        if (candidate != null) result.put("candidate", candidate);
        return result;
    }

    private JSObject verifyCurrent() {
        File file = stagedFile();
        SharedPreferences p = prefs();
        try {
            if (!file.exists() || file.length() <= 0) return failure("file-missing", "ไม่พบไฟล์อัปเดตที่ดาวน์โหลดไว้", true);
            String expectedSha = p.getString("sha256", "");
            if (!fileSha256(file).equalsIgnoreCase(expectedSha)) return failure("sha256-mismatch", "ไฟล์อัปเดตเสียหรือไม่ตรงกับต้นทาง", true);

            PackageInfo archive = archiveInfo(file);
            if (archive == null) return failure("apk-invalid", "Android อ่านไฟล์อัปเดตนี้ไม่ได้", true);
            String expectedPackage = p.getString("packageName", "");
            if (!expectedPackage.equals(archive.packageName)) return failure("package-mismatch", "ไฟล์อัปเดตเป็นคนละแอปกับ LIGHTHOUSE", true);

            long expectedVersionCode = p.getLong("versionCode", 0);
            long archiveVersionCode = installedVersionCode(archive);
            JSObject current = installedIdentity();
            long currentVersionCode = current.getLong("versionCode");
            if (archiveVersionCode != expectedVersionCode || archiveVersionCode <= currentVersionCode) {
                return failure("version-not-newer", "รุ่นในไฟล์อัปเดตไม่ได้ใหม่กว่ารุ่นที่ติดตั้งอยู่", true);
            }

            String archiveSigner = signerSha256(archive);
            String installedSigner = current.getString("signerSha256");
            if (!archiveSigner.equalsIgnoreCase(installedSigner)) return failure("signer-mismatch", "ไฟล์อัปเดตไม่ได้มาจากผู้ลงนามเดิม", true);

            setState("Ready to install");
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("state", "Ready to install");
            result.put("packageName", archive.packageName);
            result.put("versionCode", archiveVersionCode);
            result.put("versionName", archive.versionName == null ? "" : archive.versionName);
            result.put("signerSha256", archiveSigner);
            result.put("candidate", candidateObject());
            return result;
        } catch (Exception error) {
            return failure("verification-error", "ตรวจไฟล์อัปเดตไม่สำเร็จ", true);
        }
    }

    private JSObject enqueueFromPrefs(String initialState) throws Exception {
        SharedPreferences p = prefs();
        String url = p.getString("apkUrl", "");
        if (url.isEmpty()) throw new Exception("download-url-missing");
        deleteStagedFile();
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setAllowedOverMetered(true);
        request.setAllowedOverRoaming(true);
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, FILE_NAME);
        long downloadId = downloads().enqueue(request);
        prefs().edit().putLong("downloadId", downloadId).putString(STATE, initialState).putBoolean("installAttempted", false).apply();
        JSObject result = new JSObject();
        result.put("state", initialState);
        result.put("downloadId", downloadId);
        result.put("downloadedBytes", 0);
        long size = p.getLong("sizeBytes", -1);
        result.put("totalBytes", size > 0 ? size : -1);
        result.put("candidate", candidateObject());
        return result;
    }

    @PluginMethod
    public void getInstalledIdentity(PluginCall call) {
        try {
            call.resolve(installedIdentity());
        } catch (Exception error) {
            call.reject("installed-identity-unavailable", error);
        }
    }

    @PluginMethod
    public void enqueueDownload(PluginCall call) {
        try {
            String url = call.getString("apkUrl", "");
            if (!url.startsWith("https://")) {
                call.reject("download-url-invalid");
                return;
            }
            persistCandidate(call);
            call.resolve(enqueueFromPrefs("Downloading"));
        } catch (Exception error) {
            setState("Failed");
            call.reject("download-enqueue-failed", error);
        }
    }

    @PluginMethod
    public void readDownloadState(PluginCall call) {
        SharedPreferences p = prefs();
        long downloadId = p.getLong("downloadId", -1L);
        JSObject candidate = candidateObject();
        if (downloadId < 0) {
            JSObject result = new JSObject();
            result.put("state", p.getString(STATE, "idle"));
            result.put("downloadedBytes", 0);
            result.put("totalBytes", -1);
            if (candidate != null) result.put("candidate", candidate);
            result.put("message", p.getString("failureMessage", null));
            call.resolve(result);
            return;
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = downloads().query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.resolve(failure("download-missing", "ไม่พบงานดาวน์โหลดเดิม", false));
                return;
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                setState("Verifying");
                call.resolve(verifyCurrent());
                return;
            }
            String state;
            if (status == DownloadManager.STATUS_PAUSED) state = "Paused";
            else if (status == DownloadManager.STATUS_FAILED) state = "Failed";
            else if (status == DownloadManager.STATUS_PENDING && "Retrying".equals(p.getString(STATE, ""))) state = "Retrying";
            else state = "Downloading";
            setState(state);
            JSObject result = new JSObject();
            result.put("state", state);
            result.put("downloadId", downloadId);
            result.put("downloadedBytes", Math.max(0, downloaded));
            result.put("totalBytes", total > 0 ? total : -1);
            if (candidate != null) result.put("candidate", candidate);
            if (status == DownloadManager.STATUS_FAILED) result.put("message", "ดาวน์โหลดอัปเดตไม่สำเร็จ ลองอีกครั้งได้");
            call.resolve(result);
        } catch (Exception error) {
            call.resolve(failure("download-state-error", "อ่านสถานะดาวน์โหลดไม่สำเร็จ", false));
        }
    }

    @PluginMethod
    public void retryDownload(PluginCall call) {
        try {
            long existing = prefs().getLong("downloadId", -1L);
            if (existing >= 0) downloads().remove(existing);
            call.resolve(enqueueFromPrefs("Retrying"));
        } catch (Exception error) {
            call.reject("download-retry-failed", error);
        }
    }

    @PluginMethod
    public void verifyDownloadedApk(PluginCall call) {
        setState("Verifying");
        call.resolve(verifyCurrent());
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        JSObject result = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void requestInstallPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            JSObject result = new JSObject();
            result.put("opened", false);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(intent);
        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }

    @PluginMethod
    public void installDownloadedApk(PluginCall call) {
        JSObject verified = verifyCurrent();
        if (!verified.getBool("ok", false)) {
            call.resolve(verified);
            return;
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                call.resolve(failure("permission-required", "ยังไม่ได้อนุญาตให้ติดตั้งแอปจากแหล่งนี้", false));
                return;
            }
            File file = stagedFile();
            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".updater.files",
                file
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);
            prefs().edit().putString(STATE, "Installing").putBoolean("installAttempted", true).apply();
            JSObject result = new JSObject();
            result.put("state", "Installing");
            call.resolve(result);
        } catch (Exception error) {
            call.resolve(failure("install-intent-failed", "เปิดหน้าติดตั้งอัปเดตไม่สำเร็จ", false));
        }
    }

    @PluginMethod
    public void reconcileInstalledVersion(PluginCall call) {
        try {
            JSObject current = installedIdentity();
            long target = prefs().getLong("versionCode", 0L);
            boolean attempted = prefs().getBoolean("installAttempted", false);
            if (target > 0 && current.getLong("versionCode") == target) {
                deleteStagedFile();
                prefs().edit().remove("downloadId").putString(STATE, "updated-successfully").putBoolean("installAttempted", false).apply();
                current.put("state", "updated-successfully");
            } else if (attempted) {
                current.put("state", "install-not-completed");
            } else {
                current.put("state", prefs().getString(STATE, "idle"));
            }
            JSObject candidate = candidateObject();
            if (candidate != null) current.put("candidate", candidate);
            call.resolve(current);
        } catch (Exception error) {
            call.reject("installed-readback-failed", error);
        }
    }

    @PluginMethod
    public void cancelUpdate(PluginCall call) {
        boolean permanent = call.getBoolean("permanent", false);
        long downloadId = prefs().getLong("downloadId", -1L);
        if (downloadId >= 0) downloads().remove(downloadId);
        if (permanent) {
            deleteStagedFile();
            prefs().edit().clear().apply();
        } else {
            setState("Paused");
        }
        JSObject result = new JSObject();
        result.put("cancelled", true);
        result.put("permanent", permanent);
        call.resolve(result);
    }
}
