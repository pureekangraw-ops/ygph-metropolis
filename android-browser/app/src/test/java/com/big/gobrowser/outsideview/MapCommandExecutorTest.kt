package com.big.gobrowser.outsideview

import java.io.File
import org.junit.Assert.*
import org.junit.Test

class MapCommandExecutorTest {
    private class Renderer(var ready:Boolean=false): MapRenderer {
        override val foregroundReady get()=ready
        override var styleGeneration=1L
        var request:RenderRequest?=null
        var callback:((RenderConfirmation)->Unit)?=null
        override fun render(request:RenderRequest, callback:(RenderConfirmation)->Unit){this.request=request;this.callback=callback}
        override fun cancel(){styleGeneration++}
    }
    @Test fun mutationPersistsPendingWithoutRendererAndReplaysWithoutDuplicateMutation(){ val dir=File.createTempFile("outside","test").apply{delete();mkdirs()}; val store=MapStateStore(dir); val r=Renderer(); val e=MapCommandExecutor(store,r,ExecutionScope.TEST); val z=Zone("a","A",Bounds(0.0,0.0,5.0,5.0)); val receipt=e.submit(MapCommand("z",MapAction.UPSERT_ZONE,zone=z)); assertEquals(MapReceiptStatus.PENDING,receipt.status); assertEquals(1,store.load().state.revision); e.resume(); assertEquals(1,store.load().state.revision); dir.deleteRecursively() }
    @Test fun wrongConfirmationDoesNotApply(){ val dir=File.createTempFile("outside","test").apply{delete();mkdirs()}; val store=MapStateStore(dir); val r=Renderer(true); val e=MapCommandExecutor(store,r,ExecutionScope.TEST); val z=Zone("a","A",Bounds(0.0,0.0,5.0,5.0)); e.submit(MapCommand("z",MapAction.UPSERT_ZONE,zone=z)); val q=store.load().pending!!; val wrong=e.confirm(RenderConfirmation("z",q.revision,1,"wrong",setOf("a"))); assertEquals(MapReceiptStatus.PENDING,wrong.status); assertNotNull(store.load().pending); dir.deleteRecursively() }
}
