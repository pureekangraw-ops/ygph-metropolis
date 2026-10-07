package com.big.gobrowser.browser

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import com.big.gobrowser.lyra.LyraDialog
import com.big.gobrowser.outsideview.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ObservatoryAppTest {
    @get:Rule val rule=ActivityTestRule(BrowserActivity::class.java)
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private fun views(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap {views(v.getChildAt(it))}else emptyList()
    @Test fun duplicateTabsAndActiveTabSurviveSessionRestore() {
        instrumentation.runOnMainSync {
            val host=android.widget.FrameLayout(rule.activity)
            val store=TabStore(rule.activity,host)
            store.clearSession()
            val first=store.open("https://example.com/")
            store.open("https://example.com/")
            store.select(first)
            val restored=TabStore(rule.activity,android.widget.FrameLayout(rule.activity))
            restored.restore()
            assertEquals(2,restored.list().size)
            assertEquals(first,restored.active()!!.id)
            restored.clearSession();store.clearSession()
        }
    }
    @Test fun lyraTrustedAssetModuleAndNativeContextBridgeRun() {
        instrumentation.runOnMainSync {LyraDialog.show(rule.activity,"OUTSIDE"){JSONObject().put("mapSummary",JSONObject().put("revision",7))}}
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15)
        var result=""
        while(System.nanoTime()<deadline) {
            val done=CountDownLatch(1)
            run {
                val roots=androidx.test.espresso.RootMatchers.isDialog()
                // The attached dialog WebView is captured from its bridge via Espresso's displayed root.
                androidx.test.espresso.Espresso.onView(androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom(WebView::class.java)).inRoot(roots).perform(object:androidx.test.espresso.ViewAction {
                    override fun getConstraints()=androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom(WebView::class.java)
                    override fun getDescription()="Read trusted Lyra module and bridge state"
                    override fun perform(ui:androidx.test.espresso.UiController,view:View) {(view as WebView).evaluateJavascript("JSON.stringify({ready:document.querySelector('#status').textContent.includes('AI'),context:JSON.parse(ObservatoryNative.context()).mapSummary.revision})"){result=it;done.countDown()}}
                })
            }
            assertTrue(done.await(5,TimeUnit.SECONDS))
            if(result.contains("ready\\\":true")&&result.contains("context\\\":7"))return
            Thread.sleep(100)
        }
        fail("Trusted module did not initialize: $result")
    }
    @Test fun nativeMapLibreFrameConfirmsActualOverlay() {
        val done=CountDownLatch(1)
        var receipt:MapReceipt?=null
        lateinit var renderer:MapLibreOutsideRenderer
        instrumentation.runOnMainSync {
            val host=android.widget.FrameLayout(rule.activity)
            rule.activity.setContentView(host)
            renderer=MapLibreOutsideRenderer(host)
            var started=false
            renderer.onReady={
                if(!started){started=true;renderer.reloadStyle(false)}
                else {
                    val root=java.io.File(rule.activity.cacheDir,"map-smoke-${System.nanoTime()}")
                    val store=MapStateStore(root)
                    val zone=Zone("smoke-zone","smoke",Bounds(100.49,13.74,100.51,13.76))
                    val executor=MapCommandExecutor(store,renderer,ExecutionScope.LOCAL_OWNER)
                    renderer.onConfirmed={receipt=store.load().receipts["smoke-command"];done.countDown()}
                    executor.submit(MapCommand("smoke-command",MapAction.UPSERT_ZONE,zone=zone))
                }
            }
            renderer.onStart();renderer.onResume()
        }
        try {
            assertTrue("MapLibre fully rendered callback",done.await(25,TimeUnit.SECONDS))
            assertEquals(MapReceiptStatus.APPLIED,receipt!!.status)
            assertTrue(receipt!!.confirmedFeatureIds.contains("smoke-zone"))
            instrumentation.uiAutomation.takeScreenshot()?.let {bitmap->
                val file=java.io.File(instrumentation.targetContext.getExternalFilesDir(null),"observatory-map-smoke.png")
                file.outputStream().use {bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
            }
        } finally {instrumentation.runOnMainSync {renderer.onPause();renderer.onStop();renderer.onDestroy()}}
    }
}
