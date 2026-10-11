package com.big.gobrowser.transport

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ObservatorySnapshotWireTest {
    @Test fun largePageRemainsWithinStationPayloadAndTargetLimits() {
        val snapshot = JSONObject().put("deviceId", "local").put("text", "ก".repeat(10000)).put("truncated", false)
            .put("targets", JSONArray().apply { repeat(500) { put(JSONObject().put("id", "target-$it").put("label", "x".repeat(300)).put("signature", "exact-$it")) } })
        val wire = ObservatorySnapshotWire.bounded(snapshot)
        assertTrue(wire.toString().toByteArray(Charsets.UTF_8).size <= 48 * 1024)
        assertTrue(wire.getJSONArray("targets").length() <= 300)
        assertTrue(wire.getBoolean("truncated"))
        assertFalse(wire.has("deviceId"))
        assertEquals("exact-0", wire.getJSONArray("targets").getJSONObject(0).getString("signature"))
        assertEquals(500, snapshot.getJSONArray("targets").length())
    }
    @Test fun smallCaptureKeepsItsIdentityAndContent() {
        val snapshot = JSONObject().put("captureId", "same").put("text", "before").put("truncated", false).put("targets", JSONArray())
        val wire = ObservatorySnapshotWire.bounded(snapshot)
        assertEquals("same", wire.getString("captureId"))
        assertEquals("before", wire.getString("text"))
        assertFalse(wire.getBoolean("truncated"))
    }
}
