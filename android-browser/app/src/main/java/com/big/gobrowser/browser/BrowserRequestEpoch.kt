package com.big.gobrowser.browser

/** A safety command invalidates queued work and UI results captured before the owner's decision. */
class BrowserRequestEpoch {
    private val generation = java.util.concurrent.atomic.AtomicLong()
    fun begin(safetyMutation: Boolean): Long = if (safetyMutation) generation.incrementAndGet() else generation.get()
    fun current(ticket: Long): Boolean = ticket == generation.get()
    // Close can revoke control before reporting BUSY; that failure still needs current state.
    fun needsReadback(safetyMutation: Boolean, path: String, succeeded: Boolean, httpStatus: Int?): Boolean =
        safetyMutation && (succeeded || (path == "/v1/close" && httpStatus == 409))
}
