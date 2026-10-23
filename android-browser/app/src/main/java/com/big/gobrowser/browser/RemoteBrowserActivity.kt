package com.big.gobrowser.browser

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import com.big.gobrowser.BuildConfig
import com.big.gobrowser.outsideview.OutsideViewActivity
import com.big.gobrowser.transport.AndroidDeviceCredentialStore
import com.big.gobrowser.transport.StationHttp
import com.big.gobrowser.ui.ObservatoryTheme
import com.big.gobrowser.ui.PhoneLayout
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
    private val credentials by lazy { AndroidDeviceCredentialStore(this,
        "observatory-remote-owner-key", "observatory-remote-owner") }
    private val prefs by lazy { getSharedPreferences("observatory-remote-ui", MODE_PRIVATE) }
    private lateinit var address: EditText
    private lateinit var status: TextView
    private lateinit var controller: TextView
    private lateinit var page: WebView
    private lateinit var touchBlock: View
    private lateinit var toolbar: LinearLayout
    private var foreground = false
    private var destroyed = false
    private var busy = false
    private var session = false
    private var goControls = false
    private var jobId: String? = null
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
        root.addView(ObservatoryTheme.title(this, "YGG OBSERVATORY · Browser"))
        val switcher = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        switcher.addView(action("🌐 Browser") { openSettings() }, weighted())
        switcher.addView(action("🗺 GOVIEW") {
            startActivity(Intent(this, OutsideViewActivity::class.java))
        }, weighted())
        root.addView(switcher)
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
        root.addView(row)
        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        controls.addView(action("‹") { step("back") }, weighted())
        controls.addView(action("›") { step("forward") }, weighted())
        controls.addView(action("↻") { step("reload") }, weighted())
        controls.addView(action("⚙") { openSettings() }, weighted())
        root.addView(controls)
        status = ObservatoryTheme.status(this).apply { text = "ยังไม่ได้เชื่อม Cloudflare · แตะ ⚙ เพื่อตั้งค่า" }
        controller = ObservatoryTheme.status(this).apply { text = "ผู้ควบคุม: BIG · ยังไม่มีเซสชัน" }
        root.addView(status)
        root.addView(controller)
        val host = FrameLayout(this)
        page = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
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
        root.addView(host, LinearLayout.LayoutParams(-1, 0, 1f))
        toolbar = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val assist = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        assist.addView(action("👁 อ่านหน้า") { readPage() }, weighted())
        assist.addView(action("🖐 ให้ GO ทำ") { grantGo() }, weighted())
        toolbar.addView(assist)
        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        actions.addView(action("✋ ฉันควบคุมเอง") { takeOver() }, weighted())
        actions.addView(action("🌙 เบื้องหลัง") { auditCurrent() }, weighted())
        toolbar.addView(actions)
        val evidence = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        evidence.addView(action("▶ ดูสด") { viewLive() }, weighted())
        evidence.addView(action("☷ ผลงาน") { showJob() }, weighted())
        toolbar.addView(evidence)
        root.addView(toolbar)
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
    private fun weighted() = LinearLayout.LayoutParams(0, dp(48), 1f)
    private fun action(label: String, click: () -> Unit) = ObservatoryTheme.button(this,label,click).apply {
        textSize = 12f
        setPadding(dp(4),0,dp(4),0)
    }
    private fun configured() = serviceUrl() != null && !credentials.load().isNullOrBlank()
    private fun serviceUrl(): String? = validServiceUrl(prefs.getString("service", null))
    private fun validServiceUrl(input: String?): String? = runCatching {
        val uri = URI(input?.trim() ?: return null)
        val host = uri.host?.lowercase() ?: return null
        if (uri.scheme != "https" || uri.userInfo != null || uri.port != -1 || uri.rawQuery != null ||
            uri.fragment != null || uri.path.orEmpty().trimEnd('/').isNotEmpty() ||
            !(host.endsWith(".workers.dev") || host == "yggmetro.com" || host.endsWith(".yggmetro.com"))) return null
        "https://" + host
    }.getOrNull()
    private fun allowedViewerUrl(url: String): Boolean = runCatching {
        val u = URI(url)
        u.scheme == "https" && u.host == "live.browser.run"
    }.getOrDefault(false)
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
        AlertDialog.Builder(this).setTitle("Cloudflare Shared Browser").setView(column)
            .setPositiveButton("เชื่อมต่อ") { _, _ ->
                val url = validServiceUrl(endpoint.text.toString())
                if (url == null) { status.text = "ที่อยู่ Worker ต้องเป็น HTTPS และโดเมนที่อนุญาต";return@setPositiveButton }
                val token = secret.text.toString()
                if (token.isNotEmpty()) {
                    if (token.length < 32 || token.length > 256) { status.text = "OWNER_TOKEN ไม่ถูกต้อง";return@setPositiveButton }
                    credentials.save(token)
                }
                if (!prefs.edit().putString("service",url).commit()) {status.text = "บันทึกที่อยู่ Worker ไม่สำเร็จ";return@setPositiveButton}
                if (!configured()) {status.text = "ต้องมี OWNER_TOKEN และ Worker ก่อนใช้งาน";return@setPositiveButton}
                query("GET", "/v1/session", null) { result ->
                    result.onSuccess { renderSession(it); status.text = "เชื่อมต่อ Worker แล้ว · กด ไป เพื่อเปิดเว็บ" }
                        .onFailure { status.text = "ยังเชื่อมไม่ได้ · " + readableError(it) }
                }
            }.setNeutralButton("ลบคีย์") { _, _ ->
                credentials.revoke()
                page.loadUrl("about:blank")
                session=false;goControls=false;touchBlock.visibility=View.GONE
                status.text = "ลบคีย์เจ้าของออกจากเครื่องแล้ว"
            }.setNegativeButton("ยกเลิก",null).show()
    }
    private fun openAddress() {
        val url = validWebUrl(address.text.toString())
        if (url == null) {status.text = "ต้องเป็นเว็บไซต์ HTTPS สาธารณะ";return}
        prefs.edit().putString("last-url",url).apply()
        val body=JSONObject().put("url",url)
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
                    status.text = if(goControls) "GO ได้สิทธิ์ควบคุม · บิ๊กดูสดได้" else "LIVE · BIG กำลังดูหน้าเว็บระยะไกล"
                } else status.text="Live View URL ไม่ถูกต้อง"
            }.onFailure {status.text="เปิด Live View ไม่ได้ · " + readableError(it)}
        }
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
                query("POST", "/v1/control", JSONObject().put("controller","GO")){result->
                    result.onSuccess { renderSession(it) }
                        .onFailure {status.text="ยังให้ GO ควบคุมไม่ได้ · "+readableError(it)}
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
    private fun auditCurrent() {
        if (!session) {status.text="เปิดเว็บไซต์ก่อน";return}
        val url=validWebUrl(address.text.toString()) ?: return
        AlertDialog.Builder(this).setTitle("🌙 ตรวจเว็บเบื้องหลัง")
            .setMessage("ตรวจโครงสร้างหน้า "+url+" บน Cloudflare โดยไม่ต้องเฝ้าหน้าจอ · จำกัดงานตรวจเบื้องต้น ไม่ใช่การทำงานอิสระของ GO ที่ยังไม่เชื่อม")
            .setPositiveButton("เริ่มตรวจ") { _,_->
                query("POST","/v1/audit",JSONObject().put("urls",JSONArray().put(url))){result->
                    result.onSuccess {jobId=it.optString("jobId");status.text="เริ่มงานบนคลาวด์แล้ว · ดูผลงานเพื่อติดตาม"}
                        .onFailure {status.text="เริ่มไม่ได้ · "+readableError(it)}
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
        controller.text="ผู้ควบคุม: "+(if(goControls)"GO" else "BIG")+" · "+
            data.optString("mode","IDLE")+" · "+data.optString("status","IDLE")
        if(url!=null && !address.hasFocus())address.setText(url)
    }
    private fun readableError(t: Throwable): String = (t.message ?: "ไม่ทราบสาเหตุ").take(120)
    private fun query(method: String,path: String,body: JSONObject?,onDone:(Result<JSONObject>)->Unit) {
        val service=serviceUrl()
        val token=credentials.load()
        if(service==null || token.isNullOrBlank()){status.text="ตั้งค่า Worker และ OWNER_TOKEN ก่อน";return}
        if(busy){status.text="กำลังดำเนินการคำสั่งก่อนหน้า";return}
        busy=true
        io.execute {
            val result=runCatching { JSONObject(StationHttp.request(service+path,method,body,token)).also {
                if (it.has("error")) throw IllegalStateException(it.optString("error"))
            }}
            main.post {busy=false;if(!destroyed)onDone(result)}
        }
    }
    override fun onResume(){super.onResume();foreground=true;main.removeCallbacks(poll);main.post(poll);page.onResume()}
    override fun onPause(){foreground=false;main.removeCallbacks(poll);page.onPause();super.onPause()}
    override fun onDestroy(){destroyed=true;main.removeCallbacks(poll);io.shutdownNow();page.stopLoading();page.destroy();super.onDestroy()}
}
