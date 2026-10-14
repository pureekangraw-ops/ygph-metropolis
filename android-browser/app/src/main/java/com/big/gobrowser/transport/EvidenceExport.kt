package com.big.gobrowser.transport

import org.json.JSONArray
import org.json.JSONObject

/** Copies all exported string representations, including labels and signature copies. */
object EvidenceExport {
    fun redactText(value: String): String = EvidenceRedactor.redact(value)

    fun redactJson(input: JSONObject, credential: String? = null): JSONObject {
        fun clean(value: Any?): Any = when (value) {
            is JSONObject -> JSONObject().also { copy ->
                value.keys().forEach { key -> copy.put(key, clean(value.opt(key))) }
            }
            is JSONArray -> JSONArray().also { copy ->
                for (index in 0 until value.length()) copy.put(clean(value.opt(index)))
            }
            is String -> EvidenceRedactor.redact(
                if (credential.isNullOrEmpty()) value else value.replace(credential, "[REDACTED]")
            )
            else -> value ?: JSONObject.NULL
        }
        return clean(input) as JSONObject
    }
}
