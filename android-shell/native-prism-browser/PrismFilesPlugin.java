package com.yggdrasil.prism;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@CapacitorPlugin(name = "PrismFiles")
public class PrismFilesPlugin extends Plugin {
  @PluginMethod
  public void saveBackup(PluginCall call) {
    String content = call.getString("content", "");
    if (content.isEmpty()) { call.reject("BACKUP_CONTENT_REQUIRED"); return; }
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("application/json");
    intent.putExtra(Intent.EXTRA_TITLE, call.getString("fileName", "prism-ledger-backup.json"));
    startActivityForResult(call, intent, "onBackupDocument");
  }

  @ActivityCallback
  private void onBackupDocument(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
      call.reject("BACKUP_SAVE_CANCELLED"); return;
    }
    Uri uri = result.getData().getData();
    new Thread(() -> writeBackup(call, uri), "prism-backup-save").start();
  }

  private void writeBackup(PluginCall call, Uri uri) {
    byte[] bytes = call.getString("content", "").getBytes(StandardCharsets.UTF_8);
    try {
      try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
        if (output == null) throw new Exception("BACKUP_OUTPUT_UNAVAILABLE");
        output.write(bytes); output.flush();
      }
      byte[] expected = MessageDigest.getInstance("SHA-256").digest(bytes);
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      long byteLength = 0;
      try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
        if (input == null) throw new Exception("BACKUP_READBACK_UNAVAILABLE");
        byte[] buffer = new byte[65536]; int count;
        while ((count = input.read(buffer)) != -1) { digest.update(buffer, 0, count); byteLength += count; }
      }
      byte[] actual = digest.digest();
      if (byteLength != bytes.length || !MessageDigest.isEqual(expected, actual)) throw new Exception("BACKUP_READBACK_MISMATCH");
      StringBuilder hash = new StringBuilder();
      for (byte item : actual) hash.append(String.format(java.util.Locale.US, "%02x", item & 0xff));
      JSObject receipt = new JSObject();
      receipt.put("status", "SAVED_VERIFIED"); receipt.put("sha256", hash.toString()); receipt.put("byteLength", byteLength);
      call.resolve(receipt);
    } catch (Exception error) { call.reject(error.getMessage() == null ? "BACKUP_SAVE_FAILED" : error.getMessage()); }
  }
}
