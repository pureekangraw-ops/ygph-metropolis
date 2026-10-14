package com.big.gobrowser.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.widget.Toast
import com.big.gobrowser.transport.AndroidDeviceCredentialStore
import org.json.JSONArray
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

/**
 * Explicitly saved local Observatory evidence stays separate from 30s cloud
 * snapshots. Keystore AES-GCM protects it; no Metro/owner credentials are used.
 * Historical Metro archives remain on their former server and are NOT erased.
 */
object ObservatoryMemoryDialog {
    private fun store(activity: Activity) = AndroidDeviceCredentialStore(
        activity, "pantheon-observatory-saved-key", "pantheon-observatory-saved-data"
    )

    fun preserve(activity: Activity, view: String, evidence: String?) {
        if (view !in setOf("browser", "map") || evidence.isNullOrBlank()) {
            Toast.makeText(activity, "ยังไม่มีข้อมูลสดให้เก็บ", Toast.LENGTH_SHORT).show()
            return
        }
        AlertDialog.Builder(activity)
            .setTitle("เก็บช่วงนี้บนเครื่อง")
            .setMessage("บันทึกหลักฐานที่เลือกอย่างเข้ารหัสไว้บนมือถือ จะแยกจากข้อมูลชั่วคราว 30 วินาที")
            .setNegativeButton("ยกเลิก", null)
            .setPositiveButton("เก็บถาวร") { _, _ ->
                runCatching {
                    val credential = store(activity)
                    val existing = JSONArray(credential.load() ?: "[]")
                    val records = SavedEvidenceArchive.prepend(existing, view, evidence, System.currentTimeMillis())
                    credential.save(records.toString())
                }.onSuccess {
                    Toast.makeText(activity, "เก็บบนเครื่องแล้ว (เข้ารหัส)", Toast.LENGTH_SHORT).show()
                }.onFailure {
                    Toast.makeText(activity, "เก็บหลักฐานไม่สำเร็จ", Toast.LENGTH_SHORT).show()
                }
            }.show()
    }

    fun saved(activity: Activity) {
        val records = runCatching { JSONArray(store(activity).load() ?: "[]") }.getOrNull()
        if (records == null) {
            Toast.makeText(activity, "อ่านข้อมูลที่เก็บไว้ไม่ได้", Toast.LENGTH_SHORT).show()
            return
        }
        if (records.length() == 0) {
            Toast.makeText(activity, "ยังไม่มีข้อมูลที่เก็บบนเครื่อง (ข้อมูลเก่าบน Metro ยังไม่ได้ย้าย)", Toast.LENGTH_LONG).show()
            return
        }
        val labels = (0 until records.length()).map { index ->
            val item = records.getJSONObject(index)
            "${if (item.optString("view") == "map") "แผนที่" else "เว็บ"} · " +
                DateFormat.getDateTimeInstance().format(Date(item.optLong("savedAt")))
        }.toTypedArray()
        AlertDialog.Builder(activity).setTitle("ข้อมูลที่เก็บบนเครื่อง")
            .setItems(labels) { _, index ->
                val item = records.getJSONObject(index)
                AlertDialog.Builder(activity).setTitle(labels[index])
                    .setMessage(com.big.gobrowser.transport.EvidenceExport.redactText(item.optString("text")))
                    .setPositiveButton("คัดลอก") { _, _ ->
                        activity.getSystemService(ClipboardManager::class.java)
                            .setPrimaryClip(ClipData.newPlainText("Observatory saved evidence", com.big.gobrowser.transport.EvidenceExport.redactJson(item).toString()))
                    }.setNegativeButton("ปิด", null).show()
            }.setNegativeButton("ปิด", null).show()
    }
}

