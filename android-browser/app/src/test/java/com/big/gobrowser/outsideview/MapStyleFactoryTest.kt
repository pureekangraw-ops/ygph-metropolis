package com.big.gobrowser.outsideview

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.File

class MapStyleFactoryTest {
    @Test fun onlineStyleContainsRoadTilesAndAttribution() {
        val s=JSONObject(MapStyleFactory.style(null));val source=s.getJSONObject("sources").getJSONObject("roads")
        assertEquals(MapStyleFactory.OSM_TILES,source.getJSONArray("tiles").getString(0));assertTrue(source.getString("attribution").contains("OpenStreetMap"))
    }
    @Test fun localStyleUsesActualPmtilesAndLayerIdsWithoutNetworkFallback() {
        val pkg=MapPackage(File("/data/maps/active.pmtiles"),"a","owner",0,14,Bounds(-180.0,-85.0,180.0,85.0),setOf("roads"))
        val s=JSONObject(MapStyleFactory.style(pkg));assertFalse(s.getJSONObject("sources").has("roads"));assertEquals("pmtiles://file:///data/maps/active.pmtiles",s.getJSONObject("sources").getJSONObject("local-map").getString("url"))
        assertEquals("roads",s.getJSONArray("layers").getJSONObject(1).getString("source-layer"))
    }
    @Test fun offlineBlankStyleDoesNotInventAMapPackage() {assertEquals(0,JSONObject(MapStyleFactory.style(null,false)).getJSONObject("sources").length())}
}
