package com.yggdrasil.prism;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Scoped observer credential only; never stores an owner or server passcode. */
public final class PrismObserverCredentials {
  private static final String ALIAS="prism_observer_token_v1";
  private static final String ORIGIN="https://ergasterion-factory.pureekangraw.workers.dev";
  private final SharedPreferences prefs;
  public PrismObserverCredentials(Context context){prefs=context.getSharedPreferences("prism_page_observer",Context.MODE_PRIVATE);}
  private SecretKey key() throws Exception {
    KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
    if(store.containsAlias(ALIAS))return (SecretKey)store.getKey(ALIAS,null);
    KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
    return generator.generateKey();
  }
  public synchronized void configure(String raw) throws Exception {
    JSONObject value=new JSONObject(raw),work=value.optJSONObject("workContext");long now=System.currentTimeMillis();
    if(!"PRISM_OBSERVER_BOOTSTRAP_V1".equals(value.optString("schemaVersion"))||!ORIGIN.equals(value.optString("factoryOrigin"))||!"PRISM_BROWSER".equals(value.optString("source"))||!"0.3.1".equals(value.optString("observerVersion"))||work==null||work.optString("workId").isEmpty()||work.optString("checkpointId").isEmpty()||value.optString("sessionId").isEmpty()||value.optString("adapterId").isEmpty()||value.optString("sessionToken").length()<32||value.optLong("expiresAt")<=now||value.optLong("expiresAt")>now+86400000L||value.optBoolean("createsAuthority",true))throw new Exception("PRISM_OBSERVER_BOOTSTRAP_INVALID");
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
    byte[] encrypted=cipher.doFinal(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    if(!prefs.edit().clear().putString("ciphertext",Base64.encodeToString(encrypted,Base64.NO_WRAP)).putString("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).putLong("sequence",0).putLong("expiresAt",value.optLong("expiresAt")).putString("state","CAPTURE_PENDING").commit())throw new Exception("PRISM_OBSERVER_STORE_FAILED");
  }
  public synchronized JSONObject load() throws Exception {
    String raw=prefs.getString("ciphertext","");if(raw.isEmpty())return null;
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(prefs.getString("iv",""),Base64.NO_WRAP)));
    return new JSONObject(new String(cipher.doFinal(Base64.decode(raw,Base64.NO_WRAP)),java.nio.charset.StandardCharsets.UTF_8));
  }
  public synchronized long nextSequence() throws Exception {long next=prefs.getLong("sequence",0)+1;if(!prefs.edit().putLong("sequence",next).commit())throw new Exception("PRISM_SEQUENCE_STORE_FAILED");return next;}
  public synchronized void clear(){prefs.edit().clear().putString("state","PAIRING_REQUIRED").commit();}
  public SharedPreferences status(){return prefs;}
}
