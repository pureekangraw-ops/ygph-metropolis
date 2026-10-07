package com.big.gobrowser.outsideview

import org.json.JSONArray
import org.json.JSONObject

object MapStyleFactory {
    const val OSM_TILES="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    fun style(pkg:MapPackage?,online:Boolean=true,tiles:String=OSM_TILES):String {
        val sources=JSONObject();val layers=JSONArray().put(JSONObject().put("id","background").put("type","background").put("paint",JSONObject().put("background-color","#edf0f4")))
        if(pkg!=null){
            sources.put("local-map",JSONObject().put("type","vector").put("url","pmtiles://file://${pkg.file.absolutePath}").put("attribution",pkg.attribution))
            for(layer in pkg.vectorLayers.sorted()){
                // Geometry filters let any valid vector-layer render without guessing its schema.
                for((type,geometry) in listOf("fill" to "Polygon","line" to "LineString","circle" to "Point")){
                    val paint=when(type){"fill"->JSONObject().put("fill-color","#bcd6c2").put("fill-opacity",.7);"line"->JSONObject().put("line-color","#6b829b").put("line-width",1.5);else->JSONObject().put("circle-color","#556f9b").put("circle-radius",3)}
                    layers.put(JSONObject().put("id","local-$layer-$type").put("type",type).put("source","local-map").put("source-layer",layer).put("filter",JSONArray().put("==").put("\$type").put(geometry)).put("paint",paint))
                }
            }
        } else if(online){
            require(tiles.startsWith("https://"))
            sources.put("roads",JSONObject().put("type","raster").put("tiles",JSONArray().put(tiles)).put("tileSize",256).put("maxzoom",19).put("attribution","© OpenStreetMap contributors"))
            layers.put(JSONObject().put("id","roads").put("type","raster").put("source","roads"))
        }
        return JSONObject().put("version",8).put("sources",sources).put("layers",layers).toString()
    }
}
