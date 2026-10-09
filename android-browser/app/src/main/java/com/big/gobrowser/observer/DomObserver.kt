package com.big.gobrowser.observer

import java.util.UUID

/** Native-side snapshot builder. WebView collection is initiated by the app, never by page content. */
class DomObserver(
    private val deviceId: String,
    private val appVersion: String,
    private val clock: () -> Long = { System.currentTimeMillis() }
) {
    private var sequence = 0L
    private var revision = 0L
    private var previousFingerprint: String? = null

    fun capture(tabId: String, url: String, title: String, text: String, targets: List<Target>, captureId: String? = null): Snapshot {
        val sanitizedUrl = sanitizeUrl(url)
        val (boundedText, truncated) = truncateUtf8(text)
        val fingerprint = listOf(sanitizedUrl, title, boundedText, targets).toString()
        if (fingerprint != previousFingerprint) {
            revision += 1
            previousFingerprint = fingerprint
        }
        sequence += 1
        return Snapshot(deviceId, tabId, captureId ?: UUID.randomUUID().toString(), revision, sequence, clock(), appVersion, url = sanitizedUrl, title = title, text = boundedText, targets = targets, truncated = truncated)
    }
}
