package com.big.gobrowser.browser

import android.app.Activity
import android.os.Bundle
import android.os.PowerManager
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
import com.big.gobrowser.observer.ObserverSession
import com.big.gobrowser.observer.WebViewObserver

class BrowserActivity : Activity() {
    private lateinit var tabStore: TabStore
    private lateinit var address: EditText
    private lateinit var lifecycle: BrowserLifecycle
    private lateinit var observerSession: ObserverSession
    private lateinit var shareButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycle = BrowserLifecycle(this, getSystemService(PowerManager::class.java))
        observerSession = ObserverSession("local-device", "0.1.0")

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
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
        val back = button("‹") { tabStore.active()?.webView?.goBack() }
        val forward = button("›") { tabStore.active()?.webView?.goForward() }
        val reload = button("↻") { tabStore.active()?.webView?.reload() }
        val newTab = button("+") { tabStore.open(); configureActiveWebView() }
        shareButton = button("Share") { toggleShare() }
        val capture = button("Eye") { captureActive() }
        toolbar.addView(back)
        toolbar.addView(forward)
        toolbar.addView(address)
        toolbar.addView(reload)
        toolbar.addView(newTab)
        toolbar.addView(shareButton)
        toolbar.addView(capture)

        val browserContainer = FrameLayout(this)
        root.addView(toolbar, LinearLayout.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        root.addView(browserContainer, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        tabStore = TabStore(this, browserContainer) { url -> address.setText(url) }
        tabStore.restore()
        configureActiveWebView()
    }

    private fun configureActiveWebView() {
        tabStore.active()?.webView?.webViewClient = client()
    }

    private fun client() = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            !BrowserSettings.isAllowedUrl(request.url.toString())

        override fun onPageFinished(view: WebView, url: String) {
            address.setText(url)
        }
    }


    private fun toggleShare() {
        val tab = tabStore.active() ?: return
        if (observerSession.isSharing(tab.id)) {
            observerSession.stop(tab.id)
            shareButton.text = "Share"
            Toast.makeText(this, "หยุดแชร์แท็บแล้ว", Toast.LENGTH_SHORT).show()
        } else {
            observerSession.start(tab.id)
            shareButton.text = "Stop"
            captureActive()
        }
    }

    private fun captureActive() {
        val tab = tabStore.active() ?: return
        if (!observerSession.isSharing(tab.id)) {
            Toast.makeText(this, "กด Share ก่อนอ่านหน้าเว็บ", Toast.LENGTH_SHORT).show()
            return
        }
        WebViewObserver(this, tab.webView).capture { capture ->
            if (capture == null) {
                Toast.makeText(this, "อ่านหน้าเว็บไม่ได้", Toast.LENGTH_SHORT).show()
                return@capture
            }
            val snapshot = observerSession.capture(tab.id, capture.url, capture.title, capture.text, capture.targets)
            val status = if (snapshot == null) "ไม่มีเนื้อหาใหม่" else "จับภาพข้อความแล้ว #${snapshot.sequence}"
            Toast.makeText(this, status, Toast.LENGTH_SHORT).show()
        }
    }

    private fun navigateFromAddress() {
        val raw = address.text.toString().trim()
        if (!BrowserSettings.isAllowedUrl(raw)) {
            Toast.makeText(this, "เปิดได้เฉพาะ HTTPS", Toast.LENGTH_SHORT).show()
            return
        }
        if (!lifecycle.isInteractive()) return
        tabStore.active()?.webView?.loadUrl(raw)
    }

    private fun button(label: String, action: () -> Unit) = Button(this).apply {
        text = label
        setOnClickListener { action() }
        minWidth = 0
    }

    override fun onBackPressed() {
        val active = tabStore.active()?.webView
        if (active?.canGoBack() == true) active.goBack() else super.onBackPressed()
    }
}
