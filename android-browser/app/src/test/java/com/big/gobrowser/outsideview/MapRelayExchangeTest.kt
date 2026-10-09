package com.big.gobrowser.outsideview

import org.junit.Assert.*
import org.junit.Test

class MapRelayExchangeTest {
    @Test fun commandBoundToCurrentCaptureIsPolledWithoutReplacingItsCapture(){
        var serverCapture="before";val operations=mutableListOf<String>()
        val commands=MapRelayExchange.run(true,false,{}, {operations+="poll";listOf(serverCapture)}, {operations+="publish";serverCapture="after"}, {fail("Unexpected receipt")})
        assertEquals(listOf("before"),commands);assertEquals("before",serverCapture);assertEquals(listOf("poll"),operations)
    }
    @Test fun idlePollRefreshesButFirstSessionPublishesBeforePolling(){
        val operations=mutableListOf<String>()
        MapRelayExchange.run<String>(true,false,{}, {operations+="poll";emptyList()}, {operations+="publish"}, {})
        assertEquals(listOf("poll","publish"),operations);operations.clear()
        MapRelayExchange.run<String>(false,false,{}, {operations+="poll";emptyList()}, {operations+="publish"}, {})
        assertEquals(listOf("publish","poll"),operations)
    }
    @Test fun receiptFollowsItsAfterSnapshotAndDoesNotPollOrRefresh(){
        val operations=mutableListOf<String>()
        MapRelayExchange.run<String>(true,true,{}, {fail("Unexpected poll");emptyList()}, {operations+="after"}, {operations+="receipt"})
        assertEquals(listOf("after","receipt"),operations)
    }
    @Test fun stopDuringFirstHttpPreventsTheNextHttp(){
        var active=true;val operations=mutableListOf<String>()
        val result=runCatching {MapRelayExchange.run<String>(true,true,{check(active)}, {fail("Unexpected poll");emptyList()}, {operations+="after";active=false}, {operations+="receipt"})}
        assertTrue(result.isFailure);assertEquals(listOf("after"),operations)
    }
}
