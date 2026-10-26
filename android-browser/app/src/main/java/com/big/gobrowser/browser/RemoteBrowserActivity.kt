package com.big.gobrowser.browser

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import com.big.gobrowser.outsideview.OutsideViewActivity
import com.big.gobrowser.transport.AndroidDeviceCredentialStore
import com.big.gobrowser.transport.StationDiagnostics
import com.big.gobrowser.transport.StationFailure
import com.big.gobrowser.transport.StationResponse
import com.big.gobrowser.transport.StationHttp
import com.big.gobrowser.ui.ObservatoryTheme
import com.big.gobrowser.ui.PhoneLayout
import com.big.gobrowser.ui.AdaptiveWorkspace
import com.big.gobrowser.ui.ObservatoryBuildStamp
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.util.concurrent.Executors

/**
 * Two-mode Observatory: Browser is a Cloudflare remote session; GOVIEW is native/offline.
 * Android WebView here renders only Cloudflare's Live View client, never the target website.
 * No GeckoRuntime or GeckoView is instantiated or packaged.
 */
class RemoteBrowserActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private val safetyIo = Executors.newFixedThreadPool(2)
    private val requestEpoch = BrowserRequestEpoch()
    private val credentials by lazy { AndroidDeviceCredentialStore(this,
        "observatory-remote-owner-key", "observatory-remote-owner") }
    private val prefs by lazy { getSharedPreferences("observatory-remote-ui", MODE_PRIVATE) }
    private lateinit var address: EditText
    private lateinit var status: TextView
    private lateinit var controller: TextView
    private lateinit var page: WebView
    private lateinit var touchBlock: View
    private lateinit var toolbar: LinearLayout
    private lateinit var addressRow: LinearLayout
    private lateinit var navigationRow: LinearLayout
    private var liveViewerActive = false
    private var swipeDownX = 0f
    private var swipeDownY = 0f
    private var swipeStarted = false
    private var foreground = false
    private var destroyed = false
    private var busy = false
    private var safetyPending = 0
    private var session = false
    private var goControls = false
    private var jobId: String? = null
    private var latestJobStatus = ""
    private var latestNoteAt = ""
    private val poll = object : Runnable {
        override fun run() {
            if (!foreground || destroyed) return
            if (!busy && configured()) query("GET", "/v1/session", null) { result ->
                result.onSuccess { renderSession(it) }
            }
            main.postDelayed(this, 5000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val switcher = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        switcher.addView(action("🌐 Browser") { toggleNativeChrome() }, weighted())
        switcher.addView(action("🗺 GOVIEW") {
            startActivity(Intent(this, OutsideViewActivity::class.java))
        }, weighted())
        switcher.addView(action("ⓘ Updates") { startActivity(Intent(this, com.big.gobrowser.update.AppMaintenanceActivity::class.java)) }, weighted())
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        address = EditText(this).apply {
            hint = "https://shop.yggmetro.com/"
            setSingleLine()
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            setText(prefs.getString("last-url", "https://shop.yggmetro.com/"))
            setOnEditorActionListener { _, _, _ -> openAddress();true }
        }
        ObservatoryTheme.address(address)
        row.addView(address, LinearLayout.LayoutParams(0, dp(48), 1f))
        row.addView(action("ไป") { openAddress() }, LinearLayout.LayoutParams(dp(62), dp(48)))
        addressRow = row
        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        controls.addView(action("‹") { step("back") }, weighted())
        controls.addView(action("›") { step("forward") }, weighted())
        controls.addView(action("↻") { step("reload") }, weighted())
        controls.addView(action("⚙") { openSettings() }, weighted())
        navigationRow = controls
        status = ObservatoryTheme.status(this).apply { text = "ยังไม่ได้เชื่อม Cloudflare · แตะ ⚙ เพื่อตั้งค่า" }
        controller = ObservatoryTheme.status(this).apply { text = "ผู้ควบคุม: BIG · ยังไม่มีเซสชัน" }
        val workspace = AdaptiveWorkspace(this)
        val host = workspace.canvas
        page = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            // Cloudflare Live View is a remote Chrome tab, not a local webpage.
            // Hosted taps work on the owner's phone, but swipes fail to move the page.
            // Forward only a completed clearly vertical owner swipe through the Worker.
            setOnTouchListener { _, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        swipeDownX = event.x
                        swipeDownY = event.y
                        swipeStarted = true
                    }
                    MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN -> swipeStarted = false
                    MotionEvent.ACTION_UP -> {
                        if (swipeStarted && liveViewerActive && session && !goControls) {
                            val delta = RemoteSwipeScroll.delta(
                                swipeDownX, swipeDownY, event.x, event.y, dp(48).toFloat()
                            )
                            if (delta != null) {
                                query("POST", "/v1/action",
                                    JSONObject().put("type", "scroll").put("y", delta)) { result ->
                                    result.onFailure {
                                        status.text = "เลื่อนหน้าเว็บไม่ได้ · " + readableError(it)
                                    }
                                }
                            }
                        }
                        swipeStarted = false
                    }
                }
                false // Preserve tap, text input and hosted Live View controls.
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    !allowedViewerUrl(request.url.toString())
                override fun onReceivedError(view: WebView, request: WebResourceRequest,
                    error: android.webkit.WebResourceError) {
                    if (request.isForMainFrame) status.text = "Live View ขัดข้อง · กดดูสดอีกครั้ง"
                }
            }
        }
        host.addView(page, FrameLayout.LayoutParams(-1, -1))
        touchBlock = View(this).apply {
            setBackgroundColor(0x00000000)
            isClickable = true
            contentDescription = "GO ควบคุมอยู่ · ใช้ปุ่มฉันควบคุมเองเพื่อยึดคืน"
            visibility = View.GONE
        }
        host.addView(touchBlock, FrameLayout.LayoutParams(-1, -1))
        root.addView(workspace, LinearLayout.LayoutParams(-1, 0, 1f))
        toolbar = workspace.commands
        val primary = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        primary.addView(action("GO · ดู / ทำ") { showGoMenu() }, weighted())
        primary.addView(action("เพิ่มเติม") { showBrowserTools() }, weighted())
        val safety = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        safety.addView(action("✋ ฉันควบคุมเอง") { takeOver() }, weighted())
        safety.addView(action("⏹ หยุด GO") { showStopMenu() }, weighted())
        toolbar.addView(safety)
        toolbar.addView(primary)
        toolbar.addView(switcher)
        toolbar.addView(addressRow)
        toolbar.addView(navigationRow)
        toolbar.addView(controller)
        toolbar.addView(status)
        toolbar.addView(ObservatoryTheme.title(this, "YGG OBSERVATORY · Browser"))
        ObservatoryTheme.apply(this, root)
        PhoneLayout.fitSystemBars(root)
        setContentView(root)
        if (configured()) {
            query("GET", "/v1/session", null) { result ->
                result.onSuccess { renderSession(it);if (session) viewLive() }
                    .onFailure { status.text = "เชื่อมต่อไม่ได้ · " + readableError(it) }
            }
        } else openSettings()
    }
    private fun dp(value: Int) = ObservatoryTheme.dp(this, value)
    private fun toggleNativeChrome() {
        val show = addressRow.visibility != View.VISIBLE
        addressRow.visibility = if (show) View.VISIBLE else View.GONE
        navigationRow.visibility = if (show) View.VISIBLE else View.GONE
        if (show) address.post { address.requestFocus(); address.requestRectangleOnScreen(android.graphics.Rect(0, 0, address.width, address.height)) }
    }
    private fun hideDuplicateChrome() {
        addressRow.visibility = View.GONE
        navigationRow.visibility = View.GONE
    }
    private fun weighted() = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    private fun action(label: String, click: () -> Unit) = ObservatoryTheme.button(this,label,click).apply {
        textSize = 13f
        minHeight = dp(48)
        setPadding(dp(6),dp(6),dp(6),dp(6))
    }
    private fun showGoMenu() {
        AlertDialog.Builder(this).setTitle("GO · Browser")
            .setItems(arrayOf("👁 เชิญ GO ดู", "🖐 ให้ GO ควบคุม", "อ่านหน้าเว็บ", "🔐 สิทธิ์เว็บไซต์ · GO")) { _, choice ->
                when (choice) { 0 -> inviteGo(); 1 -> grantGo(); 2 -> readPage(); 3 -> sitePermissionManager() }
            }.setNegativeButton("ปิด", null).show()
    }
    private fun showBrowserTools() {
        AlertDialog.Builder(this).setTitle("Browser · เพิ่มเติม")
            .setItems(arrayOf("▶ ดูสด / กู้คืนภาพ", "☷ ผลงาน", "🌙 เบื้องหลัง", "ที่อยู่ / การนำทาง", "⚙ การเชื่อมต่อ", "ⓘ อัปเดตแอป")) { _, choice ->
                when (choice) {
                    0 -> viewLive(); 1 -> showJob(); 2 -> backgroundMenu(); 3 -> toggleNativeChrome()
                    4 -> openSettings()
                    5 -> startActivity(Intent(this, com.big.gobrowser.update.AppMaintenanceActivity::class.java))
                }
            }.setNegativeButton("ปิด", null).show()
    }
    private fun showStopMenu() {
        AlertDialog.Builder(this).setTitle("หยุด GO / ปิด Browser")
            .setItems(arrayOf("หยุดงานที่กำลังรอ", "รับการควบคุมกลับ", "เพิกถอนสิทธิ์ GO ดู", "ปิดเซสชัน Browser")) { _, choice ->
                when (choice) {
                    0 -> query("POST", "/v1/stop", JSONObject()) { result ->
                        result.onSuccess { renderSession(it) }.onFailure { status.text = "หยุดไม่ได้ · " + readableError(it) }
                    }
                    1 -> takeOver()
                    2 -> query("POST", "/v1/observe-access", JSONObject().put("allow", false)) { result ->
                        result.onSuccess { renderSession(it) }.onFailure { status.text = "เพิกถอนไม่ได้ · " + readableError(it) }
                    }
                    3 -> closeSession()
                }
            }.setNegativeButton("ยกเลิก", null).show()
    }
    private fun configured() = serviceUrl() != null && !credentials.load().isNullOrBlank()
    private fun serviceUrl(): String? = validServiceUrl(prefs.getString("service", null))
    private fun validServiceUrl(input: String?): String? = runCatching {
        val uri = URI(input?.trim() ?: return null)
        val host = uri.host?.lowercase() ?: return null
        if (uri.scheme != "https" || uri.userInfo != null || uri.port != -1 || uri.rawQuery != null ||
            uri.fragment != null || uri.path.orEmpty().trimEnd('/').isNotEmpty() ||
            !(host == "observatory-shared-browser.pureekangraw.workers.dev" ||
              host == "yggmetro.com" || host.endsWith(".yggmetro.com"))) return null
        "https://" + host
    }.getOrNull()
    private fun allowedViewerUrl(url: String): Boolean = BrowserResponse.allowedViewerUrl(url)
    private fun validWebUrl(raw: String): String? {
        val text = raw.trim().let { if (it.contains("://")) it else "https://" + it }
        return runCatching {
            val u = URI(text)
            if (u.scheme != "https" || u.userInfo != null || u.host.isNullOrBlank() || u.port != -1 ||
                u.host.equals("localhost", true) || u.host.startsWith("127.") || u.host.startsWith("10.") ||
                u.host.startsWith("192.168.") || u.host.endsWith(".local")) null else u.toString()
        }.getOrNull()
    }
    private fun openSettings() {
        val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL;setPadding(dp(12),dp(8),dp(12),dp(8)) }
        val endpoint = EditText(this).apply {
            setSingleLine()
            hint = "https://observatory-shared-browser.…workers.dev"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(serviceUrl() ?: "https://observatory-shared-browser.pureekangraw.workers.dev")
        }
        val secret = EditText(this).apply {
            setSingleLine()
            hint = "OWNER_TOKEN จาก Cloudflare (เก็บเข้ารหัสบนเครื่อง)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        column.addView(ObservatoryTheme.status(this).apply {
            text = "เชื่อมต่อ Worker ที่บิ๊กเป็นเจ้าของ · คีย์ต้องตั้งเป็น Secret บน Cloudflare ก่อน\nBrowser Mode ต้องใช้อินเทอร์เน็ต แต่ GOVIEW ยังเปิดแผนที่ในเครื่องได้"
        })
        column.addView(endpoint)
        column.addView(secret)
        val recording = CheckBox(this).apply {
            text="บันทึกการทำงานไว้ดูย้อนหลังบน Cloudflare (อาจเก็บภาพ/ข้อความของเว็บที่เปิด)"
            textSize=13f
            isChecked=prefs.getBoolean("record-browser",false)
        }
        column.addView(recording)
        column.addView(ObservatoryBuildStamp.view(this))
        AlertDialog.Builder(this).setTitle("Cloudflare Shared Browser").setView(column)
            .setPositiveButton("เชื่อมต่อ") { _, _ ->
                val url = validServiceUrl(endpoint.text.toString())
                if (url == null) { status.text = "ที่อยู่ Worker ต้องเป็น HTTPS และโดเมนที่อนุญาต";return@setPositiveButton }
                val token = secret.text.toString()
                if (token.isNotEmpty()) {
                    if (token.length < 32 || token.length > 256) { status.text = "OWNER_TOKEN ไม่ถูกต้อง";return@setPositiveButton }
                    credentials.save(token)
                }
                if (!prefs.edit().putString("service",url)
                    .putBoolean("record-browser",recording.isChecked).commit()) {
                    status.text = "บันทึกการตั้งค่า Worker ไม่สำเร็จ";return@setPositiveButton
                }
                if (!configured()) {status.text = "ต้องมี OWNER_TOKEN และ Worker ก่อนใช้งาน";return@setPositiveButton}
                query("GET", "/v1/session", null) { result ->
                    result.onSuccess { renderSession(it); status.text = "เชื่อมต่อ Worker แล้ว · กด ไป เพื่อเปิดเว็บ" }
                        .onFailure { status.text = "ยังเชื่อมไม่ได้ · " + readableError(it) }
                }
            }.setNeutralButton("ลบคีย์") { _, _ ->
                credentials.revoke()
                page.loadUrl("about:blank")
                liveViewerActive = false
                session=false;goControls=false;touchBlock.visibility=View.GONE
                status.text = "ลบคีย์เจ้าของออกจากเครื่องแล้ว"
            }.setNegativeButton("ยกเลิก",null).show()
    }
    private fun openAddress() {
        val url = validWebUrl(address.text.toString())
        if (url == null) {status.text = "ต้องเป็นเว็บไซต์ HTTPS สาธารณะ";return}
        prefs.edit().putString("last-url",url).apply()
        val body=JSONObject().put("url",url)
            .put("recording",prefs.getBoolean("record-browser",false))
        // A new session is owner initiated; after connection the same remote tab persists.
        query("POST", "/v1/session", body) { result ->
            result.onSuccess { renderSession(it);viewLive() }
                .onFailure { status.text = "เปิดเว็บไม่ได้ · " + readableError(it) }
        }
    }
    private fun viewLive() {
        if (!session) {status.text="เปิดเว็บไซต์ด้วยปุ่ม ไป ก่อน";return}
        query("GET", "/v1/view", null) { result ->
            result.onSuccess {
                val link=it.optString("url")
                if (allowedViewerUrl(link)) {
                    page.loadUrl(link)
                    liveViewerActive = true
                    hideDuplicateChrome()
                    status.text = if(goControls) "GO ได้สิทธิ์ควบคุม · บิ๊กดูสดได้" else "LIVE · BIG กำลังดูหน้าเว็บระยะไกล"
                } else status.text="Live View URL ไม่ถูกต้อง"
            }.onFailure {status.text="เปิด Live View ไม่ได้ · " + readableError(it)}
        }
    }
    /** BIG authorizes each HTTPS host before separately inviting GO to the session. */
    private fun withApprovedSite(next:()->Unit) {
        if(!session){status.text="เปิดเว็บไซต์ก่อน";return}
        query("GET","/v1/site-permissions",null){outcome->
            outcome.onSuccess {record->
                if(record.optBoolean("canInviteGo")){next();return@onSuccess}
                val host=record.optString("pageHost")
                if(host.isBlank()){status.text="อ่านโดเมนปัจจุบันไม่ได้";return@onSuccess}
                AlertDialog.Builder(this).setTitle("อนุญาตให้ GO เข้า "+host+"?")
                    .setMessage("อนุญาตเว็บไซต์นี้เท่านั้น GO ยังต้องได้รับคำเชิญแต่ละเซสชัน\\nถอนสิทธิ์ได้จาก 🔐 สิทธิ์เว็บไซต์")
                    .setNegativeButton("ยกเลิก",null)
                    .setPositiveButton("อนุญาตเว็บนี้"){_,_->
                        query("POST","/v1/site-permissions",JSONObject()
                            .put("action","allow").put("host",host)){saved->
                            saved.onSuccess {v->
                                if(v.optBoolean("canInviteGo")){status.text="อนุญาต "+host+" แล้ว";next()}
                                else status.text="อนุญาตไซต์ไม่สำเร็จ"
                            }.onFailure {status.text="ตั้งค่าสิทธิ์เว็บไม่ได้ · "+readableError(it)}
                        }
                    }.show()
            }.onFailure {status.text="อ่านสิทธิ์เว็บไม่ได้ · "+readableError(it)}
        }
    }

    private fun sitePermissionManager() {
        if(!configured()){status.text="ตั้งค่า Cloudflare ก่อน";return}
        query("GET","/v1/site-permissions",null){outcome->
            outcome.onSuccess {record->
                val host=record.optString("pageHost").takeIf{it.isNotBlank()}
                val sites=record.optJSONArray("approvedSites")?:JSONArray()
                val labels=mutableListOf<String>()
                if(host!=null)labels.add("เว็บปัจจุบัน: "+host+" · "+
                    if(record.optBoolean("canInviteGo"))"อนุญาต GO" else "ยังไม่อนุญาต GO")
                for(i in 0 until sites.length())labels.add("ถอนสิทธิ์: "+sites.optString(i))
                AlertDialog.Builder(this).setTitle("🔐 จัดการสิทธิ์เว็บไซต์")
                    .setMessage("การอนุญาตเว็บแยกจากสิทธิ์ควบคุมเซสชัน รายการเก็บใน Workspace ของบิ๊ก")
                    .setItems(labels.toTypedArray()){_,index->
                        if(host!=null&&index==0){
                            if(record.optBoolean("ownerGranted")&&!record.optBoolean("defaultGranted"))
                                confirmRevokeHost(host)
                            else if(!record.optBoolean("canInviteGo"))
                                withApprovedSite {status.text="อนุญาตเว็บแล้ว · กด 👁 หรือ 🖐 เพื่อเชิญ GO"}
                            else status.text="ไซต์นี้รองรับ GO อยู่แล้ว"
                        }else{
                            val i=index-if(host!=null)1 else 0
                            if(i>=0&&i<sites.length())confirmRevokeHost(sites.getString(i))
                        }
                    }.setNegativeButton("ปิด",null).show()
            }.onFailure {status.text="โหลดสิทธิ์เว็บไม่ได้ · "+readableError(it)}
        }
    }
    private fun confirmRevokeHost(host:String) {
        AlertDialog.Builder(this).setTitle("ถอนสิทธิ์ GO?")
            .setMessage("ถอนสิทธิ์ "+host+" · GO จะเสียสิทธิ์ดู/ควบคุมเว็บนี้")
            .setNegativeButton("ยกเลิก",null).setPositiveButton("ถอนสิทธิ์"){_,_->
                query("POST","/v1/site-permissions",JSONObject()
                    .put("action","revoke").put("host",host)){result->
                    result.onSuccess {
                        status.text="ถอนสิทธิ์ "+host+" แล้ว"
                        query("GET","/v1/session",null){updated->updated.onSuccess{renderSession(it)}}
                    }.onFailure {status.text="ถอนสิทธิ์ไม่ได้ · "+readableError(it)}
                }
            }.show()
    }

    private fun inviteGo() {
        if(!session) {status.text="เปิดเว็บไซต์ก่อน";return}
        AlertDialog.Builder(this).setTitle("เชิญ GO ดูหน้าเว็บ")
            .setMessage("อนุญาตให้ GO ที่ถือคีย์แบบอ่านอย่างเดียวอ่านหน้าเว็บเซสชันนี้ผ่านช่องเครื่องมือที่เชื่อมแล้ว\n\nไม่อนุญาตให้กดหรือเปลี่ยนข้อมูล")
            .setPositiveButton("เชิญ GO") { _,_->
                withApprovedSite {
                    query("POST","/v1/observe-access",JSONObject().put("allow",true)){result->
                    result.onSuccess {renderSession(it);readPage()}
                        .onFailure {status.text="เชิญ GO ไม่สำเร็จ · "+readableError(it)}
                    }
                }
            }.setNegativeButton("ยกเลิก",null).show()
    }
    private fun readPage() {
        if(!session){status.text="เปิดเว็บไซต์ก่อน";return}
        query("GET", "/v1/observe", null){result->
            result.onSuccess {
                val text=it.optString("text").take(5000)
                val content="หน้า: "+it.optString("title")+"\n"+it.optString("url")+"\n\n"+
                    text+"\n\nเครื่องมือที่พบ: "+it.optJSONArray("controls")?.length()
                AlertDialog.Builder(this).setTitle("👁 Browser Observation")
                    .setMessage(content).setPositiveButton("ปิด",null).show()
            }.onFailure {status.text="อ่านหน้าไม่ได้ · "+readableError(it)}
        }
    }
    private fun grantGo() {
        if(!session){status.text="เปิดเว็บไซต์ก่อน";return}
        AlertDialog.Builder(this).setTitle("ให้ GO ควบคุมหน้าเว็บ?")
            .setMessage("GO จะได้รับสิทธิ์กด/พิมพ์ผ่าน GO Controller ที่เชื่อมกับ Worker นี้ เฉพาะโดเมนที่อนุญาต\n\nการเปิดสิทธิ์ไม่ได้แปลว่า GO เริ่มงานเอง ต้องมีคำสั่งงานผ่านช่อง GO ที่เชื่อมแล้ว")
            .setPositiveButton("อนุญาต") { _,_->
                withApprovedSite {
                    query("POST", "/v1/control", JSONObject().put("controller","GO")){result->
                    result.onSuccess { renderSession(it) }
                        .onFailure {status.text="ยังให้ GO ควบคุมไม่ได้ · "+readableError(it)}
                    }
                }
            }.setNegativeButton("ยกเลิก",null).show()
    }
    private fun takeOver() {
        query("POST", "/v1/control", JSONObject().put("controller","BIG")){result->
            result.onSuccess {renderSession(it);status.text="BIG รับการควบคุมกลับแล้ว"}
                .onFailure {status.text="รับการควบคุมกลับไม่ได้ · "+readableError(it)}
        }
    }
    private fun step(type: String) {
        if(!session){status.text="เปิดเว็บไซต์ก่อน";return}
        query("POST","/v1/action",JSONObject().put("type",type)){result->
            result.onSuccess {status.text="ส่งคำสั่ง "+type+" แล้ว · กด ▶ หากต้องการดูสด"}
                .onFailure {status.text="คำสั่งไม่สำเร็จ · "+readableError(it)}
        }
    }
    private fun backgroundMenu() {
        if(!session){status.text="เปิดเว็บไซต์ก่อน";return}
        AlertDialog.Builder(this).setTitle("🌙 ทำงานเบื้องหลัง")
            .setItems(arrayOf("ให้ GO ทำงานแทน (ไม่แสดงเว็บ)", "ตรวจหน้าเว็บอัตโนมัติ", "กลับดูเว็บสด")) { _,choice ->
                when(choice) {
                    0 -> AlertDialog.Builder(this)
                        .setTitle("ให้ GO ทำงานโดยไม่เปิดหน้าจอ?")
                        .setMessage("อนุญาตให้ GO ที่เชื่อมเครื่องมือควบคุมเว็บได้ แล้วซ่อน Live View ไว้ GO ยังต้องได้รับคำสั่งงานผ่านช่องที่เชื่อมจริง")
                        .setPositiveButton("อนุญาตและซ่อน") { _,_->
                            withApprovedSite {
                            query("POST","/v1/control",JSONObject().put("controller","GO")) { result->
                                result.onSuccess {
                                    renderSession(it)
                                    page.loadUrl("about:blank")
                                    liveViewerActive = false
                                    status.text="GO ได้สิทธิ์ทำงาน · ซ่อน Live View แล้ว เปิด ☷ ผลงานเพื่อติดตาม"
                                }.onFailure {status.text="มอบหมายไม่ได้ · "+readableError(it)}
                            }
                            }
                        }.setNegativeButton("ยกเลิก",null).show()
                    1 -> auditCurrent()
                    2 -> viewLive()
                }
            }.show()
    }
    private fun auditCurrent() {
        if (!session) {status.text="เปิดเว็บไซต์ก่อน";return}
        val url=validWebUrl(address.text.toString()) ?: return
        AlertDialog.Builder(this).setTitle("🌙 ตรวจเว็บเบื้องหลัง")
            .setMessage("ตรวจโครงสร้างหน้า "+url+" บน Cloudflare โดยไม่ต้องเฝ้าหน้าจอ · จำกัดงานตรวจเบื้องต้น ไม่ใช่การทำงานอิสระของ GO ที่ยังไม่เชื่อม")
            .setPositiveButton("เริ่มตรวจ") { _,_->
                query("POST","/v1/audit",JSONObject().put("urls",JSONArray().put(url))){result->
                    result.onSuccess {
                        jobId=it.optString("jobId")
                        page.loadUrl("about:blank")
                        liveViewerActive = false
                        status.text="เริ่มงานตรวจเว็บบนคลาวด์ · ซ่อนภาพแล้ว แตะ ☷ ผลงานเพื่อติดตาม"
                    }
                        .onFailure {status.text="เริ่มไม่ได้ · "+readableError(it)}
                }
            }.setNegativeButton("ยกเลิก",null).show()
    }
    private fun closeSession() {
        if(!session){status.text="ไม่มีเซสชันที่เปิดอยู่";return}
        AlertDialog.Builder(this).setTitle("ปิด Browser Run?")
            .setMessage("ปิดเบราว์เซอร์บน Cloudflare เพื่อหยุดใช้เวลาเซสชัน หากงานกำลังทำอยู่ให้หยุดงานก่อน")
            .setPositiveButton("ปิดเซสชัน"){_,_->
                query("POST","/v1/close",JSONObject()){result->
                    result.onSuccess { renderSession(it);page.loadUrl("about:blank");liveViewerActive=false;status.text="ปิด Cloudflare Browser แล้ว" }
                        .onFailure { status.text="ปิดไม่ได้ · "+readableError(it) }
                }
            }.setNegativeButton("ยกเลิก",null).show()
    }
    private fun showJob() {
        query("GET","/v1/job",null){result->
            result.onSuccess {
                val job=it.optJSONObject("job")
                if(job==null){status.text="ยังไม่มีงานเบื้องหลัง";return@onSuccess}
                val body="ID: "+job.optString("id")+"\nสถานะ: "+job.optString("status")+"\n"+
                    "คืบหน้า: "+job.optInt("progress")+"\nผล: "+job.optJSONArray("results").toString().take(7000)
                AlertDialog.Builder(this).setTitle("ผลการทำงาน · "+job.optString("kind"))
                    .setMessage(body).setPositiveButton("ปิด",null)
                    .setNeutralButton("หยุดงาน") { _,_->
                        query("POST","/v1/stop",JSONObject()){r->r.onSuccess{renderSession(it)}}
                    }.show()
            }.onFailure {status.text="อ่านผลงานไม่ได้ · "+readableError(it)}
        }
    }
    private fun renderSession(data: JSONObject) {
        val url=data.optString("pageUrl").takeIf {it.startsWith("https://")}
        session=!data.isNull("sessionId") && data.optString("sessionId").isNotEmpty()
        goControls=data.optString("controller")=="GO"
        touchBlock.visibility=if(goControls)View.VISIBLE else View.GONE
        if (!session) {
            liveViewerActive = false
            addressRow.visibility = View.VISIBLE
            navigationRow.visibility = View.VISIBLE
        }
        controller.text="ผู้ควบคุม: "+(if(goControls)"GO" else "BIG")+" · "+
            data.optString("mode","IDLE")+" · "+data.optString("status","IDLE")+" · GO อ่าน: "+(if(data.optBoolean("goCanObserve"))"อนุญาต" else "ปิด")
        if(url!=null && !address.hasFocus())address.setText(url)
        val job=data.optJSONObject("job")
        if(job!=null) {
            val state=job.optString("status")
            val summary=state+":"+job.optInt("progress")+":"+job.optInt("total")
            if(summary!=latestJobStatus) {
                latestJobStatus=summary
                val step=job.optInt("progress")
                val total=job.optInt("total")
                status.text=if(state=="RUNNING")
                    "🌙 กำลังทำงานเบื้องหลัง · "+step+"/"+total+" ขั้น"
                else "☷ งาน "+state+" · "+step+"/"+total+" ขั้น · แตะผลงานเพื่อดูผล"
            }
        }
        val note=data.optJSONObject("note")
        if(note!=null && note.optString("at")!=latestNoteAt) {
            latestNoteAt=note.optString("at")
            status.text="🤖 GO: "+note.optString("message").take(240)
        }
    }
    private fun readableError(t: Throwable): String = StationDiagnostics.safeFailure(t)
    private fun query(method: String,path: String,body: JSONObject?,safetyRefresh:Boolean=false,onDone:(Result<JSONObject>)->Unit) {
        val service=serviceUrl()
        val token=credentials.load()
        if(service==null || token.isNullOrBlank()){status.text="ตั้งค่า Worker และ OWNER_TOKEN ก่อน";return}
        val safetyMutation=method=="POST" && (
            path=="/v1/stop" || path=="/v1/close" ||
            (path=="/v1/control" && body?.optString("controller")=="BIG") ||
            (path=="/v1/observe-access" && body?.optBoolean("allow",true)==false) ||
            (path=="/v1/site-permissions" && body?.optString("action")=="revoke"))
        val safety=safetyMutation||safetyRefresh
        if((busy||safetyPending>0)&&!safety){status.text="กำลังดำเนินการคำสั่งก่อนหน้า";return}
        if(!safety)busy=true else safetyPending++
        val epoch=requestEpoch.begin(safetyMutation)
        val requestId=java.util.UUID.randomUUID().toString()
        (if(safety)safetyIo else io).execute {
            // An older queued command must not be sent after takeover/revocation.
            if(!requestEpoch.current(epoch)) {
                main.post {if(!safety)busy=false else safetyPending--}
                return@execute
            }
            var response:StationResponse?=null
            val result=runCatching {
                val received=StationHttp.requestResponse(service+path,method,body,token,requestId)
                response=received
                BrowserResponse.parse(received,path)
            }
            val key=StationDiagnostics.diagnosticKey(path)
            val failure=result.exceptionOrNull()
            prefs.edit().putString("$key-status", if(result.isSuccess) "REQUEST_SUCCEEDED" else readableError(requireNotNull(failure)))
                .putString("$key-request-id",requestId)
                .putBoolean("$key-server-correlated",response?.correlationConfirmed ?: ((failure as? StationFailure)?.correlationConfirmed==true))
                .putString("$key-time",java.time.Instant.now().toString())
                .putString("$key-method",method).putString("$key-path",path)
                .putString("$key-http",(failure as? StationFailure)?.httpStatus?.toString() ?: response?.httpStatus?.toString() ?: "unknown").apply()
            main.post {
                if(!safety)busy=false else safetyPending--
                if(!destroyed&&requestEpoch.current(epoch)) {
                    onDone(result)
                    // Site revoke/stop responses differ from session responses. Read the real state
                    // on the safety lane even while an older ordinary request is still waiting.
                    if(safetyMutation&&result.isSuccess)
                        query("GET","/v1/session",null,safetyRefresh=true) {fresh->fresh.onSuccess {renderSession(it)}}
                }
            }
        }
    }
    override fun onResume(){
        super.onResume();foreground=true;main.removeCallbacks(poll);main.post(poll);page.onResume()
        // Owner returns to a neutral status screen. Live View restarts only on explicit "▶ ดูสด".
    }
    override fun onPause(){
        foreground=false;main.removeCallbacks(poll);page.onPause()
        // Disconnect the interactive viewer without stopping the remote browser or its queued work.
        page.loadUrl("about:blank")
        liveViewerActive = false
        addressRow.visibility = View.VISIBLE
        navigationRow.visibility = View.VISIBLE
        super.onPause()
    }
    override fun onDestroy(){destroyed=true;main.removeCallbacks(poll);io.shutdownNow();safetyIo.shutdownNow();page.stopLoading();page.destroy();super.onDestroy()}
}
