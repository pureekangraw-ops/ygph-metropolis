package com.big.gobrowser.outsideview

import java.io.File
import org.junit.Assert.*
import org.junit.Test

class MapCommandExecutorTest {
    private class Renderer(var ready:Boolean):MapRenderer{override val foregroundReady get()=ready;override var styleGeneration=1L;var request:RenderRequest?=null;var callback:((RenderConfirmation)->Unit)?=null;override fun render(request:RenderRequest,callback:(RenderConfirmation)->Unit){this.request=request;this.callback=callback};override fun cancel(){styleGeneration++}}
    private fun root():File=File.createTempFile("outside","test").apply{delete();mkdirs()}
    @Test fun pendingJournalSurvivesReloadAndSamePayloadDoesNotMutateTwice(){val dir=root();val store=MapStateStore(dir);val r=Renderer(false);val e=MapCommandExecutor(store,r,ExecutionScope.TEST);val c=MapCommand("zone",MapAction.UPSERT_ZONE,zone=Zone("a","A",Bounds(0.0,0.0,1.0,1.0)));assertEquals(MapReceiptStatus.PENDING,e.submit(c).status);val first=store.load();assertNotNull(first.pending);assertEquals(1,first.state.revision);assertTrue(first.hashes.containsKey("zone"));assertEquals(MapReceiptStatus.PENDING,e.submit(c).status);assertEquals(1,store.load().state.revision);val changed=c.copy(zone=Zone("a","Changed",Bounds(0.0,0.0,1.0,1.0)));assertEquals(MapReceiptStatus.REJECTED,e.submit(changed).status);dir.deleteRecursively()}
    @Test fun matchingRendererConfirmationPersistsAppliedReceipt(){val dir=root();val store=MapStateStore(dir);val r=Renderer(true);val e=MapCommandExecutor(store,r,ExecutionScope.TEST);val c=MapCommand("zone",MapAction.UPSERT_ZONE,zone=Zone("a","A",Bounds(0.0,0.0,1.0,1.0)));e.submit(c);val q=store.load().pending!!;val applied=e.confirm(RenderConfirmation("zone",q.revision,r.styleGeneration,q.token,setOf("a")));assertEquals(MapReceiptStatus.APPLIED,applied.status);assertNull(store.load().pending);assertEquals(MapReceiptStatus.APPLIED,store.load().receipts["zone"]!!.status);dir.deleteRecursively()}
    @Test fun wrongClearScopeIsRejected(){val dir=root();val e=MapCommandExecutor(MapStateStore(dir),Renderer(false),ExecutionScope.TEST);assertEquals(MapReceiptStatus.REJECTED,e.submit(MapCommand("clear",MapAction.CLEAR,scope="everything")).status);dir.deleteRecursively()}
    @Test fun samePayloadWithExpectedRevisionReturnsPersistedReceiptBeforeRevisionValidation(){
        val dir=root();val store=MapStateStore(dir);val r=Renderer(true);val e=MapCommandExecutor(store,r,ExecutionScope.TEST)
        val c=MapCommand("dedupe",MapAction.UPSERT_ZONE,zone=Zone("a","A",Bounds(0.0,0.0,1.0,1.0)),expectedRevision=0)
        e.submit(c);val p=store.load().pending!!;e.confirm(RenderConfirmation(c.commandId,p.revision,1,p.token,setOf("a"),camera=Bounds(0.5,0.5,0.5,0.5),cameraZoom=12.0))
        assertEquals(MapReceiptStatus.APPLIED,e.submit(c).status);assertEquals(1,store.load().state.revision);assertEquals(Point(0.5,0.5),store.load().receipts[c.commandId]!!.confirmedCamera);assertEquals(12.0,store.load().receipts[c.commandId]!!.confirmedZoom);assertEquals(store.load().state.revision,store.load().renderedRevision)
        assertEquals(MapReceiptStatus.REJECTED,e.submit(c.copy(zone=c.zone!!.copy(label="Changed"))).status);dir.deleteRecursively()
    }
    @Test fun rendererFailurePersistsFailedEvidenceAndClearsPending(){
        val dir=root();val store=MapStateStore(dir);val r=Renderer(true);val e=MapCommandExecutor(store,r,ExecutionScope.TEST)
        e.submit(MapCommand("failed",MapAction.UPSERT_ZONE,zone=Zone("a","A",Bounds(0.0,0.0,1.0,1.0))))
        val p=store.load().pending!!;assertEquals(MapReceiptStatus.FAILED,e.confirm(RenderConfirmation("failed",p.revision,1,p.token,emptySet(),error="map-load-failed")).status)
        assertNull(store.load().pending);assertEquals(MapReceiptStatus.FAILED,store.load().receipts["failed"]!!.status);assertNotEquals(store.load().state.revision,store.load().renderedRevision);dir.deleteRecursively()
    }
    @Test fun screenRetryMarksOnlyMatchingSuccessfulRenderedRevision(){
        val dir=root();val store=MapStateStore(dir);store.commit(MapJournal(MapState(revision=7)))
        assertEquals(-1,store.load().renderedRevision)
        assertFalse(store.confirmScreen(RenderConfirmation("screen-retry",7,2,"screen",emptySet(),error="failed")))
        assertFalse(store.confirmScreen(RenderConfirmation("screen-retry",6,2,"screen",emptySet())))
        assertFalse(store.confirmScreen(RenderConfirmation("untrusted",7,2,"screen",emptySet())))
        assertTrue(store.confirmScreen(RenderConfirmation("screen-retry",7,2,"screen",emptySet())))
        assertEquals(7,store.load().renderedRevision);dir.deleteRecursively()
    }
}
