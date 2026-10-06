package com.big.gobrowser.outsideview

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

class MapStateStore(private val root: File) {
    constructor(context: Context) : this(File(context.filesDir, "outside-view"))
    private val file get() = File(root, "journal.json")
    fun load(): MapJournal {
        if (!file.exists()) return MapJournal(MapState())
        return runCatching { decode(JSONObject(file.readText())) }.getOrElse { MapJournal(MapState()) }
    }
    @Synchronized fun commit(journal: MapJournal) {
        require(journal.version == 1) { "unsupported journal version" }
        root.mkdirs()
        val tmp = File(root, "journal.json.tmp")
        tmp.writeText(encode(journal).toString())
        tmp.outputStream().use { it.fd.sync() }
        try { Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING) }
        catch (e: Exception) { if (tmp.exists()) tmp.delete(); throw IllegalStateException("atomic journal replacement unavailable", e) }
    }
    private fun p(p: Point) = JSONObject().put("longitude", p.longitude).put("latitude", p.latitude)
    private fun b(b: Bounds) = JSONObject().put("west", b.west).put("south", b.south).put("east", b.east).put("north", b.north)
    private fun encode(j: MapJournal): JSONObject {
        val s = JSONObject().put("revision", j.state.revision)
        val zones = JSONArray(); j.state.zones.values.forEach { zones.put(JSONObject().put("id", it.id).put("label", it.label).put("bounds", it.bounds?.let(::b)).put("parentId", it.parentId).put("geometryKnown", it.geometryKnown)) }
        val grids = JSONArray(); j.state.grids.values.forEach { grids.put(JSONObject().put("id", it.id).put("zoneId", it.zoneId).put("bounds", b(it.bounds)).put("uncertain", it.uncertain).put("label", it.label)) }
        val pins = JSONArray(); j.state.pins.values.forEach { pins.put(JSONObject().put("id", it.id).put("label", it.label).put("point", p(it.point)).put("gridId", it.gridId).put("zoneId", it.zoneId).put("note", it.note).put("evidence", JSONObject().put("coordinate", it.evidence.coordinate.name).put("source", it.evidence.source).put("observedAt", it.evidence.observedAt).put("availableUntil", it.evidence.availableUntil))) }
        s.put("zones", zones).put("grids", grids).put("pins", pins).put("notes", JSONObject(j.state.notes)).put("recommendations", JSONArray(j.state.recommendations.toList())).put("highlights", JSONArray(j.state.highlights.toList())).put("focused", j.state.focused)
        return JSONObject().put("version", j.version).put("state", s).put("pending", j.pending?.let { JSONObject().put("commandId", it.command.commandId).put("revision", it.revision).put("token", it.token) }).put("receipts", JSONObject())
    }
    private fun decode(o: JSONObject): MapJournal {
        require(o.optInt("version", 1) == 1) { "unsupported journal version" }
        val s = o.getJSONObject("state"); val zones = linkedMapOf<String, Zone>(); val grids = linkedMapOf<String, Grid>(); val pins = linkedMapOf<String, Pin>()
        val za = s.optJSONArray("zones") ?: JSONArray(); for (i in 0 until za.length()) { val z=za.getJSONObject(i); zones[z.getString("id")] = Zone(z.getString("id"), z.getString("label"), z.optJSONObject("bounds")?.let(::decodeBounds), parentId=z.optString("parentId", null), geometryKnown=z.optBoolean("geometryKnown", true)) }
        val ga = s.optJSONArray("grids") ?: JSONArray(); for (i in 0 until ga.length()) { val g=ga.getJSONObject(i); grids[g.getString("id")] = Grid(g.getString("id"), g.getString("zoneId"), decodeBounds(g.getJSONObject("bounds")), g.optBoolean("uncertain"), g.optString("label", null)) }
        val pa = s.optJSONArray("pins") ?: JSONArray(); for (i in 0 until pa.length()) { val p=pa.getJSONObject(i); val e=p.getJSONObject("evidence"); val ev=Evidence(EvidenceStatus.valueOf(e.optString("coordinate", "UNKNOWN")), e.optString("source", null), e.optLong("observedAt").takeIf { e.has("observedAt") }, e.optLong("availableUntil").takeIf { e.has("availableUntil") }); pins[p.getString("id")] = Pin(p.getString("id"),p.getString("label"),decodePoint(p.getJSONObject("point")),p.getString("gridId"),ev,p.optString("zoneId",null),p.optString("note",null)) }
        val notes = mutableMapOf<String,String>(); s.optJSONObject("notes")?.keys()?.forEach { notes[it] = s.getJSONObject("notes").getString(it) }
        fun set(name:String) = buildSet { val a=s.optJSONArray(name) ?: JSONArray(); for(i in 0 until a.length()) add(a.getString(i)) }
        return MapJournal(MapState(zones, grids, pins, notes, set("recommendations"), set("highlights"), s.optString("focused", null), s.optLong("revision")))
    }
    private fun decodeBounds(o: JSONObject) = Bounds(o.getDouble("west"),o.getDouble("south"),o.getDouble("east"),o.getDouble("north"))
    private fun decodePoint(o: JSONObject) = Point(o.getDouble("longitude"),o.getDouble("latitude"))
}
