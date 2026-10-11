package com.big.gobrowser.transport

import org.json.JSONArray
import org.json.JSONObject

/** Keep each redacted browser sample inside Hall's 48 KiB/300-target contract. */
object ObservatorySnapshotWire {
    fun bounded(snapshot: JSONObject): JSONObject {
        val wire = JSONObject(snapshot.toString())
        wire.remove("deviceId")
        val source = wire.optJSONArray("targets") ?: JSONArray()
        val targets = JSONArray()
        for (index in 0 until minOf(300, source.length())) targets.put(source.getJSONObject(index))
        wire.put("targets", targets)
        if (targets.length() != source.length()) wire.put("truncated", true)
        while (wire.toString().toByteArray(Charsets.UTF_8).size > 48 * 1024 && targets.length() > 0) {
            targets.remove(targets.length() - 1)
            wire.put("truncated", true)
        }
        require(wire.toString().toByteArray(Charsets.UTF_8).size <= 48 * 1024) { "SNAPSHOT_TOO_LARGE" }
        return wire
    }
}
