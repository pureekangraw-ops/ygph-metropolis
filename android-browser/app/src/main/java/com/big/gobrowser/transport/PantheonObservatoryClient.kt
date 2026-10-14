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
class PantheonObservatoryClient(context: Context) {
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
        io.execute {
            val result = runCatching {
                val result = JSONObject(StationHttp.request(
                    "$ROOT/pair",
                    body = JSONObject().put("consent", true).put("label", "YGG Observatory Android"),
                    token = ownerToken
                ))
                require(result.optString("scope") == "observatory:observe-only") { "PANTHEON_SCOPE_MISMATCH" }
                val token = result.getString("deviceToken")
                val id = result.getString("deviceId")
                require(token.matches(Regex("[0-9a-f]{64}"))) { "DEVICE_TOKEN_INVALID" }
                require(id.matches(Regex("obs_[0-9a-f]{32}"))) { "DEVICE_ID_INVALID" }
                credentials.save(token)
                require(credentials.load() == token) { "DEVICE_CREDENTIAL_READBACK_FAILED" }
                check(preferences.edit().putString("deviceId", id).commit()) { "DEVICE_ID_WRITE_FAILED" }
                id
            }
            main.post { onDone(result) }
        }
    }

    fun publishSnapshot(view: String, snapshot: JSONObject): JSONObject {
        require(view == "browser" || view == "map") { "INVALID_VIEW" }
        val token = requireNotNull(credentials.load()) { "PANTHEON_NOT_PAIRED" }
        return JSONObject(StationHttp.request("$ROOT/snapshot",
            body = JSONObject().put("view", view).put("snapshot", snapshot),
            token = token))
    }

    fun stopObservation(view: String, epoch: Long) {
        if (!isPaired() || epoch <= 0L) return
        io.execute {
            runCatching {
                StationHttp.request("$ROOT/stop", body = JSONObject()
                    .put("view", view).put("epoch", epoch),
                    token = requireNotNull(credentials.load()))
            }
        }
    }

    fun disconnect(onDone: (Result<Unit>) -> Unit) {
        io.execute {
            val result = runCatching {
                if (isPaired()) StationHttp.request("$ROOT/disconnect",
                    body = JSONObject(), token = requireNotNull(credentials.load()))
                credentials.revoke()
                preferences.edit().remove("deviceId").apply()
            }
            main.post { onDone(result) }
        }
    }

    fun close() { io.shutdown() }

    companion object {
        const val ROOT = "https://phatheon-workhub.pureekangraw.workers.dev/v1/observatory"
    }
}
