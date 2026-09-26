package com.yggdrasil.lighthouse;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.zip.GZIPInputStream;

@CapacitorPlugin(name = "LighthouseRideMap")
public class LighthouseRideMapPlugin extends Plugin {
  private static final String PREFS = "lighthouse_ride_map";
  private static final String ACTIVE_FILE = "active.pmtiles";
  private static final int PMTILES_HEADER_SIZE = 127;

  private File mapsRoot() {
    return new File(getContext().getFilesDir(), "maps");
  }

  private File activeFile() {
    return new File(mapsRoot(), ACTIVE_FILE);
  }

  private SharedPreferences prefs() {
    return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  private static String clean(String value) {
    return value == null ? "" : value.trim();
  }

  private static String hex(byte[] value) {
    StringBuilder out = new StringBuilder(value.length * 2);
    for (byte item : value) out.append(String.format(Locale.US, "%02x", item & 0xff));
    return out.toString();
  }

  private static double e7(int value) {
    return ((double) value) / 10_000_000d;
  }

  private String displayName(Uri uri) {
    String value = null;
    try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
      if (cursor != null && cursor.moveToFirst()) {
        int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
        if (index >= 0) value = cursor.getString(index);
      }
    } catch (Exception ignored) {}
    if (clean(value).isEmpty()) {
      String segment = uri.getLastPathSegment();
      value = clean(segment).isEmpty() ? "local-map.pmtiles" : segment;
    }
    return value;
  }

  private static byte[] inflateMetadata(byte[] raw, int compression) throws Exception {
    if (compression == 1) return raw;
    if (compression != 2) throw new Exception("LOCAL_MAP_INTERNAL_COMPRESSION_UNSUPPORTED:" + compression);
    try (
      GZIPInputStream input = new GZIPInputStream(new ByteArrayInputStream(raw));
      ByteArrayOutputStream output = new ByteArrayOutputStream()
    ) {
      byte[] buffer = new byte[8192];
      int read;
      while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
      return output.toByteArray();
    }
  }

  private static final class PackageMetadata {
    String fileName;
    String region;
    String version;
    String sha256;
    String attribution;
    long byteLength;
    int minZoom;
    int maxZoom;
    double minLon;
    double minLat;
    double maxLon;
    double maxLat;

    JSObject toJson(String state) {
      JSObject out = new JSObject();
      out.put("packageState", state);
      out.put("fileName", fileName);
      out.put("region", region);
      out.put("packageVersion", version);
      out.put("sha256", sha256);
      out.put("byteLength", byteLength);
      out.put("attribution", attribution);
      out.put("minZoom", minZoom);
      out.put("maxZoom", maxZoom);
      JSObject bounds = new JSObject();
      bounds.put("minLon", minLon);
      bounds.put("minLat", minLat);
      bounds.put("maxLon", maxLon);
      bounds.put("maxLat", maxLat);
      out.put("bounds", bounds);
      return out;
    }
  }

  private PackageMetadata inspectPackage(File file, String originalName, String sha256, long byteLength) throws Exception {
    if (byteLength < PMTILES_HEADER_SIZE) throw new Exception("LOCAL_MAP_PM_TILES_TOO_SMALL");
    byte[] header = new byte[PMTILES_HEADER_SIZE];
    byte[] metadataBytes;

    try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
      input.readFully(header);
      byte[] magic = "PMTiles".getBytes(StandardCharsets.US_ASCII);
      for (int i = 0; i < magic.length; i++) {
        if (header[i] != magic[i]) throw new Exception("LOCAL_MAP_PM_TILES_MAGIC_INVALID");
      }
      int version = header[7] & 0xff;
      if (version != 3) throw new Exception("LOCAL_MAP_PM_TILES_VERSION_UNSUPPORTED:" + version);

      ByteBuffer buffer = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
      long metadataOffset = buffer.getLong(24);
      long metadataLength = buffer.getLong(32);
      if (metadataOffset < PMTILES_HEADER_SIZE || metadataLength <= 0 || metadataLength > 4L * 1024L * 1024L ||
          metadataOffset > byteLength - metadataLength) {
        throw new Exception("LOCAL_MAP_PM_TILES_METADATA_RANGE_INVALID");
      }

      int internalCompression = header[97] & 0xff;
      int tileType = header[99] & 0xff;
      if (tileType != 1) throw new Exception("LOCAL_MAP_PM_TILES_VECTOR_REQUIRED");

      metadataBytes = new byte[(int) metadataLength];
      input.seek(metadataOffset);
      input.readFully(metadataBytes);

      PackageMetadata result = new PackageMetadata();
      result.fileName = originalName;
      result.sha256 = sha256;
      result.byteLength = byteLength;
      result.version = sha256.substring(0, 12);
      result.minZoom = header[100] & 0xff;
      result.maxZoom = header[101] & 0xff;
      result.minLon = e7(buffer.getInt(102));
      result.minLat = e7(buffer.getInt(106));
      result.maxLon = e7(buffer.getInt(110));
      result.maxLat = e7(buffer.getInt(114));

      byte[] decoded = inflateMetadata(metadataBytes, internalCompression);
      JSONObject metadata = new JSONObject(new String(decoded, StandardCharsets.UTF_8));
      result.attribution = clean(metadata.optString("attribution", ""));
      if (result.attribution.isEmpty()) throw new Exception("LOCAL_MAP_ATTRIBUTION_REQUIRED");
      result.region = clean(metadata.optString("name", ""));
      if (result.region.isEmpty()) {
        String base = originalName.replaceFirst("(?i)\\.pmtiles$", "").trim();
        result.region = base.isEmpty() ? "Local map" : base;
      }
      return result;
    }
  }

  private PackageMetadata copyValidateAndActivate(Uri uri) throws Exception {
    String name = displayName(uri);
    if (!name.toLowerCase(Locale.US).endsWith(".pmtiles")) throw new Exception("LOCAL_MAP_FILE_EXTENSION_INVALID");

    File root = mapsRoot();
    if (!root.isDirectory() && !root.mkdirs()) throw new Exception("LOCAL_MAP_MANAGED_ROOT_CREATE_FAILED");
    File staged = new File(root, ".staging-" + System.currentTimeMillis() + ".pmtiles");

    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    long byteLength = 0L;
    try (
      InputStream input = getContext().getContentResolver().openInputStream(uri);
      FileOutputStream output = new FileOutputStream(staged, false)
    ) {
      if (input == null) throw new Exception("LOCAL_MAP_IMPORT_STREAM_UNAVAILABLE");
      byte[] buffer = new byte[64 * 1024];
      int read;
      while ((read = input.read(buffer)) != -1) {
        output.write(buffer, 0, read);
        digest.update(buffer, 0, read);
        byteLength += read;
      }
      output.getFD().sync();
    } catch (Exception error) {
      staged.delete();
      throw error;
    }

    String sha256 = hex(digest.digest());
    PackageMetadata metadata;
    try {
      metadata = inspectPackage(staged, name, sha256, byteLength);
    } catch (Exception error) {
      staged.delete();
      throw error;
    }

    File active = activeFile();
    File backup = new File(root, ACTIVE_FILE + ".bak");
    backup.delete();
    boolean hadActive = active.isFile();
    if (hadActive && !active.renameTo(backup)) {
      staged.delete();
      throw new Exception("LOCAL_MAP_ACTIVE_BACKUP_FAILED");
    }

    if (!staged.renameTo(active)) {
      if (hadActive) backup.renameTo(active);
      staged.delete();
      throw new Exception("LOCAL_MAP_ATOMIC_ACTIVATE_FAILED");
    }

    SharedPreferences.Editor editor = prefs().edit().clear()
      .putString("state", "ACTIVE")
      .putString("fileName", metadata.fileName)
      .putString("region", metadata.region)
      .putString("version", metadata.version)
      .putString("sha256", metadata.sha256)
      .putString("attribution", metadata.attribution)
      .putLong("byteLength", metadata.byteLength)
      .putInt("minZoom", metadata.minZoom)
      .putInt("maxZoom", metadata.maxZoom)
      .putString("minLon", Double.toString(metadata.minLon))
      .putString("minLat", Double.toString(metadata.minLat))
      .putString("maxLon", Double.toString(metadata.maxLon))
      .putString("maxLat", Double.toString(metadata.maxLat));

    if (!editor.commit()) {
      active.delete();
      if (hadActive) backup.renameTo(active);
      throw new Exception("LOCAL_MAP_METADATA_ACTIVATE_FAILED");
    }
    backup.delete();
    return metadata;
  }

  private JSObject recoveryStatus(String reason) {
    JSObject out = new JSObject();
    out.put("packageState", "RECOVERY_REQUIRED");
    out.put("recoveryReason", reason);
    return out;
  }

  private boolean activeHeaderLooksValid(File active) {
    if (!active.isFile() || active.length() < PMTILES_HEADER_SIZE) return false;
    try (RandomAccessFile input = new RandomAccessFile(active, "r")) {
      byte[] prefix = new byte[8];
      input.readFully(prefix);
      byte[] magic = "PMTiles".getBytes(StandardCharsets.US_ASCII);
      for (int i = 0; i < magic.length; i++) if (prefix[i] != magic[i]) return false;
      return (prefix[7] & 0xff) == 3;
    } catch (Exception ignored) {
      return false;
    }
  }

  private JSObject status() {
    File active = activeFile();
    SharedPreferences store = prefs();
    String state = clean(store.getString("state", ""));

    if (!active.isFile()) {
      if ("ACTIVE".equals(state)) return recoveryStatus("ACTIVE_FILE_MISSING");
      JSObject out = new JSObject();
      out.put("packageState", "MISSING");
      return out;
    }

    String sha256 = clean(store.getString("sha256", ""));
    String attribution = clean(store.getString("attribution", ""));
    long expectedBytes = store.getLong("byteLength", -1L);
    if (!"ACTIVE".equals(state) || sha256.isEmpty() || attribution.isEmpty() || expectedBytes <= 0L) {
      return recoveryStatus("ACTIVE_METADATA_MISSING");
    }
    if (active.length() != expectedBytes) return recoveryStatus("ACTIVE_FILE_SIZE_MISMATCH");
    if (!activeHeaderLooksValid(active)) return recoveryStatus("ACTIVE_HEADER_INVALID");

    JSObject out = new JSObject();
    out.put("packageState", "ACTIVE");
    out.put("fileName", store.getString("fileName", ACTIVE_FILE));
    out.put("region", store.getString("region", "Local map"));
    out.put("packageVersion", store.getString("version", ""));
    out.put("sha256", store.getString("sha256", ""));
    out.put("byteLength", store.getLong("byteLength", active.length()));
    out.put("attribution", store.getString("attribution", ""));
    out.put("minZoom", store.getInt("minZoom", 0));
    out.put("maxZoom", store.getInt("maxZoom", 0));
    JSObject bounds = new JSObject();
    bounds.put("minLon", Double.parseDouble(store.getString("minLon", "0")));
    bounds.put("minLat", Double.parseDouble(store.getString("minLat", "0")));
    bounds.put("maxLon", Double.parseDouble(store.getString("maxLon", "0")));
    bounds.put("maxLat", Double.parseDouble(store.getString("maxLat", "0")));
    out.put("bounds", bounds);
    return out;
  }

  private static double coordinate(JSObject point, String key) throws Exception {
    if (point == null || !point.has(key)) throw new Exception("LIGHTHOUSE_RIDE_MAP_GEOGRAPHY_REQUIRED");
    double value = point.optDouble(key, Double.NaN);
    if (!Double.isFinite(value)) throw new Exception("LIGHTHOUSE_RIDE_MAP_GEOGRAPHY_REQUIRED");
    return value;
  }

  private void putPoint(Intent intent, String prefix, JSObject point) throws Exception {
    if (point == null) return;
    double lat = coordinate(point, "lat");
    double lng = coordinate(point, "lng");
    if (lat < -90d || lat > 90d || lng < -180d || lng > 180d) throw new Exception("LIGHTHOUSE_RIDE_MAP_GEOGRAPHY_INVALID");
    intent.putExtra(prefix + "Lat", lat);
    intent.putExtra(prefix + "Lng", lng);
    intent.putExtra(prefix + "Label", clean(point.optString("label", "")));
    intent.putExtra(prefix + "Address", clean(point.optString("address", "")));
  }

  @PluginMethod
  public void getPackageStatus(PluginCall call) {
    call.resolve(status());
  }

  @PluginMethod
  public void importPackage(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("*/*");
    startActivityForResult(call, intent, "handlePackageDocument");
  }

  @ActivityCallback
  private void handlePackageDocument(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
      call.reject("LOCAL_MAP_IMPORT_CANCELLED");
      return;
    }
    try {
      PackageMetadata metadata = copyValidateAndActivate(result.getData().getData());
      call.resolve(metadata.toJson("ACTIVE"));
    } catch (Exception error) {
      call.reject(error.getMessage() == null ? "LOCAL_MAP_IMPORT_FAILED" : error.getMessage());
    }
  }

  @PluginMethod
  public void openMap(PluginCall call) {
    JSObject packageStatus = status();
    if (!"ACTIVE".equals(packageStatus.optString("packageState"))) {
      call.reject("LOCAL_MAP_NOT_INSTALLED");
      return;
    }

    JSObject pickup = call.getObject("pickup");
    JSObject dropoff = call.getObject("dropoff");

    try {
      Intent intent = new Intent(getActivity(), RideMapActivity.class);
      intent.putExtra("packagePath", activeFile().getCanonicalPath());
      intent.putExtra("attribution", packageStatus.optString("attribution", ""));
      intent.putExtra("jobId", clean(call.getString("jobId", "")));
      putPoint(intent, "pickup", pickup);
      putPoint(intent, "dropoff", dropoff);
      getActivity().startActivity(intent);
      JSObject out = new JSObject();
      out.put("status", "OPENED");
      call.resolve(out);
    } catch (Exception error) {
      call.reject(error.getMessage() == null ? "LIGHTHOUSE_RIDE_MAP_OPEN_FAILED" : error.getMessage());
    }
  }

  @PluginMethod
  public void navigate(PluginCall call) {
    JSObject destination = call.getObject("destination");
    try {
      double lat = coordinate(destination, "lat");
      double lng = coordinate(destination, "lng");
      if (lat < -90d || lat > 90d || lng < -180d || lng > 180d) throw new Exception("LIGHTHOUSE_RIDE_MAP_GEOGRAPHY_INVALID");
      Uri uri = Uri.parse("geo:" + lat + "," + lng + "?q=" + lat + "," + lng);
      Intent intent = new Intent(Intent.ACTION_VIEW, uri);
      if (intent.resolveActivity(getContext().getPackageManager()) == null) {
        call.reject("LIGHTHOUSE_RIDE_MAP_NAVIGATION_HANDLER_MISSING");
        return;
      }
      getActivity().startActivity(intent);
      JSObject out = new JSObject();
      out.put("status", "OPENED");
      call.resolve(out);
    } catch (Exception error) {
      call.reject(error.getMessage() == null ? "LIGHTHOUSE_RIDE_MAP_NAVIGATION_FAILED" : error.getMessage());
    }
  }
}
