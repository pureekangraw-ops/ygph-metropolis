package com.big.gobrowser.observer

class ObserverSession(
    private val deviceId: String,
    private val appVersion: String,
    private val clock: () -> Long = { System.currentTimeMillis() }
) {
    private val observer = DomObserver(deviceId, appVersion, clock)
    private var sharedTabId: String? = null
    private var lastSnapshot: Snapshot? = null
    private var lastFingerprint: String? = null
    private val debounceMs = 2_000L

    fun start(tabId: String) {
        if (sharedTabId != tabId) reset()
        sharedTabId = tabId
    }

    fun stop(tabId: String) {
        if (sharedTabId == tabId) { sharedTabId = null; reset() }
    }

    private fun reset() { lastSnapshot = null; lastFingerprint = null }
    fun isSharing(tabId: String): Boolean = sharedTabId == tabId
    fun latest(tabId: String): Snapshot? = if (isSharing(tabId)) lastSnapshot else null

    fun capture(tabId: String, url: String, title: String, text: String, targets: List<Target>,
                captureId: String? = null, force: Boolean = false): Snapshot? {
        if (!isSharing(tabId)) return null
        val age = lastSnapshot?.let { clock() - it.capturedAtEpochMs }
        val fingerprint = listOf(url, title, text, targets).toString()
        if (!force && age != null && age < Freshness.LIVE_CAPTURE_MAX_AGE_MS) {
            if (fingerprint == lastFingerprint || age < debounceMs) return null
        }
        lastFingerprint = fingerprint
        return observer.capture(tabId, url, title, text, targets, captureId).also { lastSnapshot = it }
    }

    fun status(tabId: String, foreground: Boolean, heartbeatAgeMs: Long): FreshnessStatus {
        val snapshot = latest(tabId) ?: return FreshnessStatus.OFFLINE
        return Freshness.resolve(foreground, (clock() - snapshot.capturedAtEpochMs).coerceAtLeast(0), heartbeatAgeMs)
    }
}
