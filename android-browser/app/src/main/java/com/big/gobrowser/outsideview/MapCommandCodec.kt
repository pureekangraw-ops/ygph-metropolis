package com.big.gobrowser.outsideview

import org.json.JSONObject

object MapCommandCodec {
    fun decode(json: JSONObject): MapCommand {
        val action = MapAction.valueOf(json.getString("action").uppercase())
        val target = json.optJSONObject("target")?.let { MapTarget(it.getString("id"), it.getString("kind")) }
        val expected = if (json.has("expectedRevision")) json.optLong("expectedRevision") else null
        return MapCommand(
            commandId = json.getString("commandId"), action = action, target = target,
            note = json.optString("note", null), expectedRevision = expected,
            scope = json.optString("scope", null), presentation = json.optString("presentation", null),
            zone = json.optJSONObject("zone")?.let(::zone),
            grid = json.optJSONObject("grid")?.let(::grid),
            pin = json.optJSONObject("pin")?.let(::pin)
        )
    }
    private fun bounds(o: JSONObject) = Bounds(o.getDouble("west"), o.getDouble("south"), o.getDouble("east"), o.getDouble("north"))
    private fun point(o: JSONObject) = Point(o.getDouble("longitude"), o.getDouble("latitude"))
    private fun zone(o: JSONObject): Zone = Zone(o.getString("id"), o.getString("label"), o.optJSONObject("bounds")?.let(::bounds), emptyList(), o.optString("parentId", null), o.optBoolean("geometryKnown", true))
    private fun grid(o: JSONObject): Grid = Grid(o.getString("id"), o.getString("zoneId"), bounds(o.getJSONObject("bounds")), o.optBoolean("uncertain", false), o.optString("label", null))
    private fun pin(o: JSONObject): Pin {
        val e = o.optJSONObject("evidence")
        val evidence = Evidence(EvidenceStatus.valueOf(e?.optString("coordinate", "UNKNOWN") ?: "UNKNOWN"), e?.optString("source", null), e?.optLong("observedAt")?.takeIf { e.has("observedAt") }, e?.optLong("availableUntil")?.takeIf { e.has("availableUntil") })
        return Pin(o.getString("id"), o.getString("label"), point(o.getJSONObject("point")), o.getString("gridId"), evidence, o.optString("zoneId", null), o.optString("note", null))
    }
}
