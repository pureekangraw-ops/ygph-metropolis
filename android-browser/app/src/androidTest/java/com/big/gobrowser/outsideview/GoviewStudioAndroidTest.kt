package com.big.gobrowser.outsideview

import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import androidx.test.rule.ActivityTestRule
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Actual Android WebView + native AtomicFile path for GO-created road maps.
 * Synthetic map geometry ONLY; this does not claim field-verified roads or handset acceptance.
 */
@RunWith(AndroidJUnit4::class)
class GoviewStudioAndroidTest {
    @get:Rule val screen = ActivityTestRule(GoviewStudioActivity::class.java)
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()

    private fun webView(): WebView {
        // Following a real Activity.recreate() we must read the current screen, not the old Rule reference.
        val current = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)
            .filterIsInstance<GoviewStudioActivity>().singleOrNull()
            ?: error("No currently resumed GOVIEW Studio Activity")
        val field = GoviewStudioActivity::class.java.getDeclaredField("web").apply { isAccessible = true }
        return field.get(current) as WebView
    }

    private fun js(expression: String): Any? {
        val signal = CountDownLatch(1)
        val result = AtomicReference<String>()
        instrumentation.runOnMainSync {
            webView().evaluateJavascript(expression) { response ->
                result.set(response)
                signal.countDown()
            }
        }
        assertTrue("JavaScript callback timed out for studio WebView", signal.await(12, TimeUnit.SECONDS))
        return JSONTokener(result.get() ?: "null").nextValue()
    }

    private fun await(message: String, predicate: () -> Boolean) {
        val until = System.nanoTime() + TimeUnit.SECONDS.toNanos(30)
        while (System.nanoTime() < until) {
            if (predicate()) return
            Thread.sleep(200)
        }
        assertTrue(message, predicate())
    }

    @Test fun goDrawnMapRendersRoutesAndPersistsAfterRelaunch() {
        await("GO Map Studio bundle must load") {
            js("Boolean(window.GoviewEngine && window.GoviewStudio && document.getElementById('demo'))") == true
        }

        assertEquals(true, js("document.getElementById('demo').click(); document.getElementById('modal').classList.contains('open')"))
        assertEquals(true, js("document.getElementById('modalOk').click(); document.getElementById('counts').textContent.includes('11 ถนน')"))
        // Preserve an actual emulator screenshot of the GO-authored map for later visual inspection.
        runCatching {
            val image = instrumentation.uiAutomation.takeScreenshot() ?: return@runCatching
            val folder = screen.activity.getExternalFilesDir(null) ?: return@runCatching
            File(folder, "goview-studio-go-drawn.png").outputStream().use {
                image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
            image.recycle()
        }
        val summary = js("JSON.stringify(GoviewEngine.route(GoviewEngine.demo(),'A','I'))") as String
        val route = JSONObject(summary)
        assertEquals(800.0, route.getDouble("meters"), 0.01)
        assertEquals(4, route.getJSONArray("nodeIds").length())

        val target = File(screen.activity.filesDir, "goview-studio-maps/go_synthetic_route_demo.goview.json")
        await("GO-generated map must survive native file readback") {
            target.exists() && runCatching {
                val text = target.readText()
                text.contains("go_synthetic_route_demo") &&
                    JSONObject(text).getJSONObject("map").getJSONArray("roads").length() == 11
            }.getOrDefault(false)
        }
        await("Native save receipt must be linked to the just-written file") {
            (js("document.getElementById('message').textContent") as? String ?: "").contains("ตรวจอ่านกลับสำเร็จ")
        }

        instrumentation.runOnMainSync { screen.activity.recreate() }
        await("Recreated Activity must restore same map from AtomicFile") {
            val text = runCatching {
                js("document.getElementById('counts')?.textContent") as? String ?: ""
            }.getOrDefault("")
            text.contains("9 จุด") && text.contains("11 ถนน")
        }
    }

    @Test fun sharedPackageWaitsForExplicitApprovalBeforeSaving() {
        await("GO bundle must load") {
            js("Boolean(window.GoviewStudio && window.GoviewEngine)") == true
        }
        val testId = "go_synthetic_approval_gate"
        val target = File(screen.activity.filesDir, "goview-studio-maps/$testId.goview.json")
        // Synthetic test file only; never touch preexisting user data.
        val payload = js(
            "(()=>{const map=GoviewEngine.demo();" +
                "map.mapId='$testId';map.version=2;return GoviewEngine.pack(map)})()"
        ) as String
        val beforeContent = target.takeIf { it.exists() }?.readText()
        val jsonArgument = JSONObject.quote(payload)
        js("window.GoviewStudio.receiveImport($jsonArgument);true")
        await("Destination read must precede approval preview") {
            js("document.getElementById('modal').classList.contains('open')") == true
        }
        assertEquals(beforeContent, target.takeIf { it.exists() }?.readText())
        assertEquals(true, js("document.getElementById('modalText').textContent.includes('nodes:')"))
        assertEquals(true, js("document.getElementById('modalOk').click(); true"))
        await("Approved package becomes an actual per-map file") {
            target.exists() && runCatching {
                JSONObject(target.readText()).getJSONObject("map").getString("mapId") == testId
            }.getOrDefault(false)
        }
    }
    @Test fun nativeDestinationRejectsConflictsAndRetainsPreviousVersion() {
        await("Studio ready") { js("Boolean(window.GoviewEngine && window.GoviewHost)") == true }
        val id = "synthetic_guard_" + System.nanoTime()
        val file = File(screen.activity.filesDir, "goview-studio-maps/$id.goview.json")
        fun payload(version: Int, title: String) = js("(()=>{const m=GoviewEngine.demo();m.mapId='$id';m.version=$version;m.title='$title';return GoviewEngine.pack(m)})()") as String
        fun save(raw: String) { js("document.getElementById('message').textContent='waiting';GoviewHost.savePackage(" + JSONObject.quote(raw) + ");true") }
        val original = payload(1, "Original")
        save(original)
        await("Initial native commit") { file.exists() && file.readText() == original }
        val conflicting = payload(1, "Conflicting")
        save(conflicting)
        await("Native guard rejects conflict even outside JS preview") {
            (js("document.getElementById('message').textContent") as? String ?: "").contains("ตรวจไฟล์")
        }
        assertEquals(original, file.readText())
        val update = payload(2, "Updated")
        save(update)
        await("New version committed") { file.readText() == update }
        assertEquals(original, File(file.parentFile, "$id.v1.backup.json").readText())
        save(original)
        await("Stale version rejected") {
            (js("document.getElementById('message').textContent") as? String ?: "").contains("ตรวจไฟล์")
        }
        assertEquals(update, file.readText())
        val third = payload(3, "Proposal")
        js("document.getElementById('message').textContent='waiting';GoviewHost.saveApprovedPackage(" + JSONObject.quote(third) + "," + JSONObject.quote(original) + ");true")
        await("Changed preview base must reject even a newer proposal") {
            (js("document.getElementById('message').textContent") as? String ?: "").contains("ตรวจไฟล์")
        }
        assertEquals(update, file.readText())
        instrumentation.runOnMainSync { screen.activity.recreate() }
        await("Recreated screen ready") { runCatching { js("Boolean(window.GoviewHost)") == true }.getOrDefault(false) }
        save(conflicting)
        await("Recreated instance also checks destination version") {
            (js("document.getElementById('message').textContent") as? String ?: "").contains("ตรวจไฟล์")
        }
        assertEquals(update, file.readText())
    }

    @Test fun downloadValidationBindsIdentityVersionAndDigestWithoutSaving() {
        await("Studio ready") { js("Boolean(window.GoviewEngine)") == true }
        val id = "synthetic_download_" + System.nanoTime()
        val raw = js("(()=>{const m=GoviewEngine.demo();m.mapId='$id';return GoviewEngine.pack(m)})()") as String
        val digest = java.security.MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 255) }
        val validator = GoviewStudioActivity::class.java.getDeclaredMethod("validateDownloadedPackage",
            String::class.java, String::class.java, String::class.java, String::class.java).apply { isAccessible = true }
        validator.invoke(screen.activity, raw, id, "1", digest)
        for (headers in listOf(arrayOf("other", "1", digest), arrayOf(id, "2", digest), arrayOf(id, "1", "bad"))) {
            val failure = runCatching { validator.invoke(screen.activity, raw, headers[0], headers[1], headers[2]) }.exceptionOrNull()
            assertTrue("Mismatched download envelope must be rejected", failure is java.lang.reflect.InvocationTargetException)
        }
        assertFalse("Download validation must not commit", File(screen.activity.filesDir, "goview-studio-maps/$id.goview.json").exists())
    }

    @Test fun inactiveDestinationCancelAndExactBytesSurviveApproval() {
        await("Studio ready") { js("Boolean(window.GoviewEngine && window.GoviewHost)") == true }
        val suffix = System.nanoTime().toString()
        val id = "synthetic_inactive_$suffix"
        fun payload(version: Int) = js("(()=>{const m=GoviewEngine.demo();m.mapId='$id';m.version=$version;return GoviewEngine.pack(m)})()") as String
        val original = payload(5)
        val file = File(screen.activity.filesDir, "goview-studio-maps/$id.goview.json")
        js("GoviewHost.savePackage(" + JSONObject.quote(original) + ");true")
        await("Saved inactive fixture") { file.exists() && file.readText() == original }
        js("(()=>{const m=GoviewEngine.demo();m.mapId='active_$suffix';GoviewHost.savePackage(GoviewEngine.pack(m));GoviewStudio.receiveNativePackage(GoviewEngine.pack(m));})()")
        js("GoviewStudio.receiveImport(" + JSONObject.quote(payload(2)) + ");true")
        await("Inactive destination preview") { js("document.getElementById('modal').classList.contains('open')") == true }
        js("document.getElementById('modalOk').click();true")
        await("Downgrade rejected against B v5 while A open") { (js("document.getElementById('message').textContent") as? String ?: "").contains("STALE_VERSION") }
        assertEquals(original, file.readText())
        val exact = JSONObject(payload(6)).toString(4)
        js("GoviewStudio.receiveImport(" + JSONObject.quote(exact) + ");true")
        await("New proposal preview") { js("document.getElementById('modal').classList.contains('open')") == true }
        js("document.getElementById('modalCancel').click();true")
        assertEquals(original, file.readText())
        js("GoviewStudio.receiveImport(" + JSONObject.quote(exact) + ");true")
        await("Proposal preview again") { js("document.getElementById('modal').classList.contains('open')") == true }
        js("document.getElementById('modalOk').click();true")
        await("Exact original imported bytes retained, including whitespace") { file.readText() == exact }
        assertEquals(original, File(file.parentFile, "$id.v5.backup.json").readText())
    }

}
