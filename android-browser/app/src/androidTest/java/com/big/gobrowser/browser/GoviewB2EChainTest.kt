package com.big.gobrowser.browser

import android.Manifest
import android.app.NotificationManager
import android.net.Uri
import android.os.Process
import android.widget.CheckBox
import android.widget.EditText
import androidx.test.espresso.Espresso.onData
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.RootMatchers.isDialog
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import androidx.test.rule.GrantPermissionRule
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import com.big.gobrowser.outsideview.*
import org.hamcrest.Matchers.equalTo
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.TimeUnit

/** Host-driven, synthetic-only chain. Two instrumentations separated by a real process stop.
 * File URI injection exercises the app importer, not the Android document-picker UI.
 * Store export/Snapshot checks do not claim live GO transport or physical GPS evidence.
 */
@RunWith(AndroidJUnit4::class)
class GoviewB2EChainTest {
    private val screen=ActivityTestRule(OutsideViewActivity::class.java)
    @get:Rule val rules:RuleChain=RuleChain.outerRule(GrantPermissionRule.grant(
        Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.POST_NOTIFICATIONS)).around(screen)
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private val context get()=instrumentation.targetContext
    private val store get()=MapStateStore(context)
    private val checkpoint get()=File(context.filesDir,"goview-synthetic-b2e.json")
    private fun current():OutsideViewActivity {
        var result:OutsideViewActivity?=null
        instrumentation.runOnMainSync {result=ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).filterIsInstance<OutsideViewActivity>().singleOrNull()}
        return requireNotNull(result){"GOVIEW Activity must be resumed"}
    }
    private fun invoke(name:String) {
        val activity=current()
        instrumentation.runOnMainSync {OutsideViewActivity::class.java.getDeclaredMethod(name).apply {isAccessible=true}.invoke(activity)}
    }
    private fun await(message:String,predicate:()->Boolean) {
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(30)
        while(System.nanoTime()<deadline){if(predicate())return;Thread.sleep(100)}
        assertTrue(message,predicate())
    }
    private fun dialog(text:String)=await("Dialog available: $text") {runCatching {onView(withText(text)).inRoot(isDialog()).check(androidx.test.espresso.assertion.ViewAssertions.matches(isDisplayed()));true}.getOrDefault(false)}
    private fun rendered(predicate:(MapJournal)->Boolean={true})=await("Matching persisted/rendered revision required") {
        val journal=store.load();journal.pending==null && journal.renderedRevision==journal.state.revision && predicate(journal)
    }
    private fun offlineFrame() {
        val activity=current()
        instrumentation.runOnMainSync {
            val renderer=OutsideViewActivity::class.java.getDeclaredField("renderer").apply {isAccessible=true}.get(activity) as MapLibreOutsideRenderer
            renderer.mapView.getMapAsync {renderer.reloadStyle(false)}
        }
        rendered()
    }
    private fun file(raw:String):File=File(context.cacheDir,"goview-synthetic-chain.geojson").apply {writeText(raw)}
    private fun receive(raw:String) {
        val input=file(raw);val activity=current()
        instrumentation.runOnMainSync {OutsideViewActivity::class.java.getDeclaredMethod("importGeoJson",Uri::class.java).apply {isAccessible=true}.invoke(activity,Uri.fromFile(input))}
        dialog("อนุมัติ Update")
    }
    private fun approve(){onView(withText("อนุมัติ Update")).inRoot(isDialog()).perform(click())}
    private fun openEditor(label:String) {
        invoke("searchPins");dialog("ค้นหา")
        onView(isAssignableFrom(EditText::class.java)).inRoot(isDialog()).perform(replaceText(label),closeSoftKeyboard())
        onView(withText("ค้นหา")).inRoot(isDialog()).perform(click())
        dialog(label)
        onData(equalTo(label)).inRoot(isDialog()).perform(click())
        onView(withText("แก้ไข / ยืนยันหน้างาน")).inRoot(isDialog()).perform(click());dialog("GOVIEW · แก้ไขหมุด")
    }
    private fun feature(id:String,label:String,longitude:Double)=JSONObject().put("type","Feature").put("id",id)
        .put("geometry",JSONObject().put("type","Point").put("coordinates",JSONArray().put(longitude).put(20.0)))
        .put("properties",JSONObject().put("name",label))

    @Test fun continuousOwnerChainAcrossProcessRestart() {
        val phase=InstrumentationRegistry.getArguments().getString("goviewPhase")
        assumeTrue("Executed separately by emulator B2E host driver",phase=="before" || phase=="after")
        offlineFrame()
        if(phase=="before")beforeRestart() else afterRestart()
    }
    private fun beforeRestart() {
        assertFalse("Do not silently overwrite a previous chain checkpoint",checkpoint.exists())
        val initial=store.load()
        val name="SYNTHETIC-B2E-${System.nanoTime()}"
        val features=JSONArray()
        for(i in 0 until 39)features.put(feature("chain-$i",if(i==0)"B2E unique target" else "B2E support $i",10.0+i*.001))
        val raw=JSONObject().put("type","FeatureCollection").put("name",name).put("features",features).toString()
        val correlationCount=initial.updates.size
        receive(raw)
        assertEquals(initial.state.pins,store.load().state.pins)
        assertEquals("DOWNLOAD",store.load().updates.last().operation)
        approve()
        rendered {it.state.pins.size==initial.state.pins.size+39}
        val accepted=store.load();val download=accepted.updates[correlationCount];val update=accepted.updates.last()
        assertEquals("UPDATE",update.operation);assertTrue(update.readbackVerified)
        assertEquals(download.correlationId,update.correlationId);assertNotEquals(download.id,update.id)
        val id=accepted.state.pins.values.single {it.label=="B2E unique target"}.id
        openEditor("B2E unique target")
        onView(isAssignableFrom(CheckBox::class.java)).inRoot(isDialog()).check(androidx.test.espresso.assertion.ViewAssertions.matches(isNotChecked()))
        onView(withHint("ชื่อหมุด")).perform(replaceText("B2E confirmed target"),closeSoftKeyboard())
        onView(withHint("longitude")).perform(replaceText("11.0"),closeSoftKeyboard())
        onView(withHint("latitude")).perform(replaceText("21.0"),closeSoftKeyboard())
        onView(withHint("หมวดหมู่")).perform(replaceText("synthetic-b2e"),closeSoftKeyboard())
        onView(isAssignableFrom(CheckBox::class.java)).inRoot(isDialog()).perform(click())
        onView(withText("บันทึก")).inRoot(isDialog()).perform(click())
        rendered {it.state.pins[id]?.evidence?.coordinate==EvidenceStatus.VERIFIED}
        val edited=store.load().state.pins.getValue(id)
        assertEquals(Point(11.0,21.0),edited.point);assertEquals("owner-field-confirmation",edited.evidence.source)
        assertEquals("synthetic-b2e",edited.category)
        initial.state.pins.forEach {(key,value)->assertEquals(value,store.load().state.pins[key])}
        assertEquals(initial.state.notes,store.load().state.notes)
        val old=current();instrumentation.runOnMainSync {old.recreate()}
        await("New resumed Activity after recreation"){runCatching {current()!==old}.getOrDefault(false)}
        offlineFrame();assertEquals(edited,store.load().state.pins[id])
        // Owner start and notification Stop in this same chain; no location fix is fabricated.
        invoke("locationSessionDialog")
        onView(withText("เริ่ม GPS")).inRoot(isDialog()).perform(click())
        await("Owner-started GPS service running"){GoviewLocationService.running}
        val notification=context.getSystemService(NotificationManager::class.java).activeNotifications.single {it.id==GoviewLocationService.NOTIFICATION}.notification
        assertTrue(notification.flags and android.app.Notification.FLAG_ONGOING_EVENT!=0)
        notification.actions.single().actionIntent.send()
        await("Notification stop ends session"){!GoviewLocationService.running}
        assertNull(GoviewLocationService.currentFix())
        checkpoint.writeText(JSONObject().put("pid",Process.myPid()).put("id",id).put("count",store.load().state.pins.size)
            .put("revision",store.load().state.revision).put("raw",raw).toString())
        println("GOVIEW_B2E BEFORE: import/approval/render/search/edit/confirmation/recreation/GPS-stop PASS; pid=${Process.myPid()}")
    }
    private fun afterRestart() {
        assertTrue("First-phase checkpoint must survive process restart",checkpoint.isFile)
        val expected=JSONObject(checkpoint.readText());assertNotEquals(expected.getInt("pid"),Process.myPid())
        assertFalse("Stopped session must not restart with app",GoviewLocationService.running)
        val id=expected.getString("id");val persisted=store.load();val pin=persisted.state.pins.getValue(id)
        assertEquals(expected.getInt("count"),persisted.state.pins.size)
        assertEquals(expected.getLong("revision"),persisted.state.revision)
        assertEquals("B2E confirmed target",pin.label);assertEquals(Point(11.0,21.0),pin.point)
        assertEquals(EvidenceStatus.VERIFIED,pin.evidence.coordinate);assertEquals("synthetic-b2e",pin.category)
        // Export/readback uses the real storage codec; separately from selected Snapshot and transport.
        val exported=store.exportGeoJson();val batch=GeoJsonImport.parse(exported.byteInputStream())
        val duplicate=store.approveUpdate(store.previewUpdate(batch,"synthetic-b2e-export-reimport"))
        assertEquals("DUPLICATE",duplicate.status);assertTrue(duplicate.readbackVerified)
        assertEquals(pin,store.load().state.pins[id])
        val readbackRoot=File(context.cacheDir,"b2e-export-readback")
        val reader=MapStateStore(readbackRoot,SqliteJournalBackend(readbackRoot))
        reader.approveUpdate(reader.previewUpdate(batch,"synthetic-independent-readback"))
        val receivedPin=MapStateStore(readbackRoot,SqliteJournalBackend(readbackRoot)).load().state.pins.getValue(id)
        assertEquals(pin.point,receivedPin.point);assertEquals(pin.label,receivedPin.label);assertEquals(pin.category,receivedPin.category)
        assertEquals(EvidenceStatus.UNKNOWN,receivedPin.evidence.coordinate)
        val snapshot=store.selectedSnapshot(setOf(id),store.load().state.revision)
        assertEquals("SNAPSHOT",snapshot.receipt.operation)
        assertEquals(1,JSONObject(snapshot.json).getJSONArray("features").length())
        assertTrue(File(context.filesDir,"outside-view/snapshots/${snapshot.captureId}.geojson").isFile)
        assertEquals("BLOCKED",UnconfiguredGoviewExchange.uploadSelected(snapshot).status)
        assertEquals("BLOCKED",UnconfiguredGoviewExchange.downloadProposal(snapshot.captureId).receipt.status)
        val proposal=JSONObject().put("contractVersion",1).put("operation","propose-update").put("sourceCaptureId",snapshot.captureId).put("baseVersion",snapshot.version)
            .put("package",JSONObject().put("type","FeatureCollection").put("name","SYNTHETIC-B2E-PROPOSAL").put("features",JSONArray().put(feature("added","B2E proposed addition",12.0)))).toString()
        val beforeProposal=store.load();receive(proposal)
        assertEquals(beforeProposal.state,store.load().state)
        approve();rendered {it.state.pins.size==beforeProposal.state.pins.size+1}
        val approved=store.load();assertTrue(approved.updates.last().readbackVerified)
        assertEquals(pin,approved.state.pins[id])
        val previousBackups=store.backups().toSet()
        invoke("showStorageTools");onView(withText("สร้างสำเนาสำรอง")).inRoot(isDialog()).perform(click())
        await("Backup created"){store.backups().toSet()!=previousBackups}
        val backup=(store.backups().toSet()-previousBackups).single()
        openEditor(pin.label)
        onView(withHint("ชื่อหมุด")).perform(replaceText("B2E temporary edit"),closeSoftKeyboard())
        onView(withText("บันทึก")).inRoot(isDialog()).perform(click())
        rendered {it.state.pins[id]?.label=="B2E temporary edit"}
        invoke("showStorageTools");onView(withText("ตรวจและกู้คืนสำเนา")).inRoot(isDialog()).perform(click())
        dialog("เลือกสำเนา")
        onData(equalTo(backup)).inRoot(isDialog()).perform(click())
        dialog("อนุมัติกู้คืน")
        assertEquals("B2E temporary edit",store.load().state.pins[id]?.label)
        onView(withText("อนุมัติกู้คืน")).inRoot(isDialog()).perform(click())
        rendered {it.state.pins[id]==pin}
        val restored=store.load();assertEquals(approved.state.pins,restored.state.pins)
        assertEquals(approved.state.notes,restored.state.notes)
        assertEquals("STORAGE",restored.updates.last().operation);assertTrue(restored.updates.last().readbackVerified)
        assertTrue("Rollback copy retained",store.backups().size>=previousBackups.size+2)
        val reopened=MapStateStore(context).load()
        assertEquals(restored.state,reopened.state);assertEquals(restored.updates,reopened.updates)
        println("GOVIEW_B2E AFTER: new-process/readback/export/duplicate/selected-snapshot/local-proposal/approval/backup/restore PASS; live Upload/Download BLOCKED; pid=${Process.myPid()}")
    }
}
