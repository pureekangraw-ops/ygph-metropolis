package com.big.gobrowser.transport

import org.json.JSONObject

data class HubWork(
    val workId: String,
    val ownerSystem: String,
    val authorizedActions: Set<String>,
    val checkpointId: String?,
    val state: String?,
    val updatedAt: String?
)

data class HubArrival(
    val actor: String,
    val nickname: String,
    val sourceSha: String,
    val observedAt: String,
    val observatoryWorks: List<HubWork>
)

/** Parses only Work records whose current Hub readback grants OBSERVATORY read access. */
object HubArrivalParser {
    fun parse(identity: JSONObject, arrival: JSONObject): HubArrival {
        val profile = identity.optJSONObject("structuredContent")
            ?: identity.optJSONObject("content")
            ?: JSONObject()
        val root = arrival.optJSONObject("structuredContent") ?: arrival
        val current = root.optJSONObject("current") ?: JSONObject()
        val works = current.optJSONArray("works")
        val observatoryWorks = (0 until (works?.length() ?: 0)).mapNotNull { index ->
            val work = works?.optJSONObject(index) ?: return@mapNotNull null
            val actions = work.optJSONArray("authorizedActions")
            val authorized = (0 until (actions?.length() ?: 0))
                .mapNotNull { actionIndex ->
                    actions?.optString(actionIndex)?.takeUnless { it == "null" }?.takeIf(String::isNotBlank)
                }
                .toSet()
            if (work.optBoolean("present")
                && work.optString("ownerSystem") == "OBSERVATORY"
                && "read" in authorized) {
                work.optString("workId")
                    .takeUnless { it == "null" }
                    .takeIf(String::isNotBlank)
                    ?.let {
                        HubWork(
                            workId = it,
                            ownerSystem = "OBSERVATORY",
                            authorizedActions = authorized,
                            checkpointId = optionalText(work, "checkpointId"),
                            state = optionalText(work, "state"),
                            updatedAt = optionalText(work, "updatedAt")
                        )
                    }
            } else null
        }

        return HubArrival(
            actor = profile.optString("name", "GO"),
            nickname = profile.optString("nickname", "GO — Metropolis"),
            sourceSha = current.optString("sourceSha").takeUnless { it == "null" }.orEmpty(),
            observedAt = current.optString("observedAt").takeUnless { it == "null" }.orEmpty(),
            observatoryWorks = observatoryWorks
        )
    }

    private fun optionalText(json: JSONObject, key: String): String? =
        json.optString(key).takeUnless { it.isBlank() || it == "null" }
}