package com.big.gobrowser.browser

import android.app.Activity
import android.app.AlertDialog
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import com.big.gobrowser.control.*
import com.big.gobrowser.observer.*
import com.big.gobrowser.transport.*
import com.big.gobrowser.lyra.LyraDialog
import org.json.JSONObject
import org.json.JSONArray
import java.util.concurrent.Executors

class BrowserActivity : Activity() {
    private lateinit var tabStore: TabStore
    private lateinit var address: EditText
    private lateinit var lifecycle: BrowserLifecycle
    private lateinit var observerSession: ObserverSession
    private lateinit var shareButton: Button
    private lateinit var credentials: AndroidDeviceCredentialStore
    private val handler = Handler(Looper.getMainLooper())
    private val network = Executors.newSingleThreadExecutor()
    private val permissions = PermissionStore()
    private val outbox = Outbox()
    private val executor = CommandExecutor(ActionRunner { null })
    private var owner: OwnerRelayConfiguration? = null
    @Volatile private var sync: SyncService? = null
    private var foreground = false
    private var destroyed = false
    private var captureBusy = false
    private var commandBusy = false
    private var syncBusy = false
    @Volatile private var generation = 0L
    private val commands = java.util.ArrayDeque<Command>()
    private val receipts = java.util.ArrayDeque<Receipt>()
    private val tick = object : Runnable {
        override fun run() {
            if (!foreground) return
            if (!commandBusy) captureActive()
            syncActive()
            handler.postDelayed(this, 5_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycle = BrowserLifecycle(this, getSystemService(PowerManager::class.java))
        credentials = AndroidDeviceCredentialStore(this)
        observerSession = ObserverSession("local-device", "0.1.0")
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(8, 8, 8, 8)
        }
        address = EditText(this).apply {
            hint = "https://example.com"
            setSingleLine(true)
            imeOptions = EditorInfo.IME_ACTION_GO
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setOnEditorActionListener { _, _, _ -> navigateFromAddress(); true }
        }
        toolbar.addView(address)
        toolbar.addView(button("ไป") { navigateFromAddress() })
        val navigation = LinearLayout(this)
        navigation.addView(button("‹") { tabStore.active()?.webView?.goBack() })
        navigation.addView(button("›") { tabStore.active()?.webView?.goForward() })
        navigation.addView(button("↻") { tabStore.active()?.webView?.reload() })
        navigation.addView(button("แท็บ") { showTabs() })
        navigation.addView(button("+") { stopSharing(); tabStore.open(); configureActiveWebView() })
        shareButton = button("Share") { toggleShare() }
        val settings = LinearLayout(this)
        settings.addView(button("ไลร่า") { LyraDialog.show(this,"INSIDE") { lyraContext() } })
        settings.addView(button("แผนที่") { startActivity(android.content.Intent(this, com.big.gobrowser.outsideview.OutsideViewActivity::class.java)) })
        settings.addView(shareButton)
        settings.addView(button("เมโทร") { connectStation() })
        settings.addView(button("Relay") { configureRelay() })
        settings.addView(button("Disconnect") { disconnect() })
        val browserContainer = FrameLayout(this)
        root.addView(toolbar)
        root.addView(scroll(navigation))
        root.addView(scroll(settings))
        root.addView(browserContainer, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        tabStore = TabStore(this, browserContainer) { url -> address.setText(url) }
        tabStore.restore()
        configureActiveWebView()
    }

    private fun scroll(row:LinearLayout)=android.widget.HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled=false;addView(row,ViewGroup.LayoutParams(-2,-2)) }
    private fun showTabs() {
        val tabs=tabStore.list()
        AlertDialog.Builder(this).setTitle("แท็บ").setItems(tabs.map {it.webView.title?:it.webView.url?:"หน้าใหม่"}.toTypedArray()){_,i->stopSharing();tabStore.select(tabs[i].id);configureActiveWebView()}
            .setNeutralButton("ปิดแท็บนี้"){_,_->stopSharing();tabStore.active()?.let {tabStore.close(it.id)};if(tabStore.active()==null)tabStore.open();configureActiveWebView()}.setNegativeButton("กลับ",null).show()
    }
    private fun lyraContext():JSONObject {
        val tab=tabStore.active()
        val snap=tab?.let {observerSession.latest(it.id)}
        if(snap==null || tab==null || !observerSession.isSharing(tab.id))return JSONObject()
        val targets=JSONArray();snap.targets.take(32).forEach {targets.put(JSONObject().put("id",it.id).put("label",it.label).put("kind",it.kind).put("role",it.role))}
        return JSONObject().put("browser",JSONObject().put("deviceId",snap.deviceId).put("tabId",snap.tabId).put("captureId",snap.captureId).put("revision",snap.revision).put("epoch",permissions.epoch(tab.id)).put("capturedAtEpochMs",snap.capturedAtEpochMs).put("foreground",foreground).put("interactive",lifecycle.isInteractive()).put("url",snap.url).put("title",snap.title).put("text",snap.text.take(4000)).put("targets",targets))
    }
    private fun connectStation() {
        ObservatoryStationConnection(this).pair(this) { config,secret ->
            stopSharing();receipts.clear();credentials.save(secret);owner=config
            observerSession=ObserverSession(config.deviceId,"0.2.0")
            sync=SyncService(HttpRelayClient(config.endpoints,object:DeviceCredentialStore {override fun load()=secret;override fun save(token:String)=error("read-only");override fun revoke()=Unit}),outbox)
            say("เชื่อมเมโทรแล้ว กด Share เพื่อเปิดให้โกอ่านและจัดการ")
        }
    }

    private fun configureActiveWebView() { tabStore.active()?.webView?.webViewClient = client() }
    private fun client() = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            !BrowserSettings.isAllowedUrl(request.url.toString())

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            val tab = tabStore.active() ?: return
            if (tab.webView !== view) return
            val sharing = observerSession.isSharing(tab.id)
            stopSharing()
            if (sharing && foreground) { observerSession.start(tab.id); shareButton.text = "Stop" }
        }
        override fun onPageFinished(view: WebView, url: String) {
            if (tabStore.active()?.webView !== view) return
            address.setText(url)
            captureActive()
        }
    }

    private fun toggleShare() {
        val tab = tabStore.active() ?: return
        if (observerSession.isSharing(tab.id)) { stopSharing(); say("หยุดแชร์แท็บแล้ว") }
        else { observerSession.start(tab.id); shareButton.text = "Stop"; captureActive(notify = true) }
    }

    private fun stopSharing() {
        generation += 1
        tabStore.active()?.let { tab ->
            observerSession.stop(tab.id)
            val epoch=permissions.revoke(tab.id)
            if(owner!=null)network.execute {runCatching {ObservatoryStationConnection(this).stop("browser",epoch)}}
            outbox.clearTab(tab.id)
        }
        commands.clear()
        shareButton.text = "Share"
    }

    private fun captureActive(force: Boolean = false, notify: Boolean = false, done: (Snapshot?) -> Unit = {}) {
        val tab = tabStore.active()
        if (tab == null || !foreground || !lifecycle.isInteractive() || !observerSession.isSharing(tab.id) || captureBusy) {
            if (notify) say("กด Share ขณะเปิดหน้าเว็บก่อน")
            done(null); return
        }
        captureBusy = true
        val permissionGeneration = generation
        val observer = WebViewObserver(this, tab.webView)
        observer.capture { capture ->
            if (destroyed || permissionGeneration != generation || !foreground || capture == null) {
                captureBusy = false; done(null); return@capture
            }
            val snapshot = observerSession.capture(tab.id, capture.url, capture.title, capture.text, capture.targets,
                capture.captureId, force || capture.targetsChanged)
            // Dedupe may retain the last snapshot; bind only while dispatch is gated by captureBusy.
            val latest = snapshot ?: observerSession.latest(tab.id)
            if (snapshot != null && sync != null) outbox.enqueue(snapshot.copy(epoch = permissions.epoch(tab.id)))
            if (latest == null) { captureBusy = false; done(null); return@capture }
            observer.bindCaptureId(latest.captureId) {
                captureBusy = false
                if (permissionGeneration == generation && foreground) {
                    if (notify) say(if (snapshot == null) "ไม่มีเนื้อหาใหม่" else "จับข้อความแล้ว #${snapshot.sequence}")
                    done(latest)
                } else done(null)
                processNextCommand()
            }
        }
    }

    private fun syncActive() {
        val service = sync ?: return
        val tab = tabStore.active() ?: return
        if (syncBusy || !foreground || !observerSession.isSharing(tab.id)) return
        syncBusy = true
        val permissionGeneration = generation
        val batch = receipts.toList()
        network.execute {
            if (permissionGeneration != generation || service !== sync) {
                handler.post { syncBusy = false }; return@execute
            }
            val acknowledged = batch.filter { permissionGeneration == generation && service === sync && runCatching { service.publishReceipt(it) }.isSuccess }
            val report = runCatching { service.syncOnce { permissionGeneration == generation && service === sync } }.getOrNull()
            handler.post {
                syncBusy = false
                if (destroyed || permissionGeneration != generation || service !== sync) return@post
                acknowledged.forEach { receipts.remove(it) }
                if (report != null) {
                    report.commands.take(100 - commands.size).forEach { commands.addLast(it) }
                    processNextCommand()
                }
            }
        }
    }

    private fun processNextCommand() {
        if (captureBusy || commandBusy || commands.isEmpty() || destroyed) return
        val command = commands.removeFirst()
        val config = owner
        val tab = tabStore.active()
        val latest = tab?.let { observerSession.latest(it.id) }
        val fresh = latest != null && System.currentTimeMillis() - latest.capturedAtEpochMs <= Freshness.LIVE_CAPTURE_MAX_AGE_MS
        val state = ControlState(foreground && tab != null && observerSession.isSharing(tab.id) && fresh,
            lifecycle.isInteractive(), config?.deviceId.orEmpty(), tab?.id.orEmpty(), latest?.captureId.orEmpty(),
            latest?.revision ?: -1, tab?.let { permissions.epoch(it.id) } ?: -1)
        if (config == null || !config.allows(command)) {
            queueReceipt(Receipt(command.commandId, ReceiptStatus.REJECTED, "OWNER_SCOPE_MISMATCH", latest?.captureId,
                null, System.currentTimeMillis(), null, BusinessOutcome.UNKNOWN))
            processNextCommand(); return
        }
        commandBusy = true
        val commandConnection = sync
        val permissionGeneration = generation
        executor.executeAsync(command, state, { request, complete ->
            val view = tab?.webView ?: error("No active WebView")
            WebViewCommandDispatcher(view).dispatch(request) { result ->
                if (!result.accepted) complete(ActionReadback(false, result.reason))
                else if (permissionGeneration != generation || !foreground) complete(ActionReadback(true, result.reason))
                else captureActive(force = true) { after ->
                    complete(ActionReadback(true, result.reason, after?.captureId, after?.let { "DOM_CAPTURED" }))
                }
            }
        }) { receipt ->
            commandBusy = false
            if (commandConnection === sync) queueReceipt(receipt)
            processNextCommand()
        }
    }

    private fun queueReceipt(receipt: Receipt) {
        if (receipts.size < 100) receipts.addLast(receipt)
    }

    private fun configureRelay() {
        val form = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(24, 8, 24, 8) }
        val contract = EditText(this).apply { hint = "Owner relay configuration (JSON)"; minLines = 4 }
        val token = EditText(this).apply { hint = "Device token"; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
        form.addView(contract); form.addView(token)
        AlertDialog.Builder(this).setTitle("Relay จากเจ้าของระบบ").setView(form)
            .setNegativeButton("Cancel", null).setPositiveButton("Review") { _, _ ->
                val config = runCatching { OwnerRelayConfiguration.parse(contract.text.toString()) }.getOrNull()
                val secret = token.text.toString()
                token.text.clear()
                if (config == null || secret.isBlank()) { say("ต้องมี owner configuration และ token ที่ถูกต้อง"); return@setPositiveButton }
                val details = "${config.endpoints.publishSnapshots}\n${config.endpoints.pollCommands}\n${config.endpoints.publishReceipts}\nDevice: ${config.deviceId}\nWork: ${config.workId}\nCheckpoint: ${config.checkpointId}\nActor: ${config.actor}\n${config.authorities.joinToString()}"
                AlertDialog.Builder(this).setTitle("อนุญาต relay นี้บนเครื่อง").setMessage(details)
                    .setNegativeButton("Cancel", null).setPositiveButton("Connect") { _, _ ->
                        runCatching {
                            stopSharing()
                            receipts.clear()
                            credentials.save(secret)
                            val boundCredentials = object : DeviceCredentialStore {
                                override fun load(): String = secret
                                override fun save(token: String) = error("Read-only connection credential")
                                override fun revoke() = Unit
                            }
                            owner = config
                            observerSession = ObserverSession(config.deviceId, "0.1.0")
                            sync = SyncService(HttpRelayClient(config.endpoints, boundCredentials), outbox)
                        }.onSuccess { say("ตั้งค่า relay แล้ว กด Share เพื่อเริ่ม") }
                            .onFailure { say("ตั้งค่า credential ไม่สำเร็จ") }
                    }.show()
            }.show()
    }

    private fun disconnect() {
        stopSharing()
        sync = null; owner = null; receipts.clear()
        runCatching { credentials.revoke() }.onFailure { say("ล้าง credential ไม่สำเร็จ") }
        network.execute {ObservatoryStationConnection(this).disconnect()}
    }

    private fun navigateFromAddress() {
        val raw = address.text.toString().trim()
        if (!BrowserSettings.isAllowedUrl(raw)) { say("เปิดได้เฉพาะ HTTPS"); return }
        if (foreground && lifecycle.isInteractive()) tabStore.active()?.webView?.loadUrl(raw)
    }
    private fun say(message: String) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show() }
    private fun button(label: String, action: () -> Unit) = Button(this).apply {
        text = label; setOnClickListener { action() }; minWidth = 0
    }
    override fun onResume() { super.onResume(); foreground = true; handler.post(tick) }
    override fun onPause() {
        foreground = false; handler.removeCallbacks(tick); stopSharing(); super.onPause()
    }
    override fun onDestroy() {
        destroyed = true; handler.removeCallbacks(tick); network.shutdownNow(); super.onDestroy()
    }
    override fun onBackPressed() {
        val active = tabStore.active()?.webView
        if (active?.canGoBack() == true) active.goBack() else super.onBackPressed()
    }
}
