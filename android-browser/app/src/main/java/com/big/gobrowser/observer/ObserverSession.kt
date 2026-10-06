package com.big.gobrowser.observer

class ObserverSession(
    private val deviceId: String,
    private val appVersion: String,
    private val clock: () -> Long = { System.currentTimeMillis() }
) {
    private val observer = DomObserver(deviceId, appVersion, clock)
    private var sharedTabId: String? = null
    private var lastCaptureAt: Long? = null
    private var lastFingerprint: String? = null

    fun start(tabId: String) { sharedTabId = tabId }

    fun stop(tabId: String) {
        if (sharedTabId == tabId) sharedTabId = null
    }

    fun isSharing(tabId: String): Boolean = sharedTabId == tabId

    fun capture(tabId: String, url: String, title: String, text: String, targets: List<Target>): Snapshot? {
        if (!isSharing(tabId)) return null
        val fingerprint = listOf(url, title, text, targets).toString()
        if (fingerprint == lastFingerprint) return null
        lastFingerprint = fingerprint
        return observer.capture(tabId, url, title, text, targets).also { lastCaptureAt = it.capturedAtEpochMs }
    }

    fun status(tabId: String, foreground: Boolean, heartbeatAgeMs: Long): FreshnessStatus {
        val capturedAt = lastCaptureAt ?: return FreshnessStatus.OFFLINE
        return Freshness.resolve(foreground, (clock() - capturedAt).coerceAtLeast(0), heartbeatAgeMs)
    }
}
