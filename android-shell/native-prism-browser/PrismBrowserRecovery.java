package com.yggdrasil.prism;

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

/** Private browser recovery data. Never exposed through the Observer or Hub payload. */
final class PrismBrowserRecovery {
  private static final String ALIAS="prism.browser.recovery.v1";
  private final SharedPreferences prefs;
  PrismBrowserRecovery(Context context){prefs=context.getSharedPreferences("prism_browser_recovery",Context.MODE_PRIVATE);}
  private SecretKey key() throws Exception {
    KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
    if(store.containsAlias(ALIAS))return (SecretKey)store.getKey(ALIAS,null);
    KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
    return generator.generateKey();
  }
  void write(String id,GeckoSession.SessionState state){
    if(id==null||state==null)return;
    try{
      Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
      cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
      byte[] bytes=cipher.doFinal(state.toString().getBytes(StandardCharsets.UTF_8));
      String data=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(bytes,Base64.NO_WRAP);
      prefs.edit().putString(id,data).commit();
    }catch(Exception error){prefs.edit().putString("lastError","BROWSER_RECOVERY_WRITE_FAILED").commit();}
  }
  GeckoSession.SessionState read(String id){
    if(id==null||id.isEmpty())return null;
    try{
      String data=prefs.getString(id,"");if(data.isEmpty())return null;
      String[] parts=data.split(":",2);if(parts.length!=2)return null;
      Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
      cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
      String value=new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);
      return GeckoSession.SessionState.fromString(value);
    }catch(Exception error){prefs.edit().putString("lastError","BROWSER_RECOVERY_READ_FAILED").commit();return null;}
  }
  void remove(String id){if(id!=null)prefs.edit().remove(id).commit();}
}
