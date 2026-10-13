package com.big.gobrowser.transport

import android.app.Activity
import android.app.AlertDialog
import android.text.InputType
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Owner-approved, queue-only bridge to the existing PANTHEON WorkHub API.
 *
 * The owner enters WORKHUB_TOKEN for this single action. It is never stored,
 * logged, placed in a URL, or sent to any endpoint other than WorkHub.
 * No remote browser/map execution is enabled here.
 */
object PantheonWorkHubHandoff {
    private const val INTENT_URL = "https://phatheon-workhub.pureekangraw.workers.dev/v1/intent"
    private const val MAX_EVIDENCE = 3600

    private data class Receipt(val taskId: String, val verified: Boolean)

    fun present(activity: Activity, category: String, evidence: String) {
        if (activity.isFinishing || activity.isDestroyed) return
        val shortened = evidence.take(MAX_EVIDENCE)
        val truncated = evidence.length > MAX_EVIDENCE
        val request = "OBSERVATORY " + category + " — owner-approved evidence\n" +
            shortened + if (truncated) "\n[TRUNCATED: WorkHub text-task limit]" else ""
        check(request.length <= 4096) { "WORKHUB_REQUEST_TOO_LONG" }

        val tokenInput = EditText(activity).apply {
            hint = "WORKHUB_TOKEN จาก Cloudflare"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine(true)
        }
        val preview = TextView(activity).apply {
            text = request.take(900) + if (request.length > 900) "\n… (มีข้อความต่อ)" else ""
            setPadding(20, 12, 20, 12)
        }
        val scroll = ScrollView(activity).apply {
            addView(preview)
        }
        val layout = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            val previewHeight = (155 * resources.displayMetrics.density).toInt()
            addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, previewHeight))
            addView(tokenInput, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }

        val dialog = AlertDialog.Builder(activity)
            .setTitle("ส่งเข้า PANTHEON")
            .setMessage("ตรวจข้อมูลก่อนส่ง: WorkHub จะสร้างงาน QUEUED เท่านั้น ไม่สั่งกดหรือรันงานเอง\n" +
                "ข้อมูลที่ส่งอาจมีข้อความส่วนตัวหรือพิกัด" +
                if (truncated) "\nข้อความยาวเกินขีดจำกัด จึงตัดท้ายก่อนส่ง" else "")
            .setView(layout)
            .setNegativeButton("ยกเลิก", null)
            .setPositiveButton("ส่งเข้าคิว", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val token = tokenInput.text.toString().trim()
                if (token.length < 32) {
                    tokenInput.error = "ต้องใช้ WORKHUB_TOKEN ของเจ้าของ (อย่างน้อย 32 ตัวอักษร)"
                    return@setOnClickListener
                }
                tokenInput.text.clear()
                dialog.dismiss()
                Thread {
                    val outcome = runCatching { createTaskAndVerify(token, request) }
                    activity.runOnUiThread {
                        if (activity.isFinishing || activity.isDestroyed) return@runOnUiThread
                        outcome.onSuccess { receipt ->
                            AlertDialog.Builder(activity)
                                .setTitle(if (receipt.verified) "PANTHEON รับงานแล้ว" else "PANTHEON รับคำขอแล้ว")
                                .setMessage("รหัสงาน: ${receipt.taskId}\n" +
                                    if (receipt.verified)
                                        "สถานะ QUEUED · ตรวจอ่านงานใน WorkHub กลับมาแล้ว\nยังไม่มีการรันงาน"
                                    else
                                        "WorkHub ตอบรับรหัสงาน แต่ตรวจอ่านกลับไม่ได้\nกรุณาตรวจใน WorkHub ก่อนส่งซ้ำ")
                                .setPositiveButton("ตกลง", null).show()
                        }.onFailure { error ->
                            val description = when (error.message) {
                                "HTTP_401" -> "รหัสเชื่อมต่อไม่ถูกต้อง หรือยังไม่ได้ตั้ง WORKHUB_TOKEN"
                                "HTTP_503" -> "WorkHub ยังไม่พร้อมใช้งาน"
                                "HTTP_413" -> "ข้อมูลยาวเกินกำหนด"
                                else -> "ส่งงานหรือรับผลยืนยันไม่สำเร็จ"
                            }
                            AlertDialog.Builder(activity).setTitle("ยังยืนยันการส่งไม่ได้")
                                .setMessage("$description\nถ้าเครือข่ายขัดข้อง โปรดตรวจ WorkHub ก่อนลองส่งซ้ำ")
                                .setPositiveButton("ตกลง", null).show()
                        }
                    }
                }.start()
            }
        }
        dialog.show()
    }

    private fun createTaskAndVerify(token: String, request: String): Receipt {
        val created = post(token, JSONObject().put("intent", "CREATE_TASK").put("request", request))
        val taskId = created.optString("task_id")
        require(Regex("^task_[a-f0-9]{32}$").matches(taskId)) { "INVALID_TASK_ID" }
        require(created.optString("status") == "QUEUED" && !created.optBoolean("executed", true)) {
            "NOT_QUEUED"
        }
        // A failed readback must not automatically retry CREATE_TASK: the write may already exist.
        val verified = runCatching {
            val readback = post(token, JSONObject().put("intent", "SHOW_TASK").put("task_id", taskId))
                .getJSONObject("task")
            readback.optString("task_id") == taskId &&
                readback.optString("request_text") == request &&
                readback.optString("status") == "QUEUED"
        }.getOrDefault(false)
        return Receipt(taskId, verified)
    }

    private fun post(token: String, body: JSONObject): JSONObject {
        val connection = URL(INTENT_URL).openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.useCaches = false
        connection.setRequestProperty("Authorization", "Bearer $token")
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        connection.setRequestProperty("Accept", "application/json")
        try {
            connection.outputStream.use { stream ->
                stream.write(body.toString().toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            if (status !in 200..299) throw IllegalStateException("HTTP_$status")
            val text = connection.inputStream.bufferedReader().use { it.readText() }
            require(text.length <= 16_384) { "WORKHUB_RESPONSE_TOO_LONG" }
            return JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }
}
