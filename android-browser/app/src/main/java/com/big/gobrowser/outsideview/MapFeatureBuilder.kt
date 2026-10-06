package com.big.gobrowser.outsideview

import org.json.JSONArray
import org.json.JSONObject

data class MapFeature(val id: String, val kind: String, val geometry: JSONObject, val properties: JSONObject)
data class MapFeatures(val zones: List<MapFeature>, val grids: List<MapFeature>, val pins: List<MapFeature>, val focusedId: String?, val recommendedIds: Set<String>, val highlightedIds: Set<String>)

object MapFeatureBuilder {
    fun build(state: MapState): MapFeatures {
        val zones = state.zones.values.map { z ->
            val geometry = when {
                z.polygon.size >= 3 -> JSONObject().put("type", "Polygon").put("coordinates", JSONArray().put(JSONArray(z.polygon.map { JSONArray().put(it.longitude).put(it.latitude) })))
                z.bounds != null -> JSONObject().put("type", "Polygon").put("coordinates", JSONArray().put(JSONArray(listOf(Point(z.bounds.west,z.bounds.south),Point(z.bounds.east,z.bounds.south),Point(z.bounds.east,z.bounds.north),Point(z.bounds.west,z.bounds.north),Point(z.bounds.west,z.bounds.south)).map { JSONArray().put(it.longitude).put(it.latitude) })))
                else -> JSONObject().put("type", "GeometryCollection").put("geometries", JSONArray())
            }
            MapFeature(z.id, "zone", geometry, JSONObject().put("label", z.label).put("geometryKnown", z.geometryKnown))
        }
        val grids = state.grids.values.map { g -> MapFeature(g.id,"grid",polygon(g.bounds),JSONObject().put("zoneId",g.zoneId).put("uncertain",g.uncertain).put("label",g.label)) }
        val pins = state.pins.values.map { p -> MapFeature(p.id,"pin",JSONObject().put("type","Point").put("coordinates",JSONArray().put(p.point.longitude).put(p.point.latitude)),JSONObject().put("label",p.label).put("gridId",p.gridId).put("zoneId",p.zoneId).put("evidence",p.evidence.coordinate.name)) }
        return MapFeatures(zones,grids,pins,state.focused,state.recommendations,state.highlights)
    }
    private fun polygon(b: Bounds): JSONObject = JSONObject().put("type","Polygon").put("coordinates",JSONArray().put(JSONArray(listOf(Point(b.west,b.south),Point(b.east,b.south),Point(b.east,b.north),Point(b.west,b.north),Point(b.west,b.south)).map { JSONArray().put(it.longitude).put(it.latitude) })))
}
