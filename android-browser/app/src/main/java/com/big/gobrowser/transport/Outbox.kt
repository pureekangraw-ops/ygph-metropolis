package com.big.gobrowser.transport

import com.big.gobrowser.observer.Snapshot

class Outbox(
    private val maxBytes: Long = 10L * 1024 * 1024,
    private val maxAgeMs: Long = 24L * 60 * 60 * 1000,
    private val clock: () -> Long = { System.currentTimeMillis() }
) {
    private val entries = linkedMapOf<String, Snapshot>()
    var droppedCount: Long = 0
        private set

    @Synchronized
    fun enqueue(snapshot: Snapshot): Boolean {
        prune()
        entries[snapshot.captureId] = snapshot
        while (estimatedBytes() > maxBytes && entries.isNotEmpty()) {
            entries.remove(entries.keys.first())
            droppedCount += 1
        }
        return entries.containsKey(snapshot.captureId)
    }

    @Synchronized
    fun pending(): List<Snapshot> = prune().let { entries.values.toList() }
    @Synchronized
    fun ack(captureId: String) { entries.remove(captureId) }
    @Synchronized
    fun clearTab(tabId: String) { entries.entries.removeIf { it.value.tabId == tabId } }

    private fun prune(): Unit {
        val cutoff = clock() - maxAgeMs
        entries.entries.removeIf { it.value.capturedAtEpochMs < cutoff }
    }

    // Six bytes per UTF-16 unit bounds JSON escaping; include targets and all metadata.
    private fun estimatedBytes(): Long = entries.values.sumOf { snapshot ->
        val strings = listOf(snapshot.deviceId, snapshot.tabId, snapshot.captureId, snapshot.appVersion,
            snapshot.schema, snapshot.url, snapshot.title, snapshot.text)
        512L + strings.sumOf { it.length.toLong() * 6 } + snapshot.targets.sumOf {
            192L + (it.id.length.toLong() + (it.role?.length ?: 0) + (it.label?.length ?: 0) + it.kind.length) * 6
        }
    }
}
