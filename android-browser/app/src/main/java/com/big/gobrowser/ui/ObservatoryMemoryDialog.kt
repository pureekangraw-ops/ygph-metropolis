package com.big.gobrowser.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.widget.EditText
import android.widget.Toast
import com.big.gobrowser.transport.MetropolisMcpClient
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

/** Owner-selected permanent ranges, retained separately from the live 15-second history. */
object ObservatoryMemoryDialog {
    fun preserve(activity: Activity, client: MetropolisMcpClient, view: String) {
        // Capture the range immediately; naming it must not race its expiration.
        client.memory(JSONObject().put("action", "preserve").put("view", view)) { result ->
            if (activity.isFinishing || activity.isDestroyed) return@memory
            result.onSuccess { saved ->
                val count = saved.optJSONArray("items")?.length() ?: 0
                Toast.makeText(activity, "เก็บถาวรแล้ว $count รอบ · เปิดดูได้ในที่เก็บไว้", Toast.LENGTH_LONG).show()
                show(activity, saved)
            }.onFailure { Toast.makeText(activity, "ยังเก็บไม่ได้ · ต้องมีข้อมูลส่งถึงฮอลใน 15 วินาทีล่าสุด", Toast.LENGTH_LONG).show() }
        }
    }

    fun saved(activity: Activity, client: MetropolisMcpClient) {
        client.memory(JSONObject().put("action", "list")) { result ->
            if (activity.isFinishing || activity.isDestroyed) return@memory
            result.onSuccess { response ->
                val items = response.optJSONArray("items")
                if (items == null || items.length() == 0) {
                    Toast.makeText(activity, "ยังไม่มีช่วงที่เก็บไว้", Toast.LENGTH_SHORT).show()
                    return@onSuccess
                }
                val records = (0 until items.length()).map { items.getJSONObject(it) }
                val labels = records.map { item -> "${DateFormat.getDateTimeInstance().format(Date(item.optLong("savedAt")))} · ${item.optInt("count")} รอบ" }
                AlertDialog.Builder(activity).setTitle("ช่วงที่เก็บถาวร").setItems(labels.toTypedArray()) { _, index ->
                    client.memory(JSONObject().put("action", "read").put("savedId", records[index].getString("id"))) { read ->
                        if (!activity.isFinishing && !activity.isDestroyed) read.onSuccess { show(activity, it) }.onFailure {
                            Toast.makeText(activity, "อ่านช่วงที่เก็บไว้ไม่ได้", Toast.LENGTH_SHORT).show()
                        }
                    }
                }.setNegativeButton("ปิด", null).show()
            }.onFailure { Toast.makeText(activity, "โหลดที่เก็บไว้ไม่ได้", Toast.LENGTH_SHORT).show() }
        }
    }

    private fun show(activity: Activity, saved: JSONObject) {
        val items = saved.optJSONArray("items")
        val summary = buildString {
            append("อ้างอิง: ${saved.optString("evidenceRef")}\n")
            for (index in 0 until (items?.length() ?: 0)) {
                val record = items!!.getJSONObject(index)
                val snapshot = record.getJSONObject("snapshot")
                append("\nรอบ ${index + 1} · ${DateFormat.getTimeInstance().format(Date(snapshot.optLong("capturedAtEpochMs")))}\n")
                append(snapshot.optString("url")); append('\n')
                append(if (record.optString("view") == "browser") snapshot.optString("text").take(4000) else snapshot.optJSONObject("state")?.toString(2)?.take(4000))
                append('\n')
            }
        }
        AlertDialog.Builder(activity).setTitle("ข้อมูลที่เก็บถาวร").setMessage(summary)
            .setPositiveButton("คัดลอกใช้ต่อ") { _, _ ->
                activity.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Observatory", saved.toString(2)))
                Toast.makeText(activity, "คัดลอกข้อมูลพร้อมแหล่งอ้างอิงแล้ว", Toast.LENGTH_SHORT).show()
            }.setNegativeButton("ปิด", null).show()
    }
}
