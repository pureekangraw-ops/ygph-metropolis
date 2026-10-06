package com.big.gobrowser.observer

enum class FreshnessStatus { LIVE, BACKGROUND, STALE, OFFLINE }

object Freshness {
    const val LIVE_CAPTURE_MAX_AGE_MS = 30_000L
    const val OFFLINE_HEARTBEAT_MAX_AGE_MS = 60_000L

    fun resolve(foreground: Boolean, captureAgeMs: Long, heartbeatAgeMs: Long): FreshnessStatus {
        require(captureAgeMs >= 0 && heartbeatAgeMs >= 0)
        if (heartbeatAgeMs > OFFLINE_HEARTBEAT_MAX_AGE_MS) return FreshnessStatus.OFFLINE
        if (!foreground) return FreshnessStatus.BACKGROUND
        return if (captureAgeMs <= LIVE_CAPTURE_MAX_AGE_MS) FreshnessStatus.LIVE else FreshnessStatus.STALE
    }
}
