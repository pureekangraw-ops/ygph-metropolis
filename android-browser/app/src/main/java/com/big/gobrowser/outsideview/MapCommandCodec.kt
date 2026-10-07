package com.big.gobrowser.outsideview

import org.json.JSONArray
import org.json.JSONObject

object MapCommandCodec {
    fun decode(json: JSONObject): MapCommand {
        val action = MapAction.valueOf(json.getString("action").uppercase())
        val target = json.optJSONObject("target")?.let { MapTarget(it.getString("id"), it.getString("kind")) }
        return MapCommand(json.getString("commandId"), action, target,
            json.optJSONObject("zone")?.let(::zone), json.optJSONObject("grid")?.let(::grid), json.optJSONObject("pin")?.let(::pin),
            nullable(json,"note"), if(json.has("expectedRevision")&&!json.isNull("expectedRevision")) json.getLong("expectedRevision") else null,
            nullable(json,"scope"), nullable(json,"presentation"))
    }
    fun encode(command: MapCommand): JSONObject = JSONObject().put("commandId",command.commandId).put("action",command.action.name)
        .put("target",command.target?.let { JSONObject().put("id",it.id).put("kind",it.kind) } ?: JSONObject.NULL)
        .put("zone",command.zone?.let(::encodeZone) ?: JSONObject.NULL).put("grid",command.grid?.let(::encodeGrid) ?: JSONObject.NULL)
        .put("pin",command.pin?.let(::encodePin) ?: JSONObject.NULL).put("note",command.note ?: JSONObject.NULL)
        .put("expectedRevision",command.expectedRevision ?: JSONObject.NULL).put("scope",command.scope ?: JSONObject.NULL).put("presentation",command.presentation ?: JSONObject.NULL)
    fun canonical(command: MapCommand): String = encode(command).toString()
    private fun nullable(o: JSONObject,key:String):String?=if(o.isNull(key))null else o.optString(key,"")
    private fun decodeBounds(o: JSONObject)=Bounds(o.getDouble("west"),o.getDouble("south"),o.getDouble("east"),o.getDouble("north"))
    private fun encodeBounds(b: Bounds)=JSONObject().put("west",b.west).put("south",b.south).put("east",b.east).put("north",b.north)
    private fun point(o: JSONObject)=Point(o.getDouble("longitude"),o.getDouble("latitude"))
    private fun encodeZone(z: Zone): JSONObject { val a=JSONArray(); z.polygon.forEach { a.put(JSONObject().put("longitude",it.longitude).put("latitude",it.latitude)) }; return JSONObject().put("id",z.id).put("label",z.label).put("bounds",z.bounds?.let(::encodeBounds) ?: JSONObject.NULL).put("polygon",a).put("parentId",z.parentId ?: JSONObject.NULL).put("geometryKnown",z.geometryKnown) }
    private fun zone(o: JSONObject): Zone { val a=o.optJSONArray("polygon")?:JSONArray(); val polygon=buildList { for(i in 0 until a.length()){val p=a.getJSONObject(i);add(Point(p.getDouble("longitude"),p.getDouble("latitude"))) } }; return Zone(o.getString("id"),o.getString("label"),o.optJSONObject("bounds")?.let(::decodeBounds),polygon,nullable(o,"parentId"),o.optBoolean("geometryKnown",true)) }
    private fun encodeGrid(g: Grid)=JSONObject().put("id",g.id).put("zoneId",g.zoneId).put("bounds",encodeBounds(g.bounds)).put("uncertain",g.uncertain).put("label",g.label ?: JSONObject.NULL)
    private fun grid(o: JSONObject)=Grid(o.getString("id"),o.getString("zoneId"),decodeBounds(o.getJSONObject("bounds")),o.optBoolean("uncertain",false),nullable(o,"label"))
    private fun evidence(e: Evidence)=JSONObject().put("coordinate",e.coordinate.name).put("source",e.source ?: JSONObject.NULL).put("observedAt",e.observedAt ?: JSONObject.NULL).put("availableUntil",e.availableUntil ?: JSONObject.NULL)
    private fun encodePin(p: Pin)=JSONObject().put("id",p.id).put("label",p.label).put("point",JSONObject().put("longitude",p.point.longitude).put("latitude",p.point.latitude)).put("gridId",p.gridId).put("evidence",evidence(p.evidence)).put("zoneId",p.zoneId ?: JSONObject.NULL).put("note",p.note ?: JSONObject.NULL)
    private fun pin(o: JSONObject): Pin { val e=o.getJSONObject("evidence"); return Pin(o.getString("id"),o.getString("label"),point(o.getJSONObject("point")),o.getString("gridId"),Evidence(EvidenceStatus.valueOf(e.optString("coordinate","UNKNOWN")),nullable(e,"source"),if(e.isNull("observedAt"))null else e.optLong("observedAt"),if(e.isNull("availableUntil"))null else e.optLong("availableUntil")),nullable(o,"zoneId"),nullable(o,"note")) }
}
