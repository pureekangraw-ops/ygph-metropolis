package com.big.gobrowser.transport

import android.content.Context
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Device credential boundary. The token never enters logs or snapshots. */
interface DeviceCredentialStore {
    fun save(token: String)
    fun load(): String?
    fun revoke()
}

class AndroidDeviceCredentialStore(context: Context) : DeviceCredentialStore {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

    override fun save(token: String) {
        require(token.isNotBlank()) { "Credential must not be blank" }
        val iv = ByteArray(12).also(SecureRandom()::nextBytes)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, key(), GCMParameterSpec(128, iv))
        }
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        preferences.edit()
            .putString(IV_KEY, Base64.encodeToString(iv, Base64.NO_WRAP))
            .putString(DATA_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .apply()
    }

    override fun load(): String? {
        val iv = preferences.getString(IV_KEY, null)?.let { Base64.decode(it, Base64.NO_WRAP) } ?: return null
        val encrypted = preferences.getString(DATA_KEY, null)?.let { Base64.decode(it, Base64.NO_WRAP) } ?: return null
        return runCatching {
            Cipher.getInstance(TRANSFORMATION).apply {
                init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            }.doFinal(encrypted).toString(Charsets.UTF_8)
        }.getOrNull()
    }

    override fun revoke() {
        preferences.edit().remove(IV_KEY).remove(DATA_KEY).apply()
    }

    private fun key(): SecretKey {
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            KeyGenerator.getInstance("AES", KEYSTORE).apply {
                init(256)
                generateKey()
            }
        }
        return (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)
            ?: throw IllegalStateException("Device credential key unavailable")
    }

    companion object {
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "go-browser-relay-credential"
        private const val PREFERENCES = "relay-credential"
        private const val IV_KEY = "iv"
        private const val DATA_KEY = "ciphertext"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
