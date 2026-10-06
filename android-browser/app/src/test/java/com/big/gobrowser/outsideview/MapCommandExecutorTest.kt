package com.big.gobrowser.outsideview

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class MapCommandExecutorTest {
    private class Renderer : MapRenderer {
        override val foregroundReady = false
        override val styleGeneration = 1L
        override fun render(request: RenderRequest, callback: (RenderConfirmation) -> Unit) = Unit
        override fun cancel() = Unit
    }
    @Test fun liveScopeFailsClosedBeforeMutation() {
        val root=File.createTempFile("outside","test").apply { delete(); mkdirs() }
        val executor=MapCommandExecutor(MapStateStore(root),Renderer(),ExecutionScope.LIVE_DISABLED)
        val receipt=executor.submit(MapCommand("zone",MapAction.UPSERT_ZONE,zone=Zone("a","A",Bounds(0.0,0.0,1.0,1.0))))
        assertEquals(MapReceiptStatus.REJECTED,receipt.status)
        root.deleteRecursively()
    }
    @Test fun invalidRouteIsRejected() {
        val root=File.createTempFile("outside","test").apply { delete(); mkdirs() }
        val executor=MapCommandExecutor(MapStateStore(root),Renderer(),ExecutionScope.TEST)
        val receipt=executor.submit(MapCommand("route",MapAction.ROUTE))
        assertEquals(MapReceiptStatus.REJECTED,receipt.status)
        root.deleteRecursively()
    }
}
