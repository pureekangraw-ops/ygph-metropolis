package com.big.gobrowser.control

class PermissionStore(private val initialEpoch: Long = 0L) {
    private val epochs = mutableMapOf<String, Long>()

    fun epoch(tabId: String): Long = epochs[tabId] ?: initialEpoch
    fun revoke(tabId: String): Long {
        val next = epoch(tabId) + 1
        epochs[tabId] = next
        return next
    }
}
