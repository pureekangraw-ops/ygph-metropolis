package com.big.gobrowser.browser

import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import com.big.gobrowser.outsideview.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ObservatoryRendererTest {
    @get:Rule val rule=ActivityTestRule(BrowserActivity::class.java)
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    @Test fun distantPinDoesNotBlockNoteClearHighlightOrGridFocus() {
        val done=CountDownLatch(1);val receipts=mutableListOf<MapReceipt>();val confirmations=mutableListOf<RenderConfirmation>()
        lateinit var renderer:MapLibreOutsideRenderer
        lateinit var executor:MapCommandExecutor
        val local=Bounds(100.49,13.74,100.51,13.76);val far=Bounds(139.69,35.68,139.71,35.70)
        val localGrid=Grid(gridId("local",local),"local",local);val farGrid=Grid(gridId("far",far),"far",far)
        val evidence=Evidence(EvidenceStatus.VERIFIED,"device-test-map-selection",System.currentTimeMillis())
        val commands=listOf(
            MapCommand("zone-local",MapAction.UPSERT_ZONE,zone=Zone("local","Bangkok",local)),
            MapCommand("zone-far",MapAction.UPSERT_ZONE,zone=Zone("far","Tokyo",far)),
            MapCommand("grid-local",MapAction.UPSERT_GRID,grid=localGrid),
            MapCommand("grid-far",MapAction.UPSERT_GRID,grid=farGrid),
            MapCommand("pin-local",MapAction.UPSERT_PIN,pin=Pin("local-pin","Bangkok",local.center(),localGrid.id,evidence,"local")),
            MapCommand("pin-far",MapAction.UPSERT_PIN,pin=Pin("far-pin","Tokyo",far.center(),farGrid.id,evidence,"far")),
            MapCommand("note",MapAction.NOTE,MapTarget("local-pin","pin"),note="two distant pins"),
            MapCommand("highlight",MapAction.HIGHLIGHT,MapTarget("local","zone")),
            MapCommand("recommend",MapAction.RECOMMEND,MapTarget(localGrid.id,"grid")),
            MapCommand("focus",MapAction.FOCUS,MapTarget(localGrid.id,"grid")),
            MapCommand("clear",MapAction.CLEAR,scope="pins")
        )
        instrumentation.runOnMainSync {
            val host=FrameLayout(rule.activity);rule.activity.setContentView(host)
            renderer=MapLibreOutsideRenderer(host)
            val store=MapStateStore(File(rule.activity.cacheDir,"renderer-e2e-${System.nanoTime()}"))
            executor=MapCommandExecutor(store,renderer,ExecutionScope.LOCAL_OWNER)
            var offline=false;var started=false;var index=0
            renderer.onReady={
                if(!offline){offline=true;renderer.reloadStyle(false)}
                else if(!started){started=true;executor.submit(commands[index])}
            }
            renderer.onConfirmed={confirmation->
                confirmations+=confirmation
                val receipt=store.load().receipts[confirmation.commandId]
                if(receipt!=null)receipts+=receipt
                index++
                if(receipt?.status!=MapReceiptStatus.APPLIED||index==commands.size)done.countDown()
                else executor.submit(commands[index])
            }
            renderer.onStart();renderer.onResume()
        }
        try {
            assertTrue("Distant offscreen source must not keep the native journal pending",done.await(65,TimeUnit.SECONDS))
            assertEquals(commands.size,receipts.size);assertTrue(receipts.all {it.status==MapReceiptStatus.APPLIED})
            val farReceipt=receipts.first {it.commandId=="pin-far"}
            assertFalse("Offscreen visibility is not claimed",farReceipt.confirmedFeatureIds.contains("far-pin"))
            val focus=confirmations.first {it.commandId=="focus"};assertNull(focus.error)
            assertEquals(local.center().longitude,focus.camera!!.west,.00001);assertEquals(local.center().latitude,focus.camera!!.south,.00001)
            assertFalse(receipts.last().confirmedFeatureIds.contains("local-pin"))
            val durableFocus=receipts.first {it.commandId=="focus"};assertEquals(local.center().longitude,durableFocus.confirmedCamera!!.longitude,.00001)
            instrumentation.uiAutomation.takeScreenshot()?.let {bitmap->val file=File(instrumentation.targetContext.getExternalFilesDir(null),"observatory-renderer-smoke.png");file.outputStream().use {bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}}
        } finally {instrumentation.runOnMainSync {renderer.onPause();renderer.onStop();renderer.onDestroy()}}
    }
}
