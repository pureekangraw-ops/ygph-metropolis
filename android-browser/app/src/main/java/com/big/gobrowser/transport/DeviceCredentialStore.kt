package com.big.gobrowser.transport

import android.content.Context
import android.util.Base64
import java.security.KeyStore
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Device credential boundary. The token never enters logs or snapshots. */
interface DeviceCredentialStore {
    fun save(token: String)
    fun load(): String?
    fun revoke()
}

data class CredentialSaveReadback(val commitSucceeded: Boolean, val exactReadback: Boolean)

class AndroidDeviceCredentialStore(
    context: Context,
    private val keyAlias: String = KEY_ALIAS,
    preferencesName: String = PREFERENCES
) : DeviceCredentialStore {
    private val preferences = context.applicationContext.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

    override fun save(token: String) {
        require(token.isNotBlank()) { "Credential must not be blank" }
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, key())
        }
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        preferences.edit()
            .putString(IV_KEY, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(DATA_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .apply()
    }

    /** Persist synchronously and verify the encrypted payload can be read back without exposing it. */
    fun saveAndVerify(token: String): CredentialSaveReadback {
        require(token.isNotBlank()) { "Credential must not be blank" }
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, key())
        }
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        val committed = preferences.edit()
            .putString(IV_KEY, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(DATA_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .commit()
        val exactReadback = runCatching { load() == token }.getOrDefault(false)
        return CredentialSaveReadback(committed, exactReadback)
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
        if (keyStore.containsAlias(keyAlias)) keyStore.deleteEntry(keyAlias)
    }

    private fun key(): SecretKey {
        if (!keyStore.containsAlias(keyAlias)) {
            KeyGenerator.getInstance("AES", KEYSTORE).apply {
                init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setKeySize(256)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build())
                generateKey()
            }
        }
        return (keyStore.getKey(keyAlias, null) as? SecretKey)
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
