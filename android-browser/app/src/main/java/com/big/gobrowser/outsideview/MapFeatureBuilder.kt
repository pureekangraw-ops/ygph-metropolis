package com.big.gobrowser.outsideview

import org.json.JSONArray
import org.json.JSONObject

data class MapFeature(val id: String, val kind: String, val geometry: JSONObject, val properties: JSONObject)
data class MapFeatures(val zones: List<MapFeature>, val grids: List<MapFeature>, val pins: List<MapFeature>, val focusedId: String?, val recommendedIds: Set<String>, val highlightedIds: Set<String>)

object MapFeatureBuilder {
    fun build(state: MapState): MapFeatures {
        val zones = state.zones.values.map { z ->
            val geometry = when {
                z.polygon.size >= 3 -> JSONObject().put("type", "Polygon").put("coordinates", ring(z.polygon))
                z.bounds != null -> JSONObject().put("type", "Polygon").put("coordinates", ring(corners(z.bounds)))
                else -> JSONObject().put("type", "GeometryCollection").put("geometries", JSONArray())
            }
            MapFeature(z.id, "zone", geometry, JSONObject().put("label", z.label).put("geometryKnown", z.geometryKnown))
        }
        val grids = state.grids.values.map { g -> MapFeature(g.id,"grid",polygon(g.bounds),JSONObject().put("zoneId",g.zoneId).put("uncertain",g.uncertain).put("label",g.label ?: JSONObject.NULL)) }
        val pins = state.pins.values.map { p -> MapFeature(p.id,"pin",JSONObject().put("type","Point").put("coordinates",point(p.point)),JSONObject().put("label",p.label).put("gridId",p.gridId).put("zoneId",p.zoneId ?: JSONObject.NULL).put("evidence",p.evidence.coordinate.name)) }
        return MapFeatures(zones,grids,pins,state.focused,state.recommendations,state.highlights)
    }
    private fun point(p: Point) = JSONArray().put(p.longitude).put(p.latitude)
    private fun corners(b: Bounds)=listOf(Point(b.west,b.south),Point(b.east,b.south),Point(b.east,b.north),Point(b.west,b.north),Point(b.west,b.south))
    private fun ring(points: List<Point>): JSONArray { val outer=JSONArray(); points.forEach { outer.put(point(it)) }; return JSONArray().put(outer) }
    private fun polygon(b: Bounds): JSONObject = JSONObject().put("type","Polygon").put("coordinates",ring(corners(b)))
}
