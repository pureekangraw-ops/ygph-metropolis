package com.big.gobrowser.observer

import java.net.URI
import java.nio.charset.StandardCharsets

const val SNAPSHOT_SCHEMA = "observer.snapshot.v1"
const val SNAPSHOT_TEXT_LIMIT_BYTES = 32 * 1024

data class Target(
    val id: String,
    val role: String?,
    val label: String?,
    val kind: String,
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int
)

data class Snapshot(
    val deviceId: String,
    val tabId: String,
    val captureId: String,
    val revision: Long,
    val sequence: Long,
    val capturedAtEpochMs: Long,
    val appVersion: String,
    val schema: String = SNAPSHOT_SCHEMA,
    val url: String,
    val title: String,
    val text: String,
    val targets: List<Target>,
    val truncated: Boolean
)

fun sanitizeUrl(raw: String): String = runCatching {
    val uri = URI(raw)
    URI(uri.scheme, uri.authority, uri.path, null, null).toString()
}.getOrDefault("")

fun truncateUtf8(raw: String, maxBytes: Int = SNAPSHOT_TEXT_LIMIT_BYTES): Pair<String, Boolean> {
    require(maxBytes > 0)
    if (raw.toByteArray(StandardCharsets.UTF_8).size <= maxBytes) return raw to false
    val result = StringBuilder()
    var used = 0
    var index = 0
    while (index < raw.length) {
        val codePoint = raw.codePointAt(index)
        val charCount = Character.charCount(codePoint)
        val codePointBytes = String(Character.toChars(codePoint)).toByteArray(StandardCharsets.UTF_8).size
        if (used + codePointBytes > maxBytes) break
        result.appendCodePoint(codePoint)
        used += codePointBytes
        index += charCount
    }
    return result.toString() to true
}
