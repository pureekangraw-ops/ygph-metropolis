package com.big.gobrowser.browser

import java.net.URI

object UrlPolicy {
    /** Address-bar convenience only; command and transport URLs remain strict. */
    fun resolveAddress(raw: String): String? {
        val input = raw.trim()
        if (isAllowed(input)) return input
        val authority = input.removePrefix("//")
        // A host:port is an address, while http:, javascript:, intent:, etc. are explicit schemes.
        val hasScheme = Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(authority)
        val hasPort = Regex("^(?:localhost|\\[[0-9A-Fa-f:]+\\]|[^/?#:]+\\.[^/?#:]+):[0-9]+(?:[/?#]|$)").containsMatchIn(authority)
        if (input.isEmpty() || (hasScheme && !hasPort)) return null
        return "https://$authority".takeIf(::isAllowed)
    }

    fun isAllowed(raw: String): Boolean = runCatching {
        val uri = URI(raw.trim())
        uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()
    }.getOrDefault(false)
}

