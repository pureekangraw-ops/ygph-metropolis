package com.big.gobrowser.browser

import android.webkit.WebSettings
import android.webkit.WebView
import java.net.URI

object BrowserSettings {
    const val START_URL = "https://example.com/"

    fun isAllowedUrl(raw: String): Boolean {
        return runCatching {
            val uri = URI(raw.trim())
            uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()
        }.getOrDefault(false)
    }

    fun configure(webView: WebView) {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            builtInZoomControls = false
            displayZoomControls = false
        }
        webView.settings.safeBrowsingEnabled = true
    }
}
