package com.big.gobrowser.outsideview

import org.junit.Assert.*
import org.junit.Test

class MapFeatureBuilderTest {
    @Test fun buildsIndependentZoneGridAndPinsInLngLatOrder(){ val b=Bounds(1.0,2.0,3.0,4.0); val g=Grid(gridId("z",b),"z",b); val s=MapState(zones=mapOf("z" to Zone("z","Zone",b)),grids=mapOf(g.id to g),pins=mapOf("p" to Pin("p","Pin",Point(2.0,3.0),g.id,Evidence(EvidenceStatus.VERIFIED,"test")))); val f=MapFeatureBuilder.build(s); assertEquals(1,f.zones.size); assertEquals(1,f.grids.size); assertEquals(1,f.pins.size); assertEquals(2.0,f.pins.single().geometry.getJSONArray("coordinates").getDouble(0),0.0); assertEquals(3.0,f.pins.single().geometry.getJSONArray("coordinates").getDouble(1),0.0) }
}
