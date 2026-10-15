package com.big.gobrowser.ui

import com.big.gobrowser.transport.EvidenceExport
import org.json.JSONArray
import org.json.JSONObject

/** Append without eviction. A failed save leaves the previously encrypted archive intact. */
object SavedEvidenceArchive {
    fun prepend(existing: JSONArray, view: String, evidence: String, savedAt: Long): JSONArray {
        val records = JSONArray().put(JSONObject().put("view", view).put("savedAt", savedAt)
            .put("text", EvidenceExport.redactText(evidence)))
        for (index in 0 until existing.length()) records.put(existing.getJSONObject(index))
        return records
    }
}
