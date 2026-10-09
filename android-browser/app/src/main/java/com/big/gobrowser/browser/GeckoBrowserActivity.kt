package com.big.gobrowser.browser

import android.app.*
import android.content.*
import android.os.*
import android.view.*
import android.view.inputmethod.EditorInfo
import android.widget.*
import com.big.gobrowser.R
import com.big.gobrowser.BuildConfig
import com.big.gobrowser.control.*
import com.big.gobrowser.lyra.LyraDialog
import com.big.gobrowser.observer.*
import com.big.gobrowser.outsideview.OutsideViewActivity
import com.big.gobrowser.transport.*
import com.big.gobrowser.ui.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/** Full Observatory browser surface backed by GeckoView; WebView remains only as a comparison implementation. */
class GeckoBrowserActivity : Activity() {
    private lateinit var engine: GeckoBrowserEngine
    private lateinit var address: EditText
    private lateinit var shareButton: Button
    private lateinit var sharingStatus: TextView
    private lateinit var eyeStatus: TextView
    private lateinit var connectionDiagnostics: TextView
    private lateinit var observerSession: ObserverSession
    private lateinit var metropolis: MetropolisMcpClient
    private val handler = Handler(Looper.getMainLooper())
    private val network = Executors.newSingleThreadExecutor()
    private val permissions by lazy {
        val prefs = getSharedPreferences("observatory-epochs", MODE_PRIVATE)
        val seed = maxOf(System.currentTimeMillis(), prefs.getLong("gecko", 0L) + 1)
        check(prefs.edit().putLong("gecko", seed).commit())
        PermissionStore(seed, deviceScope = true)
    }
    private val outbox = Outbox()
    private var foreground = false
    private var destroyed = false
    private var captureBusy = false
    private var syncBusy = false
    private var generation = 0L
    private var lastAck: Long? = null
    private var acknowledgedCapture: String? = null
    private var deliveryFailed = false
    private var lastConnectionStatus = "NOT_ATTEMPTED"
    private var hubArrival: MetropolisMcpClient.HubArrival? = null
    private val tick = object : Runnable {
        override fun run() {
            if (!foreground || destroyed) return
            engine.active()?.let { captureIfShared(it) }
            syncActive(); updateSharingStatus(); handler.postDelayed(this, 5_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        metropolis = MetropolisMcpClient(this)
        observerSession = ObserverSession("local-device", "${BuildConfig.VERSION_NAME}-gecko")
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(ObservatoryTheme.title(this, "หอดูดาว · Gecko Browser"))
        root.addView(ObservatoryBuildStamp.view(this))
        val addressRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(8, 4, 8, 4) }
        address = EditText(this).apply { hint = "https://example.com"; setSingleLine(true); imeOptions = EditorInfo.IME_ACTION_GO; layoutParams = LinearLayout.LayoutParams(0, -2, 1f); setOnEditorActionListener { _, _, _ -> navigateFromAddress(); true } }
        ObservatoryTheme.address(address); addressRow.addView(address); addressRow.addView(button("ไป") { navigateFromAddress() })
        root.addView(addressRow)
        val navigation = scrollRow(button("ย้อนกลับ") { engine.back() }, button("ถัดไป") { engine.forward() }, button("รีโหลด") { engine.reload() }, button("แท็บ") { showTabs() }, button("+") { engine.open(); renderActive() })
        val share = button("GO / Share") { toggleShare() }
        val controls = scrollRow(share, button("แผนที่") { startActivity(Intent(this, OutsideViewActivity::class.java)) }, button("ไลร่า") { LyraDialog.show(this, "INSIDE") { lyraContext() } }, button("เชื่อม GO") { if (hubArrival?.actor == "GO" || metropolis.pairedObservatory() != null) showConnectionMenu() else connectHub() })
        root.addView(navigation); root.addView(controls)
        shareButton = share
        sharingStatus = ObservatoryTheme.status(this); root.addView(sharingStatus)
        eyeStatus = ObservatoryTheme.status(this); root.addView(eyeStatus)
        connectionDiagnostics = ObservatoryTheme.status(this).apply { maxLines = 2 }
        root.addView(connectionDiagnostics)
        val browserContainer = FrameLayout(this).apply { setBackgroundColor(0xff07101b.toInt()) }
        root.addView(browserContainer, LinearLayout.LayoutParams(-1, 0, 1f))
        ObservatoryTheme.apply(this, root); PhoneLayout.fitSystemBars(root); setContentView(root)
        val geckoView = org.mozilla.geckoview.GeckoView(this); browserContainer.addView(geckoView, FrameLayout.LayoutParams(-1, -1))
        engine = GeckoBrowserEngine(this, browserContainer, { url -> runOnUiThread { address.setText(url) } }, { tab, capture -> onCapture(tab, capture) }) { _, url ->
            metropolis.handleCallback(url) { result ->
                result.onSuccess { arrival ->
                    runOnUiThread {
                        if (destroyed || isFinishing) return@runOnUiThread
                        hubArrival = arrival
                        lastConnectionStatus = "HUB_ARRIVE_OK"
                        engine.navigate(BrowserSettings.OBSERVATORY_HOME_URL)
                        say("เชื่อมต่อ Hub สำเร็จ · ${arrival.actor} · กำลังจับคู่หอดูดาว")
                        updateSharingStatus()
                        pairObservatory()
                    }
                }.onFailure { error ->
                    runOnUiThread {
                        if (destroyed || isFinishing) return@runOnUiThread
                        lastConnectionStatus = safeConnectionCode(error)
                        engine.navigate(BrowserSettings.OBSERVATORY_HOME_URL)
                        say("เชื่อม Hub ไม่สำเร็จ · ${connectionStatusLabel(lastConnectionStatus)}")
                        updateSharingStatus()
                    }
                }
            }
        }
        engine.restore()
        // An earlier build persisted the Metropolis API root as a browser tab. It is not a web UI.
        val restored = engine.active()?.requestedUrl.orEmpty().trimEnd('/')
        if (restored == MetropolisMcpClient.ISSUER) engine.navigate(BrowserSettings.OBSERVATORY_HOME_URL)
        engine.attach(geckoView); updateSharingStatus()
    }

    private fun scrollRow(vararg views: View): HorizontalScrollView {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(6, 2, 6, 2) }
        views.forEach { it.layoutParams = LinearLayout.LayoutParams(-2, -2).apply { setMargins(3, 0, 3, 0) }; row.addView(it) }
        return HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(row, ViewGroup.LayoutParams(-2, -2)); layoutParams = LinearLayout.LayoutParams(-1, -2) }
    }
    private fun button(label: String, action: () -> Unit) = ObservatoryTheme.button(this, label, action)
    private fun renderActive() { engine.active()?.let { address.setText(it.requestedUrl) }; updateSharingStatus() }
    private fun showTabs() {
        val tabs = engine.list(); if (tabs.isEmpty()) return
        AlertDialog.Builder(this).setTitle("แท็บ").setItems(tabs.map { it.requestedUrl }.toTypedArray()) { _, index -> engine.select(tabs[index].id); renderActive() }
            .setNeutralButton("ปิดแท็บนี้") { _, _ -> engine.active()?.let { engine.close(it.id) }; renderActive() }.setNegativeButton("กลับ", null).show()
    }
    private fun showConnectionMenu() {
        AlertDialog.Builder(this).setTitle("การเชื่อมต่อ")
            .setItems(arrayOf("เชื่อม Metropolis Hub ใหม่", "จับคู่ Observatory กับ Work ที่อ่านได้", "ยกเลิกการเชื่อมต่อ")) { _, choice ->
                when (choice) { 0 -> connectHub(); 1 -> pairObservatory(); 2 -> disconnect() }
            }.show()
    }
    private fun updateSharingStatus() {
        val tab = engine.active(); val latest = tab?.let { observerSession.latest(it.id) }; val now = System.currentTimeMillis()
        val fresh = latest != null && now - latest.capturedAtEpochMs in 0..30_000 && latest.captureId == acknowledgedCapture
        val state = SharingStatus.resolve(tab?.let { observerSession.isSharing(it.id) } == true, metropolis.pairedObservatory() != null, foreground, ObservatoryTheme.online(this), fresh, lastAck, deliveryFailed, now)
        sharingStatus.text = state.label; sharingStatus.setTextColor(if (state == SharingState.LIVE) ObservatoryTheme.lime else ObservatoryTheme.muted)
        val hub = hubArrival?.let { " · Hub ${it.actor}" }.orEmpty()
        eyeStatus.text = "GeckoView · ${engine.list().size} tabs · ${if (foreground) "FOREGROUND" else "BACKGROUND"} · frame-aware observer$hub"
        updateConnectionDiagnostics()
    }
    private fun toggleShare() {
        val tab = engine.active() ?: return
        if (metropolis.pairedObservatory() == null) { lastConnectionStatus = "STATION_PAIRING_REQUIRED"; updateConnectionDiagnostics(); say("เชื่อม Hub และจับคู่ Work ของ Observatory ก่อน"); showConnectionMenu(); return }
        if (observerSession.isSharing(tab.id)) { stopSharing(); say("หยุดแชร์แท็บแล้ว") }
        else { lastAck = null; acknowledgedCapture = null; deliveryFailed = false; observerSession.start(tab.id); shareButton.text = "หยุดแชร์"; captureIfShared(tab, true); updateSharingStatus() }
    }
    private fun stopSharing() {
        generation += 1
        engine.active()?.let { tab -> observerSession.stop(tab.id); val epoch = permissions.revoke(tab.id); getSharedPreferences("observatory-epochs", MODE_PRIVATE).edit().putLong("gecko", epoch).commit(); outbox.clearTab(tab.id) }
        shareButton.text = "GO / Share"; lastAck = null; acknowledgedCapture = null; deliveryFailed = false; updateSharingStatus()
    }
    private fun onCapture(tab: GeckoBrowserEngine.GeckoTab, capture: DomCapture) {
        if (destroyed || !foreground || engine.active()?.id != tab.id || !observerSession.isSharing(tab.id)) return
        if (captureBusy) return
        captureBusy = true; val epoch = generation
        val snapshot = observerSession.capture(tab.id, capture.url, capture.title, capture.text, capture.targets, capture.captureId, force = false)
        if (snapshot != null && metropolis.pairedObservatory() != null) outbox.enqueue(snapshot.copy(epoch = permissions.epoch(tab.id)))
        captureBusy = false
        if (epoch == generation && snapshot != null) eyeStatus.text = "Observer · ${snapshot.targets.size} targets · ${snapshot.targets.count { it.frameId != "frame-0" }} iframe targets · ${snapshot.captureId.take(8)}"
    }
    private fun captureIfShared(tab: GeckoBrowserEngine.GeckoTab, notify: Boolean = false) {
        if (!foreground || !engine.isOpen(tab) || !observerSession.isSharing(tab.id)) { if (notify) say("กด Share ขณะเปิดหน้าเว็บก่อน"); return }
        if (notify) eyeStatus.text = "Observer · waiting for Gecko content snapshot"
    }
    private fun syncActive() {
        val tab = engine.active() ?: return
        if (syncBusy || !foreground || !observerSession.isSharing(tab.id) || metropolis.pairedObservatory() == null) return
        val snapshot = outbox.pending().lastOrNull()
            ?: observerSession.latest(tab.id)?.takeIf { it.captureId != acknowledgedCapture }
            ?: return
        val now = System.currentTimeMillis()
        if (now - snapshot.capturedAtEpochMs !in 0..30_000) { lastConnectionStatus = "CAPTURE_STALE"; deliveryFailed = true; updateSharingStatus(); return }
        syncBusy = true; lastConnectionStatus = "SNAPSHOT_REQUESTED"; updateConnectionDiagnostics(); val epoch = generation; network.execute {
            val result = runCatching {
                val wire = HttpRelayClient.snapshotJson(snapshot).apply { remove("deviceId") }
                metropolis.publishSnapshot("browser", wire)
            }
            runOnUiThread {
                syncBusy = false
                if (destroyed || epoch != generation || !observerSession.isSharing(tab.id)) return@runOnUiThread
                result.onSuccess { ack ->
                    if (ack.optBoolean("accepted")
                        && ack.optString("operation") == "observe"
                        && ack.optString("captureId") == snapshot.captureId
                        && ack.optLong("sequence", -1) == snapshot.sequence) {
                        outbox.ack(snapshot.captureId)
                        lastAck = System.currentTimeMillis()
                        acknowledgedCapture = snapshot.captureId
                        deliveryFailed = false
                        lastConnectionStatus = "SNAPSHOT_ACK_OK"
                    } else { deliveryFailed = true; lastConnectionStatus = "ACK_MISMATCH" }
                }.onFailure { deliveryFailed = true; lastConnectionStatus = safeConnectionCode(it) }
                updateSharingStatus()
            }
        }
    }
    private fun pairObservatory() {
        val arrival = hubArrival
        if (arrival?.actor != "GO") { lastConnectionStatus = "GO_SESSION_REQUIRED"; updateConnectionDiagnostics(); say("เชื่อม GO กับ Metropolis ก่อน"); return }
        val works = arrival.observatoryWorks
        if (works.isEmpty()) { lastConnectionStatus = "NO_AUTHORIZED_OBSERVATORY_WORK"; updateConnectionDiagnostics(); say("ยังไม่มี Observatory Work ที่ GO มีสิทธิ์อ่าน"); return }
        fun pair(work: MetropolisMcpClient.HubWork) {
            lastConnectionStatus = "PAIR_REQUESTED"; updateConnectionDiagnostics()
            metropolis.pairObservatory(work.workId) { result ->
                runOnUiThread {
                    if (destroyed || isFinishing) return@runOnUiThread
                    result.onSuccess { pair ->
                        val saved = metropolis.pairedObservatory()
                        if (saved == null || saved.workId != work.workId || saved.deviceId != pair.deviceId || saved.publishSnapshot != pair.publishSnapshot) {
                            lastConnectionStatus = "PAIR_SAVE_READBACK_MISMATCH"
                            updateSharingStatus()
                            say("Hub ตอบรับการจับคู่ แต่ตรวจข้อมูลที่บันทึกในเครื่องไม่ผ่าน")
                            return@onSuccess
                        }
                        lastConnectionStatus = "PAIR_READBACK_OK"
                        stopSharing()
                        say("จับคู่หอดูดาวสำเร็จ · ตรวจข้อมูลที่บันทึกแล้ว · พร้อมแชร์")
                        updateSharingStatus()
                    }.onFailure { error ->
                        lastConnectionStatus = safeConnectionCode(error)
                        updateSharingStatus()
                        say("จับคู่หอดูดาวไม่สำเร็จ · ${connectionStatusLabel(lastConnectionStatus)}")
                    }
                }
            }
        }
        if (works.size == 1) {
            pair(works.single())
        } else {
            AlertDialog.Builder(this).setTitle("เลือก Work ของหอดูดาว")
                .setItems(works.map { it.workId }.toTypedArray()) { _, index -> pair(works[index]) }
                .setNegativeButton("ยกเลิก", null).show()
        }
    }
    private fun connectHub() {
        lastConnectionStatus = "OAUTH_STARTED"
        updateConnectionDiagnostics()
        say("เปิดหน้า Metropolis Hub เพื่อยืนยันตัวตนเจ้าของ")
        engine.navigate(metropolis.authorizationUrl())
    }
    private fun disconnect() { lastConnectionStatus = "DISCONNECTED"; stopSharing(); hubArrival = null; metropolis.disconnect(); updateSharingStatus() }
    private fun updateConnectionDiagnostics() {
        if (!::connectionDiagnostics.isInitialized) return
        val actor = hubArrival?.actor ?: "ยังไม่เชื่อมต่อ"
        val eligibleWorks = hubArrival?.observatoryWorks?.size?.toString() ?: "ยังไม่ตรวจ"
        val pair = metropolis.pairedObservatory()
        val pairState = pair?.let { "จับคู่แล้ว · …${it.workId.takeLast(8)}" } ?: "ยังไม่จับคู่"
        connectionDiagnostics.text = "Hub: $actor · Work หอดูดาวที่อ่านได้: $eligibleWorks · การจับคู่: $pairState · ผลล่าสุด: ${connectionStatusLabel(lastConnectionStatus)}"
    }

    private fun connectionStatusLabel(code: String): String {
        val message = when (code) {
            "NOT_ATTEMPTED" -> "ยังไม่ได้เริ่มตรวจ"
            "OAUTH_STARTED" -> "กำลังเชื่อม Hub"
            "HUB_ARRIVE_OK" -> "Hub ยืนยันตัวตนแล้ว"
            "GO_SESSION_REQUIRED" -> "ต้องเชื่อมต่อด้วยบัญชี GO ก่อน"
            "NO_AUTHORIZED_OBSERVATORY_WORK" -> "ไม่พบ Work หอดูดาวที่ GO มีสิทธิ์อ่าน"
            "STATION_PAIRING_REQUIRED", "PAIRING_MISSING" -> "ยังไม่ได้จับคู่หอดูดาว"
            "PAIR_REQUESTED" -> "กำลังส่งคำขอจับคู่"
            "PAIR_READBACK_OK" -> "จับคู่และตรวจข้อมูลที่บันทึกแล้ว"
            "PAIR_SAVE_READBACK_MISMATCH" -> "ข้อมูลจับคู่ที่บันทึกไม่ตรงกับคำตอบจาก Hub"
            "SNAPSHOT_REQUESTED" -> "กำลังส่งข้อมูลอ่านกลับ"
            "SNAPSHOT_ACK_OK" -> "ระบบเจ้าของยืนยันรับข้อมูลแล้ว"
            "ACK_MISMATCH" -> "คำยืนยันรับข้อมูลไม่ตรงกัน"
            "CAPTURE_STALE" -> "ข้อมูลอ่านกลับหมดอายุแล้ว"
            "DISCONNECTED" -> "ยกเลิกการเชื่อมต่อแล้ว"
            "OAUTH_STATE_MISMATCH" -> "ข้อมูลยืนยันการเชื่อมต่อไม่ตรงกัน"
            "HUB_NOT_CONNECTED" -> "ยังไม่ได้เชื่อม Hub"
            "HTTP_401_AUTH" -> "Hub ไม่ยืนยันตัวตน (401)"
            "HTTP_403_DENIED" -> "Hub ไม่อนุญาต (403)"
            "HTTP_406_ACCEPT_REQUIRED" -> "Hub ปฏิเสธรูปแบบคำขอ (406)"
            "HTTP_5XX" -> "Hub เกิดข้อผิดพลาดภายใน (5xx)"
            "STATION_ENDPOINT_INVALID" -> "ที่อยู่ปลายทางหอดูดาวไม่ถูกต้อง"
            "STATION_CREDENTIAL_MISSING" -> "ไม่พบข้อมูลยืนยันตัวตนของหอดูดาว"
            "HUB_RPC_ERROR" -> "Hub ตอบกลับข้อผิดพลาด"
            "REQUEST_FAILED" -> "คำขอไม่สำเร็จ"
            else -> if (code.startsWith("HTTP_")) "Hub ตอบกลับข้อผิดพลาด (${code.removePrefix("HTTP_")})" else "สถานะอื่น ($code)"
        }
        return "$message [$code]"
    }

    /** Render only allowlisted status codes; never surface response bodies or credentials. */
    private fun safeConnectionCode(error: Throwable): String {
        val message = error.message.orEmpty()
        val httpStatus = Regex("HUB_HTTP_(\\d{3})").find(message)?.groupValues?.getOrNull(1)
        if (httpStatus != null) return when (httpStatus) {
            "401" -> "HTTP_401_AUTH"
            "403" -> "HTTP_403_DENIED"
            "406" -> "HTTP_406_ACCEPT_REQUIRED"
            else -> if (httpStatus.startsWith("5")) "HTTP_5XX" else "HTTP_$httpStatus"
        }
        return when {
            "HUB_OAUTH_STATE_MISMATCH" in message -> "OAUTH_STATE_MISMATCH"
            "HUB_NOT_CONNECTED" in message -> "HUB_NOT_CONNECTED"
            "NO_AUTHORIZED_OBSERVATORY_WORK" in message -> "NO_AUTHORIZED_OBSERVATORY_WORK"
            "STATION_ENDPOINT_INVALID" in message -> "STATION_ENDPOINT_INVALID"
            "STATION_CREDENTIAL_MISSING" in message -> "STATION_CREDENTIAL_MISSING"
            "OBSERVATORY_NOT_PAIRED" in message -> "PAIRING_MISSING"
            "HUB_RPC_" in message -> "HUB_RPC_ERROR"
            else -> "REQUEST_FAILED"
        }
    }

    private fun navigateFromAddress() { val raw = address.text.toString().trim(); if (!BrowserSettings.isAllowedUrl(raw)) { say("เปิดได้เฉพาะ HTTPS"); return }; if (foreground && lifecycleInteractive()) engine.navigate(raw) }
    private fun lyraContext(): JSONObject { val tab = engine.active() ?: return JSONObject(); val snap = observerSession.latest(tab.id) ?: return JSONObject(); val targets = JSONArray(); snap.targets.take(64).forEach { targets.put(JSONObject().put("targetId", it.id).put("frameId", it.frameId).put("label", it.label).put("tag", it.tag).put("signature", it.signature)) }; return JSONObject().put("browser", JSONObject().put("deviceId", snap.deviceId).put("tabId", snap.tabId).put("captureId", snap.captureId).put("revision", snap.revision).put("epoch", permissions.epoch(tab.id)).put("url", snap.url).put("title", snap.title).put("targets", targets)) }
    private fun lifecycleInteractive() = !isFinishing && !isDestroyed && (getSystemService(PowerManager::class.java)?.isInteractive != false)
    private fun say(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    override fun onResume() { super.onResume(); foreground = true; engine.updateVisibility(true); GeckoObserverService.mark(this, true); handler.post(tick); updateSharingStatus() }
    override fun onPause() { foreground = false; engine.updateVisibility(false); GeckoObserverService.mark(this, false); handler.removeCallbacks(tick); updateSharingStatus(); super.onPause() }
    override fun onDestroy() { destroyed = true; stopSharing(); engine.detach(); handler.removeCallbacks(tick); network.shutdownNow(); metropolis.close(); super.onDestroy() }
    override fun onBackPressed() { engine.back() }
}
