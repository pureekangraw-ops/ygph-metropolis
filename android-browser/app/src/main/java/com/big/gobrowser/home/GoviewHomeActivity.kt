package com.big.gobrowser.home

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.big.gobrowser.browser.RemoteBrowserActivity
import com.big.gobrowser.outsideview.OutsideViewActivity
import com.big.gobrowser.transport.HubHealthClient
import com.big.gobrowser.transport.HubHealthFailure
import com.big.gobrowser.ui.ObservatoryTheme
import com.big.gobrowser.ui.PhoneLayout
import java.util.concurrent.Executors

/** GOVIEW's home/status entrypoint. Hub login and approvals stay in Hub's first-party browser UI. */
class GoviewHomeActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var destroyed = false
    private var checking = false
    private lateinit var deviceNetwork: TextView
    private lateinit var hubStatus: TextView
    private lateinit var refreshButton: android.widget.Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(20))
        }
        content.addView(ObservatoryTheme.title(this, "YGG GOVIEW · Home"))

        val statusCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = ObservatoryTheme.surface(this@GoviewHomeActivity)
        }
        statusCard.addView(ObservatoryTheme.status(this).apply {
            text = "สถานะเครือข่าย"
            setTextColor(ObservatoryTheme.text)
            textSize = 16f
        })
        deviceNetwork = ObservatoryTheme.status(this)
        statusCard.addView(deviceNetwork)
        hubStatus = ObservatoryTheme.status(this).apply {
            text = "Hub: ยังไม่ได้ตรวจ · สถานะเจ้าของและรายการอนุมัติยังไม่ทราบ"
            textSize = 13f
        }
        statusCard.addView(hubStatus)
        content.addView(statusCard)

        refreshButton = action("ตรวจ Hub แบบอ่านอย่างเดียว") { refreshHubHealth() }
        content.addView(refreshButton)
        content.addView(action("Hub status และ Owner approvals · เปิดในเบราว์เซอร์") {
            openHubOwnerPage()
        })
        content.addView(ObservatoryTheme.status(this).apply {
            text = "การเข้าสู่ระบบและการอนุมัติใช้หน้า Hub ต้นทางในเบราว์เซอร์ " +
                "แอปนี้ไม่ส่ง OWNER_TOKEN/Access credentials และไม่อนุมัติผ่าน API โดยตรง"
            textSize = 12f
        })

        content.addView(ObservatoryTheme.title(this, "พื้นที่ทำงาน"))
        content.addView(action("🗺 Map · GOVIEW") {
            startActivity(Intent(this, OutsideViewActivity::class.java))
        })
        content.addView(action("👁 Observe / Browser") {
            startActivity(Intent(this, RemoteBrowserActivity::class.java))
        })
        content.addView(ObservatoryTheme.status(this).apply {
            text = "Map, saved data, offline behavior, and the existing Observe/Browser surface " +
                "remain in their original activities."
            textSize = 12f
        })

        val scroll = ScrollView(this).apply { addView(content) }
        ObservatoryTheme.apply(this, content)
        PhoneLayout.fitSystemBars(scroll)
        setContentView(scroll)
        refreshNetworkState()
        refreshHubHealth()
    }

    private fun action(label: String, click: () -> Unit) =
        ObservatoryTheme.button(this, label, click).apply {
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply {
                setMargins(dp(2), dp(3), dp(2), dp(3))
            }
        }

    private fun dp(value: Int) = ObservatoryTheme.dp(this, value)

    private fun refreshNetworkState() {
        deviceNetwork.text = if (ObservatoryTheme.online(this)) {
            "Internet ของอุปกรณ์: Android รายงานว่า validated"
        } else {
            "Internet ของอุปกรณ์: ยังไม่มี network ที่ Android ยืนยัน"
        }
    }

    private fun refreshHubHealth() {
        if (checking || destroyed) return
        checking = true
        refreshButton.isEnabled = false
        hubStatus.text = "กำลังตรวจ public Hub /health · ไม่ได้ตรวจ owner session"
        io.execute {
            val result = runCatching { HubHealthClient.check() }
            main.post {
                checking = false
                if (destroyed) return@post
                refreshButton.isEnabled = true
                hubStatus.text = result.fold(
                    onSuccess = { it.displayText() },
                    onFailure = {
                        val code = (it as? HubHealthFailure)?.safeCode ?: "HUB_HEALTH_UNAVAILABLE"
                        "Hub public /health ยังไม่ตอบสำเร็จ ($code)\n" +
                            "สถานะ owner authentication และ approvals ยังไม่ทราบ."
                    }
                )
            }
        }
    }

    private fun openHubOwnerPage() {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(HubHealthClient.HUB_UI_URL))
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            hubStatus.text = "ไม่พบเบราว์เซอร์สำหรับเปิด Hub owner page"
        }
    }

    override fun onResume() {
        super.onResume()
        refreshNetworkState()
    }

    override fun onDestroy() {
        destroyed = true
        io.shutdownNow()
        super.onDestroy()
    }
}