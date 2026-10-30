package com.big.gobrowser.browser

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.Toast
import com.big.gobrowser.ui.ObservatoryTheme
import com.big.gobrowser.ui.PhoneLayout
import java.io.IOException

/**
 * First-party Android shell for AI Universal Workplace.
 *
 * The page is constrained to its HTTPS origin. Its task history remains in this
 * WebView's localStorage. JSON handoffs cross the app boundary only through the
 * Android document picker; no task data is uploaded by this activity.
 */
class StandaloneWorkplaceActivity : Activity() {
    companion object {
        private const val PICK_JSON_REQUEST = 7401
        private const val SAVE_JSON_REQUEST = 7402
    }

    private val main = Handler(Looper.getMainLooper())
    private val saveLock = Any()
    private lateinit var page: WebView
    private lateinit var status: android.widget.TextView
    private var fileChooserCallback: android.webkit.ValueCallback<Array<Uri>>? = null
    private data class PendingFile(val filename: String, val mimeType: String, val bytes: ByteArray)
    private var pendingFile: PendingFile? = null
    @Volatile private var trustedPageActive = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            isBaselineAligned = false
        }
        header.addView(ObservatoryTheme.button(this, "‹ กลับ") { finish() },
            LinearLayout.LayoutParams(dp(88), dp(48)))
        header.addView(ObservatoryTheme.title(this, "AI Universal Workplace"),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        status = ObservatoryTheme.status(this).apply {
            text = "ข้อมูลเก็บในพื้นที่ของแอปนี้ · เลือกไฟล์เองเมื่อต้องการรับส่ง handoff"
        }

        page = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = true // Only a document the owner selects is exposed to file input.
            settings.setSupportMultipleWindows(false)
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.safeBrowsingEnabled = true
            addJavascriptInterface(WorkplaceFileBridge(), "StandaloneBridge")
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView,
                    callback: android.webkit.ValueCallback<Array<Uri>>,
                    params: FileChooserParams
                ): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = callback
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "application/json"
                        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/json"))
                    }
                    return try {
                        startActivityForResult(intent, PICK_JSON_REQUEST)
                        true
                    } catch (_: Exception) {
                        fileChooserCallback = null
                        callback.onReceiveValue(null)
                        status.text = "เปิดตัวเลือกไฟล์ JSON ไม่ได้"
                        true
                    }
                }

                override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
                    request.deny()
                }

                override fun onCreateWindow(
                    view: WebView,
                    isDialog: Boolean,
                    isUserGesture: Boolean,
                    resultMsg: android.os.Message
                ): Boolean = false
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    if (url == "about:blank") return false
                    if (!StandaloneWorkplacePolicy.allowsUrl(url)) {
                        trustedPageActive = false
                        status.text = "บล็อกการออกจากโดเมน Standalone ที่กำหนด"
                        return true
                    }
                    return false
                }

                override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                    trustedPageActive = url != "about:blank" && StandaloneWorkplacePolicy.allowsUrl(url)
                    if (url != "about:blank" && !trustedPageActive) {
                        view.stopLoading()
                        view.loadUrl("about:blank")
                        status.text = "ปลายทางไม่ใช่ Standalone ที่อนุญาต"
                    }
                }

                override fun onPageFinished(view: WebView, url: String) {
                    trustedPageActive = url != "about:blank" && StandaloneWorkplacePolicy.allowsUrl(url)
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError
                ) {
                    if (request.isForMainFrame) {
                        trustedPageActive = false
                        status.text = "เปิด Standalone ไม่สำเร็จ · ตรวจอินเทอร์เน็ตแล้วลองใหม่"
                    }
                }

                override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
                    handler.cancel()
                    trustedPageActive = false
                    status.text = "ใบรับรอง HTTPS ไม่ผ่าน · ยกเลิกการเชื่อมต่อ"
                }
            }
            setDownloadListener { _, _, _, _, _ ->
                status.text = "ใช้ปุ่มส่งออกใน Standalone เพื่อบันทึกไฟล์ JSON ผ่านตัวเลือกของ Android"
            }
        }

        root.addView(header)
        root.addView(status)
        root.addView(page, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        ObservatoryTheme.apply(this, root)
        PhoneLayout.fitSystemBars(root)
        setContentView(root)
        page.loadUrl(StandaloneWorkplacePolicy.URL)
    }

    private fun dp(value: Int) = ObservatoryTheme.dp(this, value)

    private inner class WorkplaceFileBridge {
        @JavascriptInterface
        fun saveJsonFile(filename: String, content: String): Boolean {
            if (!trustedPageActive) return false
            if (!StandaloneWorkplacePolicy.isJsonObjectWithinLimit(content)) return false
            return requestSave(filename, "application/json", content.toByteArray(Charsets.UTF_8))
        }

        @JavascriptInterface
        fun saveTextFile(filename: String, mimeType: String, content: String): Boolean {
            if (!trustedPageActive) return false
            val accepted = when (mimeType.substringBefore(';').lowercase()) {
                "application/json" -> StandaloneWorkplacePolicy.isJsonObjectWithinLimit(content)
                "image/svg+xml" -> StandaloneWorkplacePolicy.isSafeSvgWithinLimit(content)
                else -> false
            }
            if (!accepted) {
                main.post { status.text = "ไม่บันทึก: ชนิดไฟล์ไม่รองรับหรือเนื้อหาไม่ผ่านการตรวจ" }
                return false
            }
            return requestSave(filename, mimeType.substringBefore(';').lowercase(), content.toByteArray(Charsets.UTF_8))
        }

        @JavascriptInterface
        fun saveBase64File(filename: String, mimeType: String, content: String): Boolean {
            if (!trustedPageActive || mimeType.substringBefore(';').lowercase() != "image/png") {
                return false
            }
            val bytes = StandaloneWorkplacePolicy.decodePngWithinLimit(content)
            if (bytes == null) {
                main.post { status.text = "ไม่บันทึก: PNG ไม่ถูกต้องหรือใหญ่เกิน 4 MiB" }
                return false
            }
            return requestSave(filename, "image/png", bytes)
        }
    }

    private fun requestSave(filename: String, mimeType: String, bytes: ByteArray): Boolean {
        if (!trustedPageActive) return false
        val file = PendingFile(StandaloneWorkplacePolicy.safeFilename(filename, mimeType), mimeType, bytes)
        val accepted = synchronized(saveLock) {
            if (pendingFile != null) false else {
                pendingFile = file
                true
            }
        }
        if (!accepted) {
            main.post { status.text = "กำลังบันทึกไฟล์ก่อนหน้าอยู่" }
            return false
        }
        main.post {
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = file.mimeType
                putExtra(Intent.EXTRA_TITLE, file.filename)
            }
            try {
                startActivityForResult(intent, SAVE_JSON_REQUEST)
            } catch (_: Exception) {
                synchronized(saveLock) { pendingFile = null }
                status.text = "เปิดตัวเลือกบันทึกไฟล์ไม่ได้"
            }
        }
        return true
    }

    @Deprecated("Uses the platform document picker for minSdk-compatible content URI access.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            PICK_JSON_REQUEST -> {
                val callback = fileChooserCallback
                fileChooserCallback = null
                val uri = if (resultCode == RESULT_OK) data?.data else null
                callback?.onReceiveValue(uri?.let { arrayOf(it) })
                if (uri != null) status.text = "เลือกไฟล์แล้ว · ตรวจในหน้า Standalone ก่อนยืนยัน"
            }
            SAVE_JSON_REQUEST -> {
                val file = synchronized(saveLock) {
                    pendingFile.also { pendingFile = null }
                }
                val uri = if (resultCode == RESULT_OK) data?.data else null
                if (uri == null || file == null) {
                    status.text = "ยกเลิกการบันทึกไฟล์ · ไม่มีการส่งออก"
                    return
                }
                try {
                    contentResolver.openOutputStream(uri, "w")?.use { it.write(file.bytes) }
                        ?: throw IOException("ไม่สามารถเปิดตำแหน่งจัดเก็บได้")
                    status.text = "บันทึกไฟล์ ${file.filename} แล้ว · ส่งต่อได้เมื่อพร้อม"
                } catch (_: Exception) {
                    status.text = "บันทึกไฟล์ไม่สำเร็จ · ข้อมูลยังอยู่ใน Standalone"
                    Toast.makeText(this, "บันทึกไฟล์ไม่สำเร็จ", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    override fun onBackPressed() {
        if (::page.isInitialized && page.canGoBack()) page.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        trustedPageActive = false
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        synchronized(saveLock) { pendingFile = null }
        if (::page.isInitialized) {
            page.stopLoading()
            page.removeJavascriptInterface("StandaloneBridge")
            page.destroy()
        }
        super.onDestroy()
    }
}