package com.big.gobrowser.browser

import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.RootMatchers.isDialog
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import com.big.gobrowser.outsideview.*
import com.big.gobrowser.ui.ObservatoryTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class OutsideViewFlowTest {
    @get:Rule val rule=ActivityTestRule(OutsideViewActivity::class.java)
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private fun views(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap {views(v.getChildAt(it))}else emptyList()
    private fun rendered(store:MapStateStore, predicate:()->Boolean) {
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(25)
        while(System.nanoTime()<deadline){
            val journal=store.load()
            if(journal.pending==null&&journal.renderedRevision==journal.state.revision&&predicate())return
            Thread.sleep(100)
        }
        fail("Map did not complete a matching rendered revision")
    }
    @Test fun phoneMapControlsSaveAndFocusAnOwnerPin() {
        val store=MapStateStore(rule.activity)
        val before=store.load().state.pins.size
        instrumentation.runOnMainSync {
            val field=OutsideViewActivity::class.java.getDeclaredField("renderer").apply {isAccessible=true}
            val renderer=field.get(rule.activity) as MapLibreOutsideRenderer
            renderer.mapView.getMapAsync {renderer.reloadStyle(false)}
        }
        rendered(store){true}
        instrumentation.runOnMainSync {
            val root=rule.activity.window.decorView
            val buttons=views(root).filterIsInstance<Button>()
            val send=buttons.single {it.text.toString()=="GO · แชร์ / รับ"}
            val position=IntArray(2);send.getLocationOnScreen(position)
            assertTrue(position[0]>=0&&position[0]+send.width<=root.width)
            assertTrue(send.height>=ObservatoryTheme.dp(rule.activity,48))
            assertTrue(views(root).any {it is org.maplibre.android.maps.MapView&&it.height>=ObservatoryTheme.dp(rule.activity,200)})
        }
        onView(withText("จุดของฉัน")).perform(click())
        onView(withText("บันทึกจุดตรงกลางแผนที่")).inRoot(isDialog()).perform(click())
        onView(isAssignableFrom(EditText::class.java)).inRoot(isDialog()).perform(replaceText("Owner flow pin"),closeSoftKeyboard())
        onView(withText("บันทึก")).inRoot(isDialog()).perform(click())
        rendered(store){store.load().state.pins.size==before+1}
        onView(withText("จุดของฉัน")).perform(click())
        onView(withText("จุดที่บันทึก / โน้ต")).inRoot(isDialog()).perform(click())
        androidx.test.espresso.Espresso.onData(org.hamcrest.Matchers.equalTo("Owner flow pin")).inRoot(isDialog()).perform(click())
        onView(withText("ดูบนแผนที่")).inRoot(isDialog()).perform(click())
        rendered(store){store.load().state.focused!=null}
        val focused=store.load().state.focused
        assertTrue(store.load().state.pins.containsKey(focused))
        // Actual SDK map tap reads the focused rendered pin, without creating a new pin.
        val revisionBeforeTap=store.load().state.revision
        onView(isAssignableFrom(org.maplibre.android.maps.MapView::class.java)).perform(click())
        onView(withText("ยังไม่มีโน้ต")).inRoot(isDialog()).check(androidx.test.espresso.assertion.ViewAssertions.matches(isDisplayed()))
        assertEquals(revisionBeforeTap,store.load().state.revision)
        onView(withText("เพิ่ม / แก้โน้ต")).inRoot(isDialog()).perform(click())
        onView(isAssignableFrom(EditText::class.java)).inRoot(isDialog()).perform(replaceText("Owner pin note"),closeSoftKeyboard())
        onView(withText("บันทึก")).inRoot(isDialog()).perform(click())
        rendered(store){store.load().state.notes[focused]=="Owner pin note"}
        onView(isAssignableFrom(org.maplibre.android.maps.MapView::class.java)).perform(click())
        onView(withText("Owner pin note")).inRoot(isDialog()).check(androidx.test.espresso.assertion.ViewAssertions.matches(isDisplayed()))
        onView(withText("ปิด")).inRoot(isDialog()).perform(click())
        onView(withText("เพิ่มเติม")).perform(click())
        onView(withText("ลองแสดงใหม่")).inRoot(isDialog()).check(androidx.test.espresso.assertion.ViewAssertions.matches(isDisplayed()))
        instrumentation.uiAutomation.takeScreenshot()?.let {image->
            java.io.File(rule.activity.getExternalFilesDir(null),"observatory-map-flow.png").outputStream().use {image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
        }
    }
    @Test fun syntheticFileRequiresApprovalAndSurvivesScreenRecreation() {
        val store=MapStateStore(rule.activity)
        instrumentation.runOnMainSync {
            val renderer=OutsideViewActivity::class.java.getDeclaredField("renderer").apply {isAccessible=true}.get(rule.activity) as MapLibreOutsideRenderer
            renderer.mapView.getMapAsync {renderer.reloadStyle(false)}
        }
        rendered(store){true}
        val before=store.load().state.pins.size
        val features=org.json.JSONArray()
        for(i in 0 until 39)features.put(org.json.JSONObject().put("type","Feature").put("id","synthetic-$i")
            .put("geometry",org.json.JSONObject().put("type","Point").put("coordinates",org.json.JSONArray().put(10.0+i*.001).put(20.0)))
            .put("properties",org.json.JSONObject().put("name","Synthetic UI $i")))
        val file=java.io.File(rule.activity.cacheDir,"goview-ui-synthetic.geojson")
        file.writeText(org.json.JSONObject().put("type","FeatureCollection").put("name","SYNTHETIC-UI-${System.nanoTime()}").put("features",features).toString())
        instrumentation.runOnMainSync {
            OutsideViewActivity::class.java.getDeclaredMethod("importGeoJson",android.net.Uri::class.java).apply {isAccessible=true}.invoke(rule.activity,android.net.Uri.fromFile(file))
        }
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15)
        while(store.load().updates.none {it.operation=="DOWNLOAD"} && System.nanoTime()<deadline)Thread.sleep(100)
        assertEquals("Receiving a file must not apply it",before,store.load().state.pins.size)
        onView(isAssignableFrom(android.widget.CheckBox::class.java)).inRoot(isDialog()).perform(click())
        onView(withText("อนุมัติ Update")).inRoot(isDialog()).perform(click())
        rendered(store){store.load().state.pins.size==before+39}
        assertTrue(store.load().updates.any {it.operation=="UPDATE" && it.readbackVerified})
        val bitmap=instrumentation.uiAutomation.takeScreenshot()
        assertNotNull("Synthetic map screenshot available",bitmap)
        val evidence=java.io.File(rule.activity.getExternalFilesDir(null),"goview-synthetic-39.png")
        evidence.outputStream().use {bitmap!!.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
        bitmap!!.recycle()
        instrumentation.uiAutomation.executeShellCommand("cp ${evidence.absolutePath} /data/local/tmp/goview-synthetic-39.png").use {java.io.FileInputStream(it.fileDescriptor).use {stream->stream.readBytes()}}

        // A new store instance mirrors a recreated screen's read; the Activity recreation is real.
        instrumentation.runOnMainSync {rule.activity.recreate()}
        instrumentation.waitForIdleSync()
        assertEquals(before+39,MapStateStore(instrumentation.targetContext).load().state.pins.size)
        file.delete()
    }

    @Test fun journalUiReadCompletedAfterPauseDoesNotOpenBackgroundUi() {
        val activity=rule.activity
        val type=OutsideViewActivity::class.java
        val queue=type.getDeclaredField("worker").apply {isAccessible=true}.get(activity) as java.util.concurrent.ExecutorService
        val entered=java.util.concurrent.CountDownLatch(1)
        val release=java.util.concurrent.CountDownLatch(1)
        val called=java.util.concurrent.atomic.AtomicBoolean(false)
        val revision=MapStateStore(activity).load().state.revision
        var paused=false
        try {
            queue.submit {entered.countDown();check(release.await(5,TimeUnit.SECONDS))}
            assertTrue(entered.await(5,TimeUnit.SECONDS))
            instrumentation.runOnMainSync {
                val callback:(MapJournal)->Unit={called.set(true)}
                type.getDeclaredMethod("withJournal",kotlin.jvm.functions.Function1::class.java).apply {isAccessible=true}.invoke(activity,callback)
                instrumentation.callActivityOnPause(activity)
                paused=true
            }
            release.countDown()
            queue.submit {}.get(5,TimeUnit.SECONDS)
            instrumentation.waitForIdleSync()
            assertFalse("late read must not launch UI after Activity pause",called.get())
            assertEquals("background UI read never mutates owner data",revision,MapStateStore(activity).load().state.revision)
        } finally {
            release.countDown()
            if(paused)instrumentation.runOnMainSync {instrumentation.callActivityOnResume(activity)}
        }
    }

}
