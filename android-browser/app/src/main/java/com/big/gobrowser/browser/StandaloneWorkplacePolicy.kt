package com.big.gobrowser.browser

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.util.Base64
import java.util.Locale

/** Narrow URL and file checks for the embedded, local-first Workplace screen. */
internal object StandaloneWorkplacePolicy {
    const val HOST = "factory-district-standalone.pureekangraw.workers.dev"
    const val URL = "https://$HOST/"
    const val MAX_JSON_BYTES = 4 * 1024 * 1024

    fun allowsUrl(raw: String?): Boolean = runCatching {
        val uri = URI(raw?.trim() ?: return false)
        uri.scheme?.lowercase(Locale.ROOT) == "https" &&
            uri.host?.lowercase(Locale.ROOT) == HOST &&
            uri.userInfo == null &&
            (uri.port == -1 || uri.port == 443) &&
            uri.fragment == null
    }.getOrDefault(false)

    fun safeFilename(raw: String?, mimeType: String): String {
        val leaf = raw.orEmpty().substringAfterLast('/').substringAfterLast('\\')
        val safe = leaf.replace(Regex("[^A-Za-z0-9._-]"), "_")
            .trim('.')
            .take(80)
            .ifBlank { "workplace-export" }
        val extension = when (mimeType) {
            "application/json" -> ".json"
            "image/svg+xml" -> ".svg"
            "image/png" -> ".png"
            else -> ".json"
        }
        return if (safe.endsWith(extension, ignoreCase = true)) safe
        else safe.substringBeforeLast('.') + extension
    }

    fun isJsonObjectWithinLimit(raw: String?): Boolean {
        if (raw.isNullOrBlank()) return false
        val bytes = raw.toByteArray(Charsets.UTF_8)
        if (bytes.size > MAX_JSON_BYTES) return false
        return runCatching {
            val tokener = org.json.JSONTokener(raw)
            val value = tokener.nextValue()
            (value is JSONObject || value is JSONArray) && tokener.nextClean() == 0.toChar()
        }.getOrDefault(false)
    }

    fun isSafeSvgWithinLimit(raw: String?): Boolean {
        if (raw.isNullOrBlank() || raw.toByteArray(Charsets.UTF_8).size > MAX_JSON_BYTES) return false
        val trimmed = raw.trimStart()
        val svg = if (trimmed.startsWith("<?xml", ignoreCase = true)) {
            trimmed.substringAfter("?>", "")
        } else trimmed
        if (!svg.trimStart().startsWith("<svg", ignoreCase = true)) return false
        val activeOrExternalContent = Regex(
            "<\\s*(script|foreignObject|iframe|object|embed|audio|video)\\b" +
                "|<!\\s*(DOCTYPE|ENTITY)\\b" +
                "|\\son[a-z]+\\s*=" +
                "|javascript\\s*:" +
                "|@import\\b|expression\\s*\\(" +
                "|url\\(\\s*(?!#)" +
                "|(?:href|src)\\s*=\\s*['\"]\\s*(?!#)",
            RegexOption.IGNORE_CASE
        )
        return !activeOrExternalContent.containsMatchIn(svg)
    }

    fun decodePngWithinLimit(base64: String?): ByteArray? = runCatching {
        if (base64.isNullOrBlank() || base64.length > MAX_JSON_BYTES * 2) return null
        val bytes = Base64.getDecoder().decode(base64)
        val signature = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
        if (bytes.size > MAX_JSON_BYTES || bytes.size < signature.size ||
            !bytes.copyOfRange(0, signature.size).contentEquals(signature)
        ) return null
        bytes
    }.getOrNull()
}