package com.big.gobrowser.browser

import android.webkit.WebSettings
import android.webkit.WebView

object BrowserSettings {
    const val START_URL = "https://example.com/"

    fun isAllowedUrl(raw: String): Boolean = UrlPolicy.isAllowed(raw)

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
    }
}
