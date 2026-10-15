package com.big.gobrowser.browser

import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import android.app.AlertDialog
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.net.ServerSocket

/** Exercises the shipped Gecko extension and the actual owner-assist panel together. */
@RunWith(AndroidJUnit4::class)
class GeckoAssistFlowTest {
    @get:Rule val rule = ActivityTestRule(GeckoBrowserActivity::class.java)
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private fun views(v: View): List<View> = listOf(v) + if (v is ViewGroup) (0 until v.childCount).flatMap { views(v.getChildAt(it)) } else emptyList()
    private fun <T> field(name: String): T = GeckoBrowserActivity::class.java.getDeclaredField(name).let {
        it.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        it.get(rule.activity) as T
    }
    private fun capture(): DomCapture? = field<Pair<String, DomCapture>?>("latestDom")?.second
    private fun await(description: String, predicate: () -> Boolean) {
        val end = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(40)
        var ready = false
        while (!ready && System.nanoTime() < end) {
            instrumentation.runOnMainSync { ready = predicate() }
            if (!ready) Thread.sleep(100)
        }
        assertTrue(description, ready)
    }
    @Test fun absentButtonLinkDoesNotBecomeAnUnsafeNullString() {
        val target = org.json.JSONObject().put("targetId", "target-test").put("tag", "button")
            .put("type", "button").put("label", "Continue").put("signature", "signed-target")
            .put("href", org.json.JSONObject.NULL).put("role", org.json.JSONObject.NULL)
        val parsed = DomCapture.from(org.json.JSONObject().put("targets", org.json.JSONArray().put(target))).targets.single()
        assertNull(parsed.href); assertNull(parsed.role)
        assertNull("An ordinary button without a link is a valid click target", BrowserAssistPolicy.rejection(parsed, "CLICK"))
    }
    @Test fun ownerFillsAndClicksInOnePanelDespiteUnrelatedDomInsertion() {
        val server = ServerSocket(0, 8, java.net.InetAddress.getByName("127.0.0.1"))
        val html = """<!doctype html><html><body>
            <input aria-label="Search" oninput="document.getElementById('state').textContent=this.value">
            <button onclick="document.getElementById('state').textContent='Clicked'">Continue</button>
            <p id="state">Ready</p>
            <script>setTimeout(()=>{const b=document.createElement('button');b.type='button';b.textContent='Other';document.body.prepend(b)},6000)</script>
            </body></html>""".toByteArray(Charsets.UTF_8)
        val thread = Thread {
            try {
                while (!server.isClosed) server.accept().use { socket ->
                    socket.soTimeout = 5000
                    val reader = socket.getInputStream().bufferedReader()
                    while (true) { val line = reader.readLine() ?: break; if (line.isEmpty()) break }
                    socket.getOutputStream().apply {
                        write("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${html.size}\r\nConnection: close\r\n\r\n".toByteArray())
                        write(html); flush()
                    }
                }
            } catch (_: java.io.IOException) { /* Server is closed by the test. */ }
        }.apply { isDaemon = true; start() }
        try {
            val url = "http://127.0.0.1:${server.localPort}/assist"
            instrumentation.runOnMainSync {
                // Test-only local fixture; owner-entered URLs retain the HTTPS policy.
                val tab = field<GeckoBrowserEngine>("engine").active()!!
                tab.requestedUrl = url; tab.session.loadUri(url)
            }
            await("Gecko must observe the real fixture input") { capture()?.targets?.any { it.label == "Search" } == true }
            instrumentation.runOnMainSync {
                views(rule.activity.window.decorView).single { it.contentDescription == "ช่วยกรอกหรือช่วยกดบนหน้าเว็บ" }.performClick()
            }
            val dialog = field<AlertDialog>("assistDialog")
            assertTrue(dialog.isShowing)
            await("Unrelated insertion must reach the native observer while the panel remains open") { capture()?.targets?.any { it.label == "Other" } == true }
            instrumentation.runOnMainSync {
                views(dialog.window!!.decorView).filterIsInstance<EditText>().single().setText("Filled from panel")
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick()
            }
            await("Fill must dispatch input events in the real Gecko document") { capture()?.text?.contains("Filled from panel") == true }
            await("The same panel must show the fill result") {
                dialog.isShowing && views(dialog.window!!.decorView).filterIsInstance<TextView>().any { it.text.toString().startsWith("กรอกแล้ว") }
            }
            instrumentation.runOnMainSync {
                val spinner = views(dialog.window!!.decorView).filterIsInstance<Spinner>().single()
                val labels = (0 until spinner.adapter.count).map { spinner.adapter.getItem(it).toString() }
                val index = labels.indexOfFirst { it.contains("กด · Continue") }
                assertTrue("Continue must be available among: $labels", index >= 0)
                spinner.setSelection(index)
            }
            instrumentation.waitForIdleSync()
            instrumentation.runOnMainSync { dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick() }
            await("Click must affect the real Gecko document") { capture()?.text?.contains("Clicked") == true }
            assertTrue("Assist result remains in the same panel", dialog.isShowing)
            instrumentation.runOnMainSync { dialog.dismiss() }
            var timeoutReason: String? = null
            var callbackCount = 0
            instrumentation.runOnMainSync {
                val engine = field<GeckoBrowserEngine>("engine")
                val observer = GeckoBrowserEngine::class.java.getDeclaredField("observer").let {
                    it.isAccessible = true; it.get(engine) as GeckoPageObserver
                }
                // The real extension ignores unknown message types. Native must still finish waiting.
                observer.dispatch(engine.active()!!.session, org.json.JSONObject().put("type", "IGNORE_TEST_MESSAGE").put("commandId", "timeout-test")) { accepted, reason ->
                    assertFalse(accepted); callbackCount++; timeoutReason = reason
                }
            }
            await("A missing extension reply must produce a visible timeout result") { timeoutReason == "COMMAND_TIMEOUT" }
            assertEquals("A pending command completes once", 1, callbackCount)
        } finally { server.close(); thread.join(1000) }
    }
}
