package com.big.gobrowser.browser

import android.graphics.RectF
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import com.big.gobrowser.outsideview.MapLibreOutsideRenderer
import com.big.gobrowser.outsideview.Point
import com.big.gobrowser.ui.ObservatoryTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ObservatoryMobileTest {
    @get:Rule val rule=ActivityTestRule(BrowserActivity::class.java)
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private fun views(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap {views(v.getChildAt(it))}else emptyList()
    @Test fun primaryPhoneControlsFitWithoutSidewaysScrolling() {
        instrumentation.waitForIdleSync()
        instrumentation.runOnMainSync {
            val root=rule.activity.window.decorView
            val buttons=views(root).filterIsInstance<Button>()
            for(label in listOf("ไลร่า","แผนที่","แชร์ให้โก")) {
                val button=buttons.single {it.text.toString()==label}
                val position=IntArray(2);button.getLocationOnScreen(position)
                assertTrue("$label left edge",position[0]>=0)
                assertTrue("$label right edge",position[0]+button.width<=root.width)
                assertTrue("$label touch target",button.height>=ObservatoryTheme.dp(rule.activity,48))
            }
            assertTrue(buttons.any {it.contentDescription=="ตั้งค่าการเชื่อมต่อ"})
            assertTrue(views(root).filterIsInstance<android.widget.TextView>().any {it.text.toString().contains("ยังไม่เชื่อมเมโทร")})
        }
        instrumentation.uiAutomation.takeScreenshot()?.let {bitmap->
            java.io.File(instrumentation.targetContext.getExternalFilesDir(null),"observatory-mobile-browser.png").outputStream().use {bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
        }
    }
    @Test fun deviceLocationOverlayIsVisibleAndCanBeClearedIndependently() {
        val done=CountDownLatch(1);val cleared=CountDownLatch(1);var visible=false;var clearing=false
        lateinit var renderer:MapLibreOutsideRenderer
        instrumentation.runOnMainSync {
            val host=android.widget.FrameLayout(rule.activity);rule.activity.setContentView(host)
            renderer=MapLibreOutsideRenderer(host)
            var offline=false;var locating=false
            renderer.onReady={if(!offline){offline=true;renderer.reloadStyle(false)}else if(!locating){
                locating=true
                renderer.mapView.getMapAsync {map->
                    renderer.mapView.addOnDidFinishRenderingFrameListener {fully,_,_->
                        if(fully){
                            val features=map.queryRenderedFeatures(RectF(0f,0f,renderer.mapView.width.toFloat(),renderer.mapView.height.toFloat()),"device-location-dot")
                            if(!visible && features.isNotEmpty()){visible=true;done.countDown()}
                            if(clearing && features.isEmpty())cleared.countDown()
                        }
                    }
                }
                renderer.showLocation(Point(100.5,13.75));assertTrue(renderer.centerOnLocation(Point(100.5,13.75)))
            }}
            renderer.onStart();renderer.onResume()
        }
        try {
            assertTrue("Device location is drawn in a real frame",done.await(25,TimeUnit.SECONDS))
            assertTrue(visible)
            instrumentation.uiAutomation.takeScreenshot()?.let {bitmap->
                java.io.File(instrumentation.targetContext.getExternalFilesDir(null),"observatory-mobile-location.png").outputStream().use {bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
            }
            instrumentation.runOnMainSync {clearing=true;renderer.showLocation(null)}
            assertTrue("Location marker clears without changing owner overlays",cleared.await(10,TimeUnit.SECONDS))
        } finally {instrumentation.runOnMainSync {renderer.onPause();renderer.onStop();renderer.onDestroy()}}
    }
}
