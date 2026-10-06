package com.big.gobrowser.outsideview

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class MapContractTest {
    private val bounds=Bounds(10.0,10.0,11.0,11.0)
    private val zone=Zone("A","Alpha",Bounds(9.0,9.0,12.0,12.0))
    @Test fun equivalentNegativeZeroRetainsGridIdentity() { assertEquals(gridId("A",Bounds(-0.0,0.0,1.0,1.0)),gridId("A",Bounds(0.0,-0.0,1.0,1.0))) }
    @Test fun differentZoneChangesGridIdentity() { assertNotEquals(gridId("A",bounds),gridId("B",bounds)) }
    @Test fun approximatePinIsRejected() { val g=Grid(gridId("A",bounds),"A",bounds); val p=Pin("p","P",Point(10.5,10.5),g.id,Evidence(EvidenceStatus.APPROXIMATE,"gps")); val s=MapState(zones=mapOf("A" to zone),grids=mapOf(g.id to g)); assertTrue(validate(MapCommand("c",MapAction.UPSERT_PIN,pin=p),s,1).isNotEmpty()) }
    @Test fun codecRejectsRouteAndParsesTarget() { val c=MapCommandCodec.decode(JSONObject("""{"commandId":"c","action":"highlight","target":{"id":"p","kind":"pin"}}""")); assertEquals(MapAction.HIGHLIGHT,c.action); assertEquals("p",c.target!!.id) }
    @Test fun closedPolygonAndOverlapAreAcceptedAsSeparateZones() { val a=Zone("a","A",polygon=listOf(Point(0.0,0.0),Point(2.0,0.0),Point(2.0,2.0),Point(0.0,0.0))); val b=Zone("b","B",bounds=Bounds(1.0,1.0,3.0,3.0)); assertTrue(a.contains(Point(1.0,0.5))); assertTrue(b.contains(Point(2.0,2.0))) }
}
