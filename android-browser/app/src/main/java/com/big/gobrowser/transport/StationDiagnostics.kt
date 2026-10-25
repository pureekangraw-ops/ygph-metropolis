package com.big.gobrowser.transport

import java.io.InputStream
import org.json.JSONObject

class StationFailure(val httpStatus: Int, val code: String, val requestId: String?, val correlationConfirmed: Boolean = false) :
    IllegalStateException(code)

object StationDiagnostics {
    private val codes = setOf("UNAUTHORIZED", "OWNER_ONLY", "NOT_CONFIGURED", "SESSION_NOT_STARTED",
        "SESSION_UNAVAILABLE", "SESSION_CLEANUP_FAILED", "EXACT_PAGE_UNAVAILABLE", "LIVE_VIEW_CDP_UNAVAILABLE",
        "LIVE_VIEW_PROVIDER_ERROR", "LIVE_VIEW_UNAVAILABLE", "BUSY", "NOT_FOUND")
    fun safeCode(value: String): String? = value.takeIf { it in codes }
    fun requestId(value: String?): String? = value?.takeIf {
        it.matches(Regex("[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}"))
    }
    fun readBounded(input: InputStream, limit: Int): String {
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(1024)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            require(out.size() + n <= limit) { "STATION_RESPONSE_TOO_LARGE" }
            out.write(buffer, 0, n)
        }
        return out.toString("UTF-8")
    }
    fun failure(status: Int, input: InputStream?, id: String?, confirmed: Boolean = false): StationFailure {
        val code = runCatching {
            input?.use { safeCode(JSONObject(readBounded(it, 4096)).optString("error")) }
        }.getOrNull() ?: "STATION_HTTP_$status"
        return StationFailure(status, code, requestId(id), confirmed)
    }
    fun diagnosticKey(path: String): String = when(path) {
        "/v1/view" -> "browser-view"
        "/v1/session" -> "browser-session"
        else -> "browser-command"
    }
    fun safeFailure(t: Throwable): String = when(t) {
        is StationFailure -> t.code
        else -> safeCode(t.message.orEmpty()) ?: "STATION_REQUEST_FAILED"
    }
}
