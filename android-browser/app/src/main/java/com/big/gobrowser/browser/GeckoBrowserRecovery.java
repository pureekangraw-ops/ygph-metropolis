package com.big.gobrowser.browser;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.mozilla.geckoview.GeckoSession;

/** Private encrypted Gecko session state; never exported as observer evidence. */
final class GeckoBrowserRecovery {
  private static final String ALIAS = "observatory.gecko.recovery.v1";
  private final SharedPreferences prefs;
  GeckoBrowserRecovery(Context context) { prefs = context.getSharedPreferences("observatory-gecko-recovery", Context.MODE_PRIVATE); }
  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
    if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
    return generator.generateKey();
  }
  void write(String id, GeckoSession.SessionState state) {
    if (id == null || state == null) return;
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key()); cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
      byte[] data = cipher.doFinal(state.toString().getBytes(StandardCharsets.UTF_8));
      prefs.edit().putString(id, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(data, Base64.NO_WRAP)).commit();
    } catch (Exception error) { prefs.edit().putString("lastError", "GECKO_RECOVERY_WRITE_FAILED").commit(); }
  }
  GeckoSession.SessionState read(String id) {
    if (id == null || id.isEmpty()) return null;
    try {
      String raw = prefs.getString(id, ""); if (raw.isEmpty()) return null; String[] parts = raw.split(":", 2); if (parts.length != 2) return null;
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))); cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
      return GeckoSession.SessionState.fromString(new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
    } catch (Exception error) { prefs.edit().putString("lastError", "GECKO_RECOVERY_READ_FAILED").commit(); return null; }
  }
  void remove(String id) { if (id != null) prefs.edit().remove(id).commit(); }
}
