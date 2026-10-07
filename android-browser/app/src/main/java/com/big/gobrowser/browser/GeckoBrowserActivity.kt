package com.big.gobrowser.browser

import android.app.*
import android.content.*
import android.os.*
import android.text.InputType
import android.view.*
import android.view.inputmethod.EditorInfo
import android.widget.*
import com.big.gobrowser.R
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
    private lateinit var observerSession: ObserverSession
    private lateinit var credentials: AndroidDeviceCredentialStore
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
    private val commandLedger = BrowserCommandLedger()
    private val executor = CommandExecutor(ActionRunner { null })
    private val receipts = EpochReceiptQueue()
    private val commands = ArrayDeque<Command>()
    private var owner: OwnerRelayConfiguration? = null
    @Volatile private var sync: SyncService? = null
    private var foreground = false
    private var destroyed = false
    private var captureBusy = false
    private var commandBusy = false
    private var syncBusy = false
    private var generation = 0L
    private var lastAck: Long? = null
    private var acknowledgedCapture: String? = null
    private var deliveryFailed = false
    private var hubArrival: MetropolisMcpClient.HubArrival? = null
    private val tick = object : Runnable {
        override fun run() {
            if (!foreground || destroyed) return
            if (!commandBusy) engine.active()?.let { captureIfShared(it) }
            syncActive(); updateSharingStatus(); handler.postDelayed(this, 5_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        credentials = AndroidDeviceCredentialStore(this)
        metropolis = MetropolisMcpClient(this)
        observerSession = ObserverSession("local-device", "0.4.0-gecko")
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(ObservatoryTheme.title(this, "หอดูดาว · Gecko Browser"))
        val addressRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(8, 4, 8, 4) }
        address = EditText(this).apply { hint = "https://example.com"; setSingleLine(true); imeOptions = EditorInfo.IME_ACTION_GO; layoutParams = LinearLayout.LayoutParams(0, -2, 1f); setOnEditorActionListener { _, _, _ -> navigateFromAddress(); true } }
        ObservatoryTheme.address(address); addressRow.addView(address); addressRow.addView(button("ไป") { navigateFromAddress() })
        root.addView(addressRow)
        val navigation = scrollRow(button("ย้อนกลับ") { engine.back() }, button("ถัดไป") { engine.forward() }, button("รีโหลด") { engine.reload() }, button("แท็บ") { showTabs() }, button("+") { engine.open(); renderActive() })
        val share = button("GO / Share") { toggleShare() }
        val controls = scrollRow(share, button("แผนที่") { startActivity(Intent(this, OutsideViewActivity::class.java)) }, button("ไลร่า") { LyraDialog.show(this, "INSIDE") { lyraContext() } }, button("เชื่อมต่อ") { showConnectionMenu() })
        root.addView(navigation); root.addView(controls)
        shareButton = share
        sharingStatus = ObservatoryTheme.status(this); root.addView(sharingStatus)
        eyeStatus = ObservatoryTheme.status(this); root.addView(eyeStatus)
        val browserContainer = FrameLayout(this).apply { setBackgroundColor(0xff07101b.toInt()) }
        root.addView(browserContainer, LinearLayout.LayoutParams(-1, 0, 1f))
        ObservatoryTheme.apply(this, root); PhoneLayout.fitSystemBars(root); setContentView(root)
        val geckoView = org.mozilla.geckoview.GeckoView(this); browserContainer.addView(geckoView, FrameLayout.LayoutParams(-1, -1))
        engine = GeckoBrowserEngine(this, browserContainer, { url -> runOnUiThread { address.setText(url) } }, { tab, capture -> onCapture(tab, capture) }) { _, url ->
            metropolis.handleCallback(url) { result ->
                result.onSuccess { arrival ->
                    hubArrival = arrival
                    runOnUiThread { say("เชื่อม Metropolis Hub แล้ว · ${arrival.actor}"); updateSharingStatus() }
                }.onFailure { error ->
                    runOnUiThread { say("เชื่อม Hub ไม่ได้: ${error.message?.take(100)}") }
                }
            }
        }
        engine.restore(); engine.attach(geckoView); updateSharingStatus()
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
    private fun showConnectionMenu() { AlertDialog.Builder(this).setTitle("การเชื่อมต่อ").setItems(arrayOf("เชื่อม Metropolis Hub ใหม่", "ยกเลิกการเชื่อมต่อ")) { _, choice -> when (choice) { 0 -> connectHub(); 1 -> disconnect() } }.show() }
    private fun updateSharingStatus() {
        val tab = engine.active(); val latest = tab?.let { observerSession.latest(it.id) }; val now = System.currentTimeMillis()
        val fresh = latest != null && now - latest.capturedAtEpochMs in 0..30_000 && latest.captureId == acknowledgedCapture
        val state = SharingStatus.resolve(tab?.let { observerSession.isSharing(it.id) } == true, owner != null, foreground, ObservatoryTheme.online(this), fresh, lastAck, deliveryFailed, now)
        sharingStatus.text = state.label; sharingStatus.setTextColor(if (state == SharingState.LIVE) ObservatoryTheme.lime else ObservatoryTheme.muted)
        val hub = hubArrival?.let { " · Hub ${it.actor}" }.orEmpty()
        eyeStatus.text = "GeckoView · ${engine.list().size} tabs · ${if (foreground) "LIVE" else "WAITING"} · frame-aware observer$hub"
    }
    private fun toggleShare() {
        val tab = engine.active() ?: return
        if (observerSession.isSharing(tab.id)) { stopSharing(); say("หยุดแชร์แท็บแล้ว") }
        else { lastAck = null; acknowledgedCapture = null; deliveryFailed = false; observerSession.start(tab.id); shareButton.text = "หยุดแชร์"; captureIfShared(tab, true); updateSharingStatus() }
    }
    private fun stopSharing() {
        generation += 1; receipts.revoke(generation)
        engine.active()?.let { tab -> observerSession.stop(tab.id); val epoch = permissions.revoke(tab.id); getSharedPreferences("observatory-epochs", MODE_PRIVATE).edit().putLong("gecko", epoch).commit(); outbox.clearTab(tab.id) }
        commands.clear(); shareButton.text = "GO / Share"; lastAck = null; acknowledgedCapture = null; deliveryFailed = false; updateSharingStatus()
    }
    private fun onCapture(tab: GeckoBrowserEngine.GeckoTab, capture: DomCapture) {
        if (destroyed || !foreground || engine.active()?.id != tab.id || !observerSession.isSharing(tab.id)) return
        if (captureBusy) return
        captureBusy = true; val epoch = generation
        val snapshot = observerSession.capture(tab.id, capture.url, capture.title, capture.text, capture.targets, capture.captureId, force = false)
        if (snapshot != null && sync != null) outbox.enqueue(snapshot.copy(epoch = permissions.epoch(tab.id)))
        captureBusy = false
        if (epoch == generation && snapshot != null) eyeStatus.text = "Observer · ${snapshot.targets.size} targets · ${snapshot.targets.count { it.frameId != "frame-0" }} iframe targets · ${snapshot.captureId.take(8)}"
    }
    private fun captureIfShared(tab: GeckoBrowserEngine.GeckoTab, notify: Boolean = false) {
        if (!foreground || !engine.isOpen(tab) || !observerSession.isSharing(tab.id)) { if (notify) say("กด Share ขณะเปิดหน้าเว็บก่อน"); return }
        if (notify) eyeStatus.text = "Observer · waiting for Gecko content snapshot"
    }
    private fun processNextCommand() {
        if (captureBusy || commandBusy || commands.isEmpty() || destroyed) return
        val command = commands.removeFirst(); val tab = engine.active(); val latest = tab?.let { observerSession.latest(it.id) }
        val state = ControlState(foreground && tab != null && observerSession.isSharing(tab.id) && latest != null && System.currentTimeMillis() - latest.capturedAtEpochMs <= Freshness.LIVE_CAPTURE_MAX_AGE_MS, lifecycleInteractive(), owner?.deviceId.orEmpty(), tab?.id.orEmpty(), latest?.captureId.orEmpty(), latest?.revision ?: -1, tab?.let { permissions.epoch(it.id) } ?: -1)
        if (owner == null || !owner!!.allows(command)) { queueReceipt(Receipt(command.commandId, ReceiptStatus.REJECTED, "OWNER_SCOPE_MISMATCH", latest?.captureId, null, System.currentTimeMillis(), null, BusinessOutcome.UNKNOWN)); processNextCommand(); return }
        commandBusy = true; val boundSync = sync; val commandEpoch = generation
        executor.executeAsync(command, state, { request, complete ->
            if (tab == null) complete(ActionReadback(false, "NO_ACTIVE_GECKO_SESSION"))
            else engine.dispatch(tab, request) { result ->
                if (!result.accepted) complete(ActionReadback(false, result.reason))
                else awaitReadback(tab.id, latest?.captureId, complete)
            }
        }) { receipt -> commandBusy = false; if (boundSync === sync && commandEpoch == generation) queueReceipt(receipt, commandEpoch); processNextCommand() }
    }
    private fun awaitReadback(tabId: String, beforeCaptureId: String?, complete: (ActionReadback) -> Unit, attempt: Int = 0) {
        val latest = observerSession.latest(tabId)
        if (latest != null && latest.captureId != beforeCaptureId) { complete(ActionReadback(true, "READBACK", latest.captureId, "GECKO_READBACK")); return }
        if (attempt >= 20) { complete(ActionReadback(true, "EXECUTED_READBACK_UNKNOWN", null, "READBACK_UNKNOWN")); return }
        handler.postDelayed({ awaitReadback(tabId, beforeCaptureId, complete, attempt + 1) }, 100L)
    }
    private fun syncActive() {
        val service = sync ?: return; val tab = engine.active() ?: return; if (syncBusy || !foreground || !observerSession.isSharing(tab.id)) return
        syncBusy = true; val epoch = generation; val pending = receipts.toList(); network.execute {
            if (epoch != generation || service !== sync) { runOnUiThread { syncBusy = false }; return@execute }
            val report = runCatching { service.syncOnce { epoch == generation && service === sync } }.getOrNull()
            val acknowledged = pending.filter { runCatching { service.publishReceipt(it) }.isSuccess }
            runOnUiThread { syncBusy = false; if (destroyed || epoch != generation || service !== sync) return@runOnUiThread; acknowledged.forEach(receipts::remove); deliveryFailed = report == null || report.error != null || report.failed > 0; if (report != null && report.published > 0) { observerSession.latest(tab.id)?.let { latest -> if (latest.captureId in report.acknowledgedCaptureIds) { lastAck = System.currentTimeMillis(); acknowledgedCapture = latest.captureId } } }; report?.commands?.take(100 - commands.size)?.forEach { if (commandLedger.admit(it) == null) commands.addLast(it) }; processNextCommand(); updateSharingStatus() }
        }
    }
    private fun queueReceipt(receipt: Receipt, epoch: Long = generation) { receipts.enqueue(epoch, receipt) }
    private fun bindStation(config: OwnerRelayConfiguration, secret: String) { stopSharing(); receipts.clear(); commandLedger.clear(); credentials.save(secret); owner = config; observerSession = ObserverSession(config.deviceId, "0.4.0-gecko"); sync = SyncService(HttpRelayClient(config.endpoints, object : DeviceCredentialStore { override fun load() = secret; override fun save(token: String) = error("read-only"); override fun revoke() = Unit }), outbox); say("เชื่อมเมโทรแล้ว กด GO / Share เพื่อเริ่ม") }
    private fun configureRelay() {
        val form = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(24, 8, 24, 8) }; val contract = EditText(this).apply { hint = "Owner relay configuration (JSON)"; minLines = 4 }; val token = EditText(this).apply { hint = "Device token"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }; form.addView(contract); form.addView(token)
        AlertDialog.Builder(this).setTitle("Relay จากเจ้าของระบบ").setView(form).setNegativeButton("Cancel", null).setPositiveButton("Review") { _, _ -> val config = runCatching { OwnerRelayConfiguration.parse(contract.text.toString()) }.getOrNull(); val secret = token.text.toString(); token.text.clear(); if (config == null || secret.isBlank()) say("ต้องมี owner configuration และ token ที่ถูกต้อง") else bindStation(config, secret) }.show()
    }
    private fun connectHub() {
        say("เปิดหน้า Metropolis Hub เพื่อกรอก Owner passcode")
        engine.navigate(metropolis.authorizationUrl())
    }
    private fun disconnect() { stopSharing(); sync = null; owner = null; hubArrival = null; receipts.clear(); commandLedger.clear(); metropolis.disconnect(); runCatching { credentials.revoke() }; updateSharingStatus() }
    private fun navigateFromAddress() { val raw = address.text.toString().trim(); if (!BrowserSettings.isAllowedUrl(raw)) { say("เปิดได้เฉพาะ HTTPS"); return }; if (foreground && lifecycleInteractive()) engine.navigate(raw) }
    private fun lyraContext(): JSONObject { val tab = engine.active() ?: return JSONObject(); val snap = observerSession.latest(tab.id) ?: return JSONObject(); val targets = JSONArray(); snap.targets.take(64).forEach { targets.put(JSONObject().put("targetId", it.id).put("frameId", it.frameId).put("label", it.label).put("tag", it.tag).put("signature", it.signature)) }; return JSONObject().put("browser", JSONObject().put("deviceId", snap.deviceId).put("tabId", snap.tabId).put("captureId", snap.captureId).put("revision", snap.revision).put("epoch", permissions.epoch(tab.id)).put("url", snap.url).put("title", snap.title).put("targets", targets)) }
    private fun lifecycleInteractive() = !isFinishing && !isDestroyed && (getSystemService(PowerManager::class.java)?.isInteractive != false)
    private fun say(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    override fun onResume() { super.onResume(); foreground = true; engine.updateVisibility(true); GeckoObserverService.mark(this, true); handler.post(tick); updateSharingStatus() }
    override fun onPause() { foreground = false; engine.updateVisibility(false); GeckoObserverService.mark(this, false); handler.removeCallbacks(tick); updateSharingStatus(); super.onPause() }
    override fun onDestroy() { destroyed = true; stopSharing(); engine.detach(); handler.removeCallbacks(tick); network.shutdownNow(); metropolis.close(); super.onDestroy() }
    override fun onBackPressed() { engine.back() }
}
