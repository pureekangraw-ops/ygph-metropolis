package com.big.gobrowser.transport

import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import org.json.JSONObject

/**
 * Read-only public Hub health check. These fields describe endpoint response/configuration only;
 * they do not establish an authenticated owner session or provider connectivity.
 */
data class HubHealthSnapshot(
    val service: String,
    val version: String,
    val storageConfigured: Boolean,
    val accessConfigured: Boolean,
    val checkedAt: String
) {
    fun displayText(): String =
        "Hub public /health responded at $checkedAt\n" +
            "Service: $service · version $version\n" +
            "Configuration flags: Storage ${configured(storageConfigured)} · " +
            "Access ${configured(accessConfigured)}\n" +
            "Owner authentication, provider connectivity, pending approvals, and approval state " +
            "are not checked by this request."

    private fun configured(value: Boolean) = if (value) "configured" else "not configured"
}

object HubHealthClient {
    const val HUB_ORIGIN = "https://ygg-connection-hub-v2.pureekangraw.workers.dev"
    const val HUB_UI_URL = "$HUB_ORIGIN/"
    private const val EXPECTED_SERVICE = "ygg-connection-hub-v2"
    private const val MAX_RESPONSE_BYTES = 8 * 1024

    fun check(): HubHealthSnapshot {
        val connection = (URL("$HUB_ORIGIN/health").openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            requestMethod = "GET"
            connectTimeout = 5_000
            readTimeout = 8_000
            setRequestProperty("Accept", "application/json")
        }
        try {
            val responseCode = connection.responseCode
            if (responseCode != HttpURLConnection.HTTP_OK) {
                throw HubHealthFailure("HUB_HTTP_$responseCode")
            }
            val body = connection.inputStream.use { readBounded(it) }
            return parse(body, Instant.now().toString())
        } catch (error: HubHealthFailure) {
            throw error
        } catch (_: Exception) {
            throw HubHealthFailure("HUB_HEALTH_UNAVAILABLE")
        } finally {
            connection.disconnect()
        }
    }

    internal fun parse(body: String, checkedAt: String): HubHealthSnapshot {
        val json = try {
            JSONObject(body)
        } catch (_: Exception) {
            throw HubHealthFailure("HUB_HEALTH_INVALID")
        }
        val service = json.optString("service")
        val version = json.optString("version")
        val storageConfigured = json.opt("storageConfigured") as? Boolean
        val accessConfigured = json.opt("accessConfigured") as? Boolean
        if (service != EXPECTED_SERVICE || version.isBlank() || version.length > 40 ||
            !version.matches(Regex("[A-Za-z0-9._+-]+")) ||
            storageConfigured == null || accessConfigured == null
        ) {
            throw HubHealthFailure("HUB_HEALTH_INVALID")
        }
        return HubHealthSnapshot(
            service = service,
            version = version,
            storageConfigured = storageConfigured,
            accessConfigured = accessConfigured,
            checkedAt = checkedAt
        )
    }

    private fun readBounded(input: java.io.InputStream): String {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(2_048)
        var total = 0
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (total > MAX_RESPONSE_BYTES) throw HubHealthFailure("HUB_HEALTH_TOO_LARGE")
            output.write(buffer, 0, count)
        }
        return output.toString(Charsets.UTF_8.name())
    }
}

class HubHealthFailure(val safeCode: String) : Exception(safeCode)