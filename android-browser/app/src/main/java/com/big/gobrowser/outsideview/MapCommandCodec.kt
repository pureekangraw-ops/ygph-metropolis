package com.big.gobrowser.outsideview

import org.json.JSONObject

object MapCommandCodec {
    fun decode(json: JSONObject): MapCommand {
        val action = MapAction.valueOf(json.getString("action").uppercase())
        val target = json.optJSONObject("target")?.let { MapTarget(it.getString("id"), it.getString("kind")) }
        val expected = if (json.has("expectedRevision")) json.optLong("expectedRevision") else null
        return MapCommand(
            commandId = json.getString("commandId"), action = action, target = target,
            note = nullable(json, "note"), expectedRevision = expected,
            scope = nullable(json, "scope"), presentation = nullable(json, "presentation"),
            zone = json.optJSONObject("zone")?.let(::zone),
            grid = json.optJSONObject("grid")?.let(::grid),
            pin = json.optJSONObject("pin")?.let(::pin)
        )
    }
    private fun nullable(o: JSONObject, key: String): String? = if (o.isNull(key)) null else o.optString(key, "")
    private fun bounds(o: JSONObject) = Bounds(o.getDouble("west"), o.getDouble("south"), o.getDouble("east"), o.getDouble("north"))
    private fun point(o: JSONObject) = Point(o.getDouble("longitude"), o.getDouble("latitude"))
    private fun zone(o: JSONObject): Zone = Zone(o.getString("id"), o.getString("label"), o.optJSONObject("bounds")?.let(::bounds), emptyList(), nullable(o,"parentId"), o.optBoolean("geometryKnown", true))
    private fun grid(o: JSONObject): Grid = Grid(o.getString("id"), o.getString("zoneId"), bounds(o.getJSONObject("bounds")), o.optBoolean("uncertain", false), nullable(o,"label"))
    private fun pin(o: JSONObject): Pin {
        val e = o.optJSONObject("evidence")
        val evidence = Evidence(EvidenceStatus.valueOf(e?.optString("coordinate", "UNKNOWN") ?: "UNKNOWN"), e?.let { nullable(it,"source") }, e?.let { if(it.isNull("observedAt")) null else it.optLong("observedAt") }, e?.let { if(it.isNull("availableUntil")) null else it.optLong("availableUntil") })
        return Pin(o.getString("id"), o.getString("label"), point(o.getJSONObject("point")), o.getString("gridId"), evidence, nullable(o,"zoneId"), nullable(o,"note"))
    }
}
