package com.big.gobrowser.outsideview

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject

class MapRendererContractTest {
    @Test fun nullCodecRevisionDoesNotBecomeZero(){assertNull(MapCommandCodec.decode(MapCommandCodec.encode(MapCommand("id",MapAction.CLEAR,scope="all"))).expectedRevision)}
    @Test fun focusRequiresMatchingKnownTargetAndSupportsZoneAndGrid(){
        val b=Bounds(10.0,20.0,12.0,22.0);val z=Zone("z","Zone",b);val g=Grid(gridId("z",b),"z",b)
        val s=MapState(zones=mapOf(z.id to z),grids=mapOf(g.id to g))
        assertEquals(Point(11.0,21.0),mapTargetCenter(s,MapTarget("z","zone")));assertEquals(Point(11.0,21.0),mapTargetCenter(s,MapTarget(g.id,"grid")))
        assertTrue(validate(MapCommand("focus",MapAction.FOCUS,MapTarget("missing","pin")),s,0).isNotEmpty())
        assertTrue(validate(MapCommand("focus",MapAction.FOCUS,MapTarget("z","pin")),s,0).isNotEmpty())
        assertTrue(validate(MapCommand("highlight",MapAction.HIGHLIGHT,MapTarget("missing","zone")),s,0).isNotEmpty())
    }
}
