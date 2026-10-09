package com.big.gobrowser.transport

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

/**
 * Native OAuth/PKCE client for the new Metropolis Hub.
 *
 * Authenticates GO at Metropolis, reads existing authorized Observatory Work,
 * and pairs a read-only device rail. The GO OAuth bearer is sent only to Hub;
 * snapshots use the separate, revocable Station credential.
 */
class MetropolisMcpClient(context: Context) {
    data class HubWork(val workId: String, val ownerSystem: String, val authorizedActions: Set<String>)
    data class HubArrival(
        val actor: String,
        val nickname: String,
        val sourceSha: String,
        val observedAt: String,
        val observatoryWorks: List<HubWork>
    )
    data class ObservatoryPair(val deviceId: String, val workId: String, val publishSnapshot: String)

    private data class Pending(val verifier: String, val state: String)

    private val app = context.applicationContext
    private val credential = AndroidDeviceCredentialStore(app, "metropolis-hub-oauth", "metropolis-hub-oauth")
    private val stationCredential = AndroidDeviceCredentialStore(app, "observatory-station-rail", "observatory-station-rail")
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val requestId = AtomicLong(0)
    @Volatile private var pending: Pending? = null

    fun authorizationUrl(): String {
        val verifier = randomToken(48)
        val state = randomToken(32)
        pending = Pending(verifier, state)
        val challenge = base64Url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(StandardCharsets.UTF_8)))
        return Uri.parse("$ISSUER/oauth/authorize").buildUpon()
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("client_id", CLIENT_ID)
            .appendQueryParameter("redirect_uri", REDIRECT_URI)
            .appendQueryParameter("code_challenge", challenge)
            .appendQueryParameter("code_challenge_method", "S256")
            .appendQueryParameter("resource", RESOURCE)
            .appendQueryParameter("scope", "metropolis-go")
            .appendQueryParameter("state", state)
            .build().toString()
    }

    /** Returns true only for the exact callback owned by this client. */
    fun handleCallback(url: String, onComplete: (Result<HubArrival>) -> Unit): Boolean {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return false
        if (uri.scheme != "https" || uri.host != "metropolis.pureekangraw.workers.dev" || uri.path != "/oauth/observatory-callback") return false
        val code = uri.getQueryParameter("code")
        val state = uri.getQueryParameter("state")
        val expected = pending
        pending = null
        if (code.isNullOrBlank() || expected == null || state != expected.state) {
            post(onComplete, Result.failure(IllegalStateException("HUB_OAUTH_STATE_MISMATCH")))
            return true
        }
        io.execute {
            val result = runCatching {
                val tokens = exchangeCode(code, expected.verifier)
                credential.save(tokens.toString())
                val identity = callTool("metropolis_identity", JSONObject())
                val arrival = callTool("metropolis_arrive", JSONObject())
                val profile = identity.optJSONObject("structuredContent") ?: identity.optJSONObject("content") ?: JSONObject()
                val actor = profile.optString("name", "GO")
                val nickname = profile.optString("nickname", "GO — Metropolis")
                val current = arrival.optJSONObject("structuredContent") ?: arrival
                val works = current.optJSONObject("current")?.optJSONArray("works")
                val observatoryWorks = (0 until (works?.length() ?: 0)).mapNotNull { index ->
                    val work = works?.optJSONObject(index) ?: return@mapNotNull null
                    val actions = work.optJSONArray("authorizedActions")
                    val authorized = (0 until (actions?.length() ?: 0))
                        .mapNotNull { actionIndex -> actions?.optString(actionIndex)?.takeIf(String::isNotBlank) }
                        .toSet()
                    if (work.optBoolean("present")
                        && work.optString("ownerSystem") == "OBSERVATORY"
                        && "read" in authorized) {
                        HubWork(work.optString("workId"), "OBSERVATORY", authorized)
                    } else null
                }.filter { it.workId.isNotBlank() }
                HubArrival(actor, nickname, current.optString("sourceSha"), current.optString("observedAt"), observatoryWorks)
            }
            post(onComplete, result)
        }
        return true
    }

    /** Pair only after the existing GO OAuth identity and an authorized OBSERVATORY Work were read from Hub. */
    fun pairObservatory(workId: String, onComplete: (Result<ObservatoryPair>) -> Unit) {
        io.execute {
            val result = runCatching {
                require(workId.isNotBlank()) { "WORK_ID_REQUIRED" }
                val body = JSONObject().put("workId", workId).toString()
                val paired = JSONObject(protectedRequest("$ISSUER/observatory/pair", body))
                val deviceId = paired.getString("deviceId")
                val endpoint = paired.getString("publishSnapshot")
                require(endpoint.startsWith("$ISSUER/observatory/device/$deviceId/")) { "STATION_ENDPOINT_INVALID" }
                require(paired.getString("token").isNotBlank()) { "STATION_CREDENTIAL_MISSING" }
                stationCredential.save(paired.toString())
                ObservatoryPair(deviceId, workId, endpoint)
            }
            post(onComplete, result)
        }
    }

    fun pairedObservatory(): ObservatoryPair? = stationCredential.load()?.let { raw ->
        runCatching {
            val json = JSONObject(raw)
            ObservatoryPair(json.getString("deviceId"), json.getString("workId"), json.getString("publishSnapshot"))
        }.getOrNull()
    }

    /** Publish through the station-only credential; the GO OAuth bearer is never sent to Observatory/device. */
    fun publishSnapshot(view: String, snapshot: JSONObject): JSONObject {
        require(view == "browser" || view == "map") { "VIEW_INVALID" }
        val pairing = stationCredential.load()?.let { JSONObject(it) } ?: throw IllegalStateException("OBSERVATORY_NOT_PAIRED")
        val endpoint = pairing.getString("publishSnapshot")
        require(endpoint == "$ISSUER/observatory/device/${pairing.getString("deviceId")}/snapshot") { "STATION_ENDPOINT_INVALID" }
        val token = pairing.getString("token")
        val body = JSONObject().put("view", view).put("snapshot", snapshot).toString()
        return JSONObject(request(endpoint, "POST", body, token))
    }

    fun disconnect() {
        pending = null
        val station = stationCredential.load()?.let { runCatching { JSONObject(it) }.getOrNull() }
        stationCredential.revoke()
        credential.revoke()
        if (station != null) {
            val endpoint = "$ISSUER/observatory/device/${station.optString("deviceId")}/disconnect"
            val token = station.optString("token")
            io.execute { runCatching { request(endpoint, "POST", "{}", token) } }
        }
    }

    fun close() = io.shutdownNow()

    private fun exchangeCode(code: String, verifier: String): JSONObject =
        formRequest("$ISSUER/oauth/token", mapOf(
            "grant_type" to "authorization_code",
            "client_id" to CLIENT_ID,
            "code" to code,
            "code_verifier" to verifier,
            "redirect_uri" to REDIRECT_URI,
            "resource" to RESOURCE,
        ))

    private fun refresh(refreshToken: String): JSONObject =
        formRequest("$ISSUER/oauth/token", mapOf(
            "grant_type" to "refresh_token",
            "client_id" to CLIENT_ID,
            "refresh_token" to refreshToken,
            "resource" to RESOURCE,
        ))

    private fun callTool(name: String, arguments: JSONObject): JSONObject {
        val current = readTokens() ?: throw IllegalStateException("HUB_NOT_CONNECTED")
        return try {
            rpc(current.getString("access_token"), "tools/call", JSONObject().put("name", name).put("arguments", arguments))
        } catch (error: HubHttpException) {
            if (error.status != 401) throw error
            val refreshToken = current.optString("refresh_token")
            if (refreshToken.isBlank()) throw error
            val renewed = refresh(refreshToken)
            credential.save(renewed.toString())
            rpc(renewed.getString("access_token"), "tools/call", JSONObject().put("name", name).put("arguments", arguments))
        }
    }

    private fun protectedRequest(endpoint: String, body: String): String {
        val current = readTokens() ?: throw IllegalStateException("HUB_NOT_CONNECTED")
        return try {
            request(endpoint, "POST", body, current.getString("access_token"))
        } catch (error: HubHttpException) {
            if (error.status != 401) throw error
            val refreshToken = current.optString("refresh_token")
            if (refreshToken.isBlank()) throw error
            val renewed = refresh(refreshToken)
            credential.save(renewed.toString())
            request(endpoint, "POST", body, renewed.getString("access_token"))
        }
    }

    private fun rpc(token: String, method: String, params: JSONObject): JSONObject {
        val body = JSONObject().put("jsonrpc", "2.0").put("id", requestId.incrementAndGet()).put("method", method).put("params", params)
        val response = request("$ISSUER/mcp", "POST", body.toString(), token)
        val root = JSONObject(response)
        if (root.has("error")) throw IllegalStateException("HUB_RPC_${root.getJSONObject("error").optString("code", "ERROR")}")
        return root.optJSONObject("result") ?: throw IllegalStateException("HUB_RPC_RESULT_MISSING")
    }

    private fun formRequest(endpoint: String, values: Map<String, String>): JSONObject {
        val body = values.entries.joinToString("&") { (key, value) -> "${encode(key)}=${encode(value)}" }
        return JSONObject(request(endpoint, "POST", body, null, "application/x-www-form-urlencoded"))
    }

    private fun request(endpoint: String, method: String, body: String?, token: String?, contentType: String = "application/json"): String {
        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 20_000
            setRequestProperty("Accept", if (endpoint == "$ISSUER/mcp") "application/json, text/event-stream" else "application/json")
            setRequestProperty("Content-Type", contentType)
            setRequestProperty("MCP-Protocol-Version", "2025-06-18")
            token?.let { setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) doOutput = true
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.let { BufferedReader(InputStreamReader(it, StandardCharsets.UTF_8)).use { reader -> reader.readText() } }.orEmpty()
            if (status !in 200..299) throw HubHttpException(status, text.take(200))
            return text
        } finally { connection.disconnect() }
    }

    private fun readTokens(): JSONObject? = credential.load()?.let { runCatching { JSONObject(it) }.getOrNull() }
    private fun <T> post(callback: (Result<T>) -> Unit, result: Result<T>) = main.post { callback(result) }
    private fun encode(value: String) = URLEncoder.encode(value, "UTF-8")
    private fun randomToken(bytes: Int): String = ByteArray(bytes).also(SecureRandom()::nextBytes).let(::base64Url)
    private fun base64Url(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    private class HubHttpException(val status: Int, message: String) : IllegalStateException("HUB_HTTP_$status $message")

    companion object {
        const val ISSUER = "https://metropolis.pureekangraw.workers.dev"
        const val RESOURCE = "$ISSUER/mcp"
        const val CLIENT_ID = "$ISSUER/oauth/observatory-client.json"
        const val REDIRECT_URI = "$ISSUER/oauth/observatory-callback"
    }
}
