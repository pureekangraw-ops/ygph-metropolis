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
 * This client only authenticates GO and reads the current Hub identity/arrival
 * snapshot. It deliberately does not invent a browser relay contract; browser
 * Work execution remains blocked until the Hub exposes the corresponding Work
 * grant and readback path.
 */
class MetropolisMcpClient(context: Context) {
    data class HubArrival(val actor: String, val nickname: String, val sourceSha: String, val observedAt: String)

    private data class Pending(val verifier: String, val state: String)

    private val app = context.applicationContext
    private val credential = AndroidDeviceCredentialStore(app, "metropolis-hub-oauth", "metropolis-hub-oauth")
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
                HubArrival(actor, nickname, current.optString("sourceSha"), current.optString("observedAt"))
            }
            post(onComplete, result)
        }
        return true
    }

    fun disconnect() {
        pending = null
        credential.revoke()
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
            setRequestProperty("Accept", "application/json")
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
    private fun post(callback: (Result<HubArrival>) -> Unit, result: Result<HubArrival>) = main.post { callback(result) }
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
