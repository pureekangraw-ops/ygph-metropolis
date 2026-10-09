package com.big.gobrowser.browser

import java.net.URI

object UrlPolicy {
    fun isAllowed(raw: String): Boolean = runCatching {
        val uri = URI(raw.trim())
        uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()
    }.getOrDefault(false)
}
