package com.big.gobrowser.transport

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Direct PANTHEON observe-only connection. Owner token is used for one pairing
 * request and never persisted. Device token is encrypted by Android Keystore.
 * No arbitrary MCP tools or browser commands are exposed.
 */
class PantheonObservatoryClient(
    context: Context,
    private val request: (String, JSONObject, String) -> String = { endpoint, body, token ->
        StationHttp.request(endpoint, body = body, token = token)
    }
) {
    private val app = context.applicationContext
    private val credentials = AndroidDeviceCredentialStore(app, "pantheon-observatory-key", "pantheon-observatory-device")
    private val preferences = app.getSharedPreferences("pantheon-observatory-identity", Context.MODE_PRIVATE)
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    fun isPaired(): Boolean = credentials.load()?.matches(Regex("[0-9a-f]{64}")) == true
    fun deviceId(): String? = if (isPaired()) preferences.getString("deviceId", null) else null

    fun pair(ownerToken: String, onDone: (Result<String>) -> Unit) {
        if (ownerToken.length < 32 || ownerToken.length > 256) {
            onDone(Result.failure(IllegalArgumentException("OWNER_TOKEN_INVALID")))
            return
        }
        val pairingGeneration = synchronized(identityLock) { identityGeneration }
        io.execute {
            val result = runCatching {
                val result = JSONObject(request(
                    "$ROOT/pair",
                    JSONObject().put("consent", true).put("label", "YGG Observatory Android"),
                    ownerToken
                ))
                require(result.optString("scope") == "observatory:observe-only") { "PANTHEON_SCOPE_MISMATCH" }
                val token = result.getString("deviceToken")
                val id = result.getString("deviceId")
                require(token.matches(Regex("[0-9a-f]{64}"))) { "DEVICE_TOKEN_INVALID" }
                require(id.matches(Regex("obs_[0-9a-f]{32}"))) { "DEVICE_ID_INVALID" }
                synchronized(identityLock) {
                    check(pairingGeneration == identityGeneration) { "PAIRING_CANCELLED" }
                    credentials.save(token)
                    require(credentials.load() == token) { "DEVICE_CREDENTIAL_READBACK_FAILED" }
                    check(preferences.edit().putString("deviceId", id).commit()) { "DEVICE_ID_WRITE_FAILED" }
                }
                id
            }
            main.post { onDone(result) }
        }
    }

    fun publishSnapshot(view: String, snapshot: JSONObject): JSONObject {
        require(view == "browser" || view == "map") { "INVALID_VIEW" }
        val token = requireNotNull(credentials.load()) { "PANTHEON_NOT_PAIRED" }
        return JSONObject(request("$ROOT/snapshot",
            JSONObject().put("view", view).put("snapshot", EvidenceExport.redactJson(snapshot, token)),
            token))
    }

    fun stopObservation(view: String, epoch: Long) {
        if (!isPaired() || epoch <= 0L) return
        io.execute {
            runCatching {
                request("$ROOT/stop", JSONObject()
                    .put("view", view).put("epoch", epoch),
                    requireNotNull(credentials.load()))
            }
        }
    }

    /** Local revocation is synchronous and does not depend on server availability. */
    fun disconnect(onDone: (Result<Unit>) -> Unit) {
        var token: String? = null
        val local = runCatching {
            synchronized(identityLock) {
                identityGeneration += 1L
                token = credentials.load()
                credentials.revoke()
                check(preferences.edit().remove("deviceId").commit()) { "DEVICE_ID_REMOVE_FAILED" }
            }
        }
        if (local.isFailure) { onDone(local); return }
        io.execute {
            val result = runCatching {
                token?.let { request("$ROOT/disconnect", JSONObject(), it) }
                Unit
            }
            main.post { onDone(result) }
        }
    }

    fun close() { io.shutdown() }

    companion object {
        private val identityLock = Any()
        private var identityGeneration = 0L
        const val ROOT = "https://phatheon-workhub.pureekangraw.workers.dev/v1/observatory"
    }
}

