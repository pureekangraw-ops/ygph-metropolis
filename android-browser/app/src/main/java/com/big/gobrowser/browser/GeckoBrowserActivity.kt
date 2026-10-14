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
    private val activityBridge = GeckoActivityBridge(
        { foreground && !isFinishing && !isDestroyed },
        { intent, code -> startIntentSenderForResult(intent.intentSender, code, null, 0, 0, 0) }
    )
    private lateinit var engine: GeckoBrowserEngine
    private lateinit var address: EditText
    private lateinit var tabsButton: Button
    private lateinit var sharingStatus: TextView
    private lateinit var eyeStatus: TextView
    private lateinit var connectionDiagnostics: TextView
    private lateinit var observerSession: ObserverSession
    private lateinit var pantheon: PantheonObservatoryClient
    private val handler = Handler(Looper.getMainLooper())
    private val network = Executors.newSingleThreadExecutor()
    private val permissions by lazy {
        val prefs = getSharedPreferences("observatory-epochs", MODE_PRIVATE)
        val seed = maxOf(System.currentTimeMillis(), prefs.getLong("gecko", 0L) + 1)
        check(prefs.edit().putLong("gecko", seed).commit())
        PermissionStore(seed, deviceScope = true)
    }
    private val outbox = Outbox(maxAgeMs = 15_000L)
    private var latestDom: Pair<String, DomCapture>? = null
    private var domReceivedAt = 0L
    private var pausedByOwner = false
    private var foreground = false
    private var destroyed = false
    private var captureBusy = false
    private var syncBusy = false
    private var generation = 0L
    private var lastAck: Long? = null
    private var acknowledgedCapture: String? = null
    private var deliveryFailed = false
    private var lastConnectionStatus = "NOT_ATTEMPTED"
    private var pantheonDeviceId: String? = null
    private val tick = object : Runnable {
        override fun run() {
            if (!foreground || destroyed) return
            startAutomaticObservation()
            engine.active()?.let { captureIfShared(it) }
            syncActive(); updateSharingStatus(); handler.postDelayed(this, 5_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pantheon = PantheonObservatoryClient(this)
        pantheonDeviceId = pantheon.deviceId()
        observerSession = ObserverSession("local-device", "${BuildConfig.VERSION_NAME}-gecko")
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val addressRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), dp(4), dp(8), 0)
        }
        address = EditText(this).apply {
            hint = "ชื่อเว็บ หรือ https://…"
            contentDescription = "ที่อยู่เว็บไซต์"
            setSingleLine(true)
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            layoutParams = LinearLayout.LayoutParams(0, dp(48), 1f)
            setOnEditorActionListener { _, _, _ -> navigateFromAddress(); true }
        }
        ObservatoryTheme.address(address)
        addressRow.addView(address)
        addressRow.addView(button("ไป") { navigateFromAddress() }.apply {
            contentDescription = "เปิดเว็บไซต์"
            layoutParams = LinearLayout.LayoutParams(dp(48), dp(48)).apply { leftMargin = dp(6) }
        })
        root.addView(addressRow)
        val navigation = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(5), 0, dp(5), 0)
        }
        navigation.addView(chromeButton("‹", "ย้อนกลับ") { engine.back() })
        navigation.addView(chromeButton("›", "ถัดไป") { engine.forward() })
        navigation.addView(chromeButton("↻", "รีโหลด") { engine.reload() })
        tabsButton = chromeButton("แท็บ 1", "แท็บที่เปิดอยู่") { showTabs() }.apply { textSize = 14f }
        navigation.addView(tabsButton)
        navigation.addView(chromeButton("⋮", "เมนูหอดูดาว") { showBrowserMenu() })
        root.addView(navigation)
        sharingStatus = ObservatoryTheme.status(this).apply {
            textSize = 14f
            setSingleLine(true)
            ellipsize = android.text.TextUtils.TruncateAt.END
            minHeight = dp(48)
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), 0, dp(12), 0)
            isClickable = true
            isFocusable = true
            setOnClickListener { if (!pantheon.isPaired()) connectHub() else showBrowserDetails() }
            tooltipText = "แตะดูสถานะ PANTHEON และข้อมูลรุ่น"
        }
        root.addView(sharingStatus)
        // Detailed evidence stays available in the dialog without consuming the webpage.
        eyeStatus = ObservatoryTheme.status(this)
        connectionDiagnostics = ObservatoryTheme.status(this)
        val browserContainer = FrameLayout(this).apply { setBackgroundColor(0xff07101b.toInt()) }
        root.addView(browserContainer, LinearLayout.LayoutParams(-1, 0, 1f))
        ObservatoryTheme.apply(this, root); PhoneLayout.fitSystemBars(root); setContentView(root)
        val geckoView = org.mozilla.geckoview.GeckoView(this); browserContainer.addView(geckoView, FrameLayout.LayoutParams(-1, -1))
        engine = GeckoBrowserEngine(this, browserContainer, { url -> runOnUiThread { address.setText(url) } }, { tab, capture -> onCapture(tab, capture) })
        engine.restore()
        // An earlier build persisted the Metropolis API root as a browser tab. It is not a web UI.
        val restored = engine.active()?.requestedUrl.orEmpty().trimEnd('/')
        if (android.net.Uri.parse(restored).host == "metropolis.pureekangraw.workers.dev") engine.navigate(BrowserSettings.OBSERVATORY_HOME_URL)
        engine.attach(geckoView); updateSharingStatus()
    }

    private fun dp(value: Int) = ObservatoryTheme.dp(this, value)
    private fun chromeButton(symbol: String, label: String, action: () -> Unit) = button(symbol, action).apply {
        contentDescription = label
        tooltipText = label
        textSize = 24f
        setPadding(0, 0, 0, 0)
        layoutParams = LinearLayout.LayoutParams(0, dp(48), 1f).apply {
            setMargins(dp(3), dp(3), dp(3), dp(3))
        }
    }
    private fun showBrowserMenu() {
        val reading = engine.active()?.let { observerSession.isSharing(it.id) } == true
        AlertDialog.Builder(this).setTitle("หอดูดาว")
            .setItems(arrayOf("แท็บใหม่", if (reading) "หยุดส่งเข้า PANTHEON" else "เริ่มส่งเข้า PANTHEON", "แผนที่", "ไลร่า", "เก็บช่วงนี้ถาวร", "ช่วงที่เก็บไว้", "เชื่อมต่อ", "รายละเอียดและข้อมูลรุ่น", "ส่งหน้าเว็บให้ GO", "ช่วยกรอก / ช่วยกด")) { _, choice ->
                when (choice) {
                    0 -> { engine.open(); renderActive() }
                    1 -> toggleShare()
                    2 -> startActivity(Intent(this, OutsideViewActivity::class.java))
                    3 -> LyraDialog.show(this, "INSIDE") { lyraContext() }
                    4 -> ObservatoryMemoryDialog.preserve(this, "browser", currentWebHandoff())
                    5 -> ObservatoryMemoryDialog.saved(this)
                    6 -> if (pantheon.isPaired()) showConnectionMenu() else connectHub()
                    7 -> showBrowserDetails()
                    8 -> shareCurrentPageToGo()
                    9 -> showOwnerAssist()
                }
            }.setNegativeButton("ปิด", null).show()
    }
    private fun showBrowserDetails() {
        updateSharingStatus()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), dp(8), dp(8), dp(8))
        }
        root.addView(ObservatoryBuildStamp.view(this))
        for (label in listOf(sharingStatus.text, eyeStatus.text, connectionDiagnostics.text)) {
            root.addView(ObservatoryTheme.status(this).apply {
                text = label
                textSize = 15f
                setTextIsSelectable(true)
            })
        }
        root.addView(ObservatoryTheme.status(this).apply {
            text = "อ่านทุก 5 วินาทีเมื่อเปิดแอป · ข้อมูลบน PANTHEON หมดอายุ 30 วินาที\nหยุดอ่านเมื่อออกจากแอป · ช่วงที่เลือกเก็บไว้จะเข้ารหัสบนเครื่อง"
            textSize = 15f
        })
        val scroll = ScrollView(this).apply { addView(root) }
        AlertDialog.Builder(this).setTitle("สถานะหอดูดาว").setView(scroll).setPositiveButton("ปิด", null).show()
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
            .setItems(arrayOf("ดูสถานะ PANTHEON", "ยกเลิกการเชื่อมต่อ")) { _, choice ->
                when (choice) { 0 -> showBrowserDetails(); 1 -> disconnect() }
            }.show()
    }
    private fun updateSharingStatus() {
        val tab = engine.active(); val latest = tab?.let { observerSession.latest(it.id) }; val now = System.currentTimeMillis()
        val fresh = latest != null && now - latest.capturedAtEpochMs in 0..14_999 && latest.captureId == acknowledgedCapture
        val state = SharingStatus.resolve(tab?.let { observerSession.isSharing(it.id) } == true, pantheon.isPaired(), foreground, ObservatoryTheme.online(this), fresh, lastAck, deliveryFailed, now)
        sharingStatus.text = "PANTHEON · ${state.label}  ›"; sharingStatus.contentDescription = "${state.label} แตะดูรายละเอียด"; tabsButton.text = "แท็บ ${engine.list().size}"; sharingStatus.setTextColor(if (state == SharingState.LIVE) ObservatoryTheme.lime else ObservatoryTheme.muted)
        val hub = if (pantheon.isPaired()) " · PANTHEON" else ""
        eyeStatus.text = "GeckoView · ${engine.list().size} tabs · ${if (foreground) "FOREGROUND" else "BACKGROUND"} · frame-aware observer$hub"
        updateConnectionDiagnostics()
    }
    private fun startAutomaticObservation() {
        if (!foreground || pausedByOwner || !pantheon.isPaired()) return
        val tab = engine.active() ?: return
        if (!observerSession.isSharing(tab.id)) {
            observerSession.start(tab.id)
        }
    }
    private fun toggleShare() {
        val tab = engine.active() ?: return
        if (!pantheon.isPaired()) { lastConnectionStatus = "STATION_PAIRING_REQUIRED"; updateConnectionDiagnostics(); say("กรุณาเชื่อมต่อก่อน"); connectHub(); return }
        if (observerSession.isSharing(tab.id)) { pausedByOwner = true; stopSharing(); say("หยุดแชร์แท็บแล้ว") }
        else { pausedByOwner = false; lastAck = null; acknowledgedCapture = null; deliveryFailed = false; observerSession.start(tab.id); captureIfShared(tab, true); updateSharingStatus() }
    }
    private fun stopSharing() {
        generation += 1
        engine.active()?.let { tab -> observerSession.stop(tab.id); pantheon.stopObservation("browser", permissions.epoch(tab.id)); val epoch = permissions.revoke(tab.id); getSharedPreferences("observatory-epochs", MODE_PRIVATE).edit().putLong("gecko", epoch).commit(); outbox.clearTab(tab.id) }
        latestDom = null; domReceivedAt = 0L
        lastAck = null; acknowledgedCapture = null; deliveryFailed = false; updateSharingStatus()
    }
    private fun onCapture(tab: GeckoBrowserEngine.GeckoTab, capture: DomCapture) {
        if (destroyed || !foreground || engine.active()?.id != tab.id) return
        if (capture.frameId != "frame-0" || sanitizeUrl(capture.url) != sanitizeUrl(tab.requestedUrl)) return
        latestDom = tab.id to capture
        domReceivedAt = System.currentTimeMillis()
    }
    private fun captureIfShared(tab: GeckoBrowserEngine.GeckoTab, notify: Boolean = false) {
        if (!foreground || !engine.isOpen(tab) || !observerSession.isSharing(tab.id)) return
        val latest = latestDom?.takeIf { it.first == tab.id }?.second ?: return
        if (System.currentTimeMillis() - domReceivedAt !in 0..5_000L) return
        if (android.net.Uri.parse(latest.url).host == "metropolis.pureekangraw.workers.dev") return
        // Sample a freshly observed DOM every five seconds, including unchanged pages.
        // Snapshot IDs identify history samples; DOM target IDs remain in the target metadata.
        val snapshot = observerSession.capture(tab.id, latest.url, latest.title, latest.text, latest.targets, force = true) ?: return
        outbox.enqueue(snapshot.copy(epoch = permissions.epoch(tab.id)))
        eyeStatus.text = "อ่านทุก 5 วินาที · ประวัติ 15 วินาที · ${snapshot.targets.size} จุด"
    }
    private fun syncActive() {
        val tab = engine.active() ?: return
        if (syncBusy || !foreground || !observerSession.isSharing(tab.id) || !pantheon.isPaired()) return
        val snapshot = outbox.pending().lastOrNull()
            ?: observerSession.latest(tab.id)?.takeIf { it.captureId != acknowledgedCapture }
            ?: return
        val now = System.currentTimeMillis()
        if (now - snapshot.capturedAtEpochMs !in 0..14_999) { lastConnectionStatus = "CAPTURE_STALE"; deliveryFailed = true; updateSharingStatus(); return }
        syncBusy = true; lastConnectionStatus = "SNAPSHOT_REQUESTED"; updateConnectionDiagnostics(); val epoch = generation; network.execute {
            val result = runCatching {
                val wire = ObservatorySnapshotWire.bounded(HttpRelayClient.snapshotJson(snapshot))
                pantheon.publishSnapshot("browser", wire)
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
    private fun connectHub() {
        if (pantheon.isPaired()) { showConnectionMenu(); return }
        val entry = EditText(this).apply {
            hint = "รหัสเจ้าของ PANTHEON (ใช้ครั้งเดียว)"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine()
        }
        AlertDialog.Builder(this).setTitle("เชื่อมต่อ PANTHEON")
            .setMessage("ยืนยันเจ้าของครั้งเดียว แอปจะเก็บเฉพาะรหัสอุปกรณ์แบบเข้ารหัส ส่งข้อมูลสดเมื่อเปิดแอปเท่านั้น")
            .setView(entry).setNegativeButton("ยกเลิก", null)
            .setPositiveButton("ยืนยันและจับคู่") { _, _ ->
                val ownerToken = entry.text.toString()
                entry.text.clear()
                lastConnectionStatus = "PAIR_REQUESTED"; updateConnectionDiagnostics()
                pantheon.pair(ownerToken) { result ->
                    if (destroyed || isFinishing) return@pair
                    result.onSuccess { id ->
                        pantheonDeviceId = id
                        lastConnectionStatus = "PAIR_READBACK_OK"
                        pausedByOwner = false
                        startAutomaticObservation()
                        say("จับคู่ PANTHEON สำเร็จ")
                    }.onFailure {
                        lastConnectionStatus = safeConnectionCode(it)
                        say("เชื่อมต่อ PANTHEON ไม่สำเร็จ")
                    }
                    updateSharingStatus()
                }
            }.show()
    }
    private fun disconnect() {
        stopSharing()
        pantheon.disconnect { result ->
            if (destroyed) return@disconnect
            result.onSuccess {
                pantheonDeviceId = null
                lastConnectionStatus = "DISCONNECTED"
                say("ยกเลิกสิทธิ์อุปกรณ์แล้ว")
            }.onFailure { lastConnectionStatus = safeConnectionCode(it); say("ยกเลิกสิทธิ์ไม่สำเร็จ") }
            updateSharingStatus()
        }
    }
    private fun updateConnectionDiagnostics() {
        if (!::connectionDiagnostics.isInitialized) return
        connectionDiagnostics.text = "PANTHEON · " + (if (pantheon.isPaired()) "จับคู่แล้ว" else "ยังไม่จับคู่") + " · " + connectionStatusLabel(lastConnectionStatus)
    }
    private fun connectionStatusLabel(code: String): String = when (code) {
        "NOT_ATTEMPTED" -> "ยังไม่ได้เชื่อม"
        "PAIR_REQUESTED" -> "กำลังตรวจสิทธิ์เจ้าของ"
        "PAIR_READBACK_OK" -> "จับคู่สำเร็จ"
        "SNAPSHOT_REQUESTED" -> "กำลังส่งข้อมูลสด"
        "SNAPSHOT_ACK_OK" -> "PANTHEON รับข้อมูลแล้ว"
        "ACK_MISMATCH" -> "การตอบรับไม่ตรงกัน"
        "CAPTURE_STALE" -> "ข้อมูลสดหมดอายุ"
        "DISCONNECTED" -> "ยกเลิกการเชื่อมต่อแล้ว"
        "HTTP_401_AUTH" -> "สิทธิ์ไม่ถูกต้องหรือหมดอายุ"
        "HTTP_404" -> "PANTHEON ยังไม่เปิด API"
        "HTTP_503" -> "PANTHEON ไม่พร้อม"
        else -> "เชื่อมต่อไม่สำเร็จ"
    }
    private fun safeConnectionCode(error: Throwable): String {
        val status = Regex("STATION_HTTP_(\\d{3})").find(error.message.orEmpty())?.groupValues?.getOrNull(1)
        return when (status) { "401" -> "HTTP_401_AUTH"; "404" -> "HTTP_404"; "503" -> "HTTP_503"; null -> "REQUEST_FAILED"; else -> "HTTP_$status" }
    }

    private fun navigateFromAddress() {
        val url = UrlPolicy.resolveAddress(address.text.toString())
        if (url == null) { say("ใส่ชื่อเว็บ เช่น example.com หรือ URL https://..."); return }
        if (foreground && lifecycleInteractive() && engine.navigate(url)) {
            address.setText(url)
            getSystemService(android.view.inputmethod.InputMethodManager::class.java)?.hideSoftInputFromWindow(address.windowToken, 0)
            address.clearFocus()
        }
    }
    /** Explicit Android Sharesheet handoff: this does NOT assume a live ChatGPT connector. */
    private fun currentAssistEvidence(): Pair<GeckoBrowserEngine.GeckoTab, DomCapture>? {
        val tab = engine.active() ?: return null
        val pair = latestDom ?: return null
        if (!foreground || !lifecycleInteractive() || pair.first != tab.id) return null
        if (System.currentTimeMillis() - domReceivedAt !in 0..4_999L) return null
        val capture = pair.second
        if (capture.frameId != "frame-0" || sanitizeUrl(capture.url) != sanitizeUrl(tab.requestedUrl)) return null
        return tab to capture
    }

    private fun currentWebHandoff(): String? {
        val capture = currentAssistEvidence()?.second ?: return null
        val controls = capture.targets.filter { it.label?.isNotBlank() == true }
            .take(40).joinToString("\n") { "[${it.tag}] ${it.label.orEmpty().take(100)}" }
        return "YGG OBSERVATORY — WEB EVIDENCE (owner-shared)\n" +
            "URL: ${sanitizeUrl(capture.url)}\nTitle: ${capture.title.take(200)}\n" +
            "Read-only webpage text (may be truncated):\n${capture.text.take(12000)}\n" +
            "Visible controls (labels only; no input values):\n$controls\n" +
            "Do not assume these controls were clicked or forms submitted."
    }

    private fun shareCurrentPageToGo() {
        val handoff = currentWebHandoff() ?: run { say("ยังไม่มีข้อมูลเว็บสด · เปิดเว็บแล้วลองอีกครั้ง"); return }
        AlertDialog.Builder(this).setTitle("ส่งข้อมูลหน้าเว็บให้ GO")
            .setMessage("ส่งข้อความหน้าเว็บและชื่อปุ่มผ่าน Android แชร์ บิ๊กจะเลือกปลายทางเอง\nข้อมูลบนหน้าเว็บอาจเป็นข้อมูลส่วนตัว ตรวจสอบก่อนแชร์")
            .setNegativeButton("ยกเลิก", null)
            .setPositiveButton("เลือกแอปเพื่อแชร์") { _, _ ->
                startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, handoff)
                }, "แชร์ข้อมูลให้ GO"))
            }.show()
    }


    /** Owner approves each action locally. The existing Gecko port performs a second target/signature check. */
    private fun showOwnerAssist() {
        val (_, capture) = currentAssistEvidence() ?: run { say("รอข้อมูลหน้าเว็บสดก่อน · ลองเปิดหน้าใหม่"); return }
        val candidates = capture.targets.mapNotNull { target ->
            val action = if (target.tag.lowercase() in setOf("input", "textarea", "select")) "FILL" else "CLICK"
            if (BrowserAssistPolicy.rejection(target, action) != null) null else target to action
        }.take(100)
        if (candidates.isEmpty()) { say("ไม่พบช่องกรอกหรือปุ่มที่ปลอดภัยบนหน้านี้"); return }
        val labels = candidates.map { (target, action) ->
            "${if (action == "FILL") "กรอก" else "กด"} · ${target.label?.take(65).orEmpty().ifBlank { target.type.ifBlank { target.tag } }}"
        }.toTypedArray()
        AlertDialog.Builder(this).setTitle("ช่วยกรอก / ช่วยกด · ${capture.title.take(40)}")
            .setItems(labels) { _, selected ->
                val (target, action) = candidates[selected]
                if (action == "FILL") {
                    val field = EditText(this).apply {
                        hint = target.label ?: "ข้อความที่ต้องการกรอก"
                        setSingleLine(target.tag.lowercase() != "textarea")
                        inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
                    }
                    AlertDialog.Builder(this).setTitle("กรอก: ${target.label.orEmpty().take(80)}")
                        .setView(field).setNegativeButton("ยกเลิก", null)
                        .setPositiveButton("อนุญาตให้กรอก") { _, _ ->
                            executeOwnerAssist(capture, target, "FILL", field.text.toString())
                        }.show()
                } else {
                    AlertDialog.Builder(this).setTitle("ยืนยันการกด")
                        .setMessage("กด ${target.label.orEmpty().take(120)} บน ${sanitizeUrl(capture.url)}?\nไม่ใช่การยืนยันผลลัพธ์บนเว็บไซต์")
                        .setNegativeButton("ยกเลิก", null)
                        .setPositiveButton("อนุญาตให้กด") { _, _ -> executeOwnerAssist(capture, target, "CLICK") }.show()
                }
            }.setNegativeButton("ปิด", null).show()
    }

    private fun executeOwnerAssist(capture: DomCapture, target: com.big.gobrowser.observer.Target, action: String, value: String = "") {
        val (tab, current) = currentAssistEvidence() ?: run { say("ข้อมูลหน้าเว็บหมดอายุ · กรุณาเลือกใหม่"); return }
        if (current.captureId != capture.captureId ||
            current.targets.none { it.id == target.id && it.signature == target.signature }) {
            say("หน้าเว็บเปลี่ยนแล้ว · กรุณาเลือกปุ่มใหม่"); return
        }
        BrowserAssistPolicy.rejection(target, action, value)?.let { say("ไม่อนุญาต: $it"); return }
        val now = System.currentTimeMillis()
        val epoch = permissions.epoch(tab.id)
        val command = Command(
            commandId = java.util.UUID.randomUUID().toString(),
            actor = "OWNER_LOCAL", workId = "LOCAL_OWNER", checkpointId = "MANUAL_CONFIRM",
            tabId = tab.id, deviceId = "local-device", captureId = capture.captureId,
            revision = 0L, epoch = epoch, issuedAtEpochMs = now, expiresAtEpochMs = now + 5_000L,
            action = if (action == "FILL") BrowserAction.FILL else BrowserAction.CLICK,
            authority = if (action == "FILL") "browser.fill" else "browser.click",
            parameters = mapOf("frameId" to target.frameId, "targetId" to target.id,
                "signature" to target.signature, "value" to value), frameId = target.frameId
        )
        val guard = CommandGuard.check(command, ControlState(
            foreground = foreground, interactive = lifecycleInteractive(), deviceId = "local-device",
            tabId = tab.id, captureId = current.captureId, revision = 0L, epoch = permissions.epoch(tab.id),
            frameId = current.frameId
        ), now)
        if (!guard.accepted) { say("ไม่อนุญาต: ${guard.reason}"); return }
        engine.dispatch(tab, command) { result ->
            runOnUiThread {
                if (!destroyed) say(if (result.accepted) "ส่งคำสั่ง${if (action == "FILL") "กรอก" else "กด"}แล้ว · ตรวจผลบนหน้าเว็บ" else "ทำรายการไม่ได้: ${result.reason}")
            }
        }
    }

    private fun lyraContext(): JSONObject { val tab = engine.active() ?: return JSONObject(); val snap = observerSession.latest(tab.id) ?: return JSONObject(); val targets = JSONArray(); snap.targets.take(64).forEach { targets.put(JSONObject().put("targetId", it.id).put("frameId", it.frameId).put("label", it.label).put("tag", it.tag).put("signature", it.signature)) }; return JSONObject().put("browser", JSONObject().put("deviceId", snap.deviceId).put("tabId", snap.tabId).put("captureId", snap.captureId).put("revision", snap.revision).put("epoch", permissions.epoch(tab.id)).put("url", snap.url).put("title", snap.title).put("targets", targets)) }
    private fun lifecycleInteractive() = !isFinishing && !isDestroyed && (getSystemService(PowerManager::class.java)?.isInteractive != false)
    private fun say(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    override fun onResume() { super.onResume(); foreground = true; engine.runtime().setActivityDelegate(activityBridge); pausedByOwner = false; engine.updateVisibility(true); GeckoObserverService.mark(this, true); handler.post(tick); updateSharingStatus() }
    override fun onPause() { foreground = false; stopSharing(); engine.updateVisibility(false); GeckoObserverService.mark(this, false); handler.removeCallbacks(tick); updateSharingStatus(); super.onPause() }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (!activityBridge.onActivityResult(requestCode, resultCode, data)) super.onActivityResult(requestCode, resultCode, data)
    }
    override fun onDestroy() { destroyed = true;
        activityBridge.cancel()
        if (engine.runtime().activityDelegate === activityBridge) engine.runtime().setActivityDelegate(null)
 stopSharing(); engine.detach(); handler.removeCallbacks(tick); network.shutdown(); pantheon.close(); super.onDestroy() }
    override fun onBackPressed() { engine.back() }
}

