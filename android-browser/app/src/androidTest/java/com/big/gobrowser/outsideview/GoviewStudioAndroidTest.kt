package com.big.gobrowser.outsideview

import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
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
        val field = GoviewStudioActivity::class.java.getDeclaredField("web").apply { isAccessible = true }
        return field.get(screen.activity) as WebView
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
            val text = js("document.getElementById('counts')?.textContent") as? String ?: ""
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
        val before = target.exists()
        val jsonArgument = JSONObject.quote(payload)
        assertEquals(true, js("window.GoviewStudio.receiveImport($jsonArgument);" +
            "document.getElementById('modal').classList.contains('open')"))
        assertEquals(before, target.exists())
        assertEquals(true, js("document.getElementById('modalText').textContent.includes('nodes:')"))
        assertEquals(true, js("document.getElementById('modalOk').click(); true"))
        await("Approved package becomes an actual per-map file") {
            target.exists() && runCatching {
                JSONObject(target.readText()).getJSONObject("map").getString("mapId") == testId
            }.getOrDefault(false)
        }
    }
}
