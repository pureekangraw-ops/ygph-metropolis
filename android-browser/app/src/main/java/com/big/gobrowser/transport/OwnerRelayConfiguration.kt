package com.big.gobrowser.transport

import com.big.gobrowser.control.Command
import org.json.JSONObject

/** Supplied by the owner and explicitly enabled by the device user; no default grants. */
data class OwnerRelayConfiguration(
    val endpoints: RelayEndpoints,
    val deviceId: String,
    val workId: String,
    val checkpointId: String,
    val actor: String,
    val authorities: Set<String>
) {
    fun allows(command: Command): Boolean = command.deviceId == deviceId &&
        command.workId == workId && command.checkpointId == checkpointId &&
        command.actor == actor && command.authority in authorities &&
        command.authority == "browser.${command.action.name.lowercase()}"

    companion object {
        fun parse(raw: String): OwnerRelayConfiguration {
            val json = JSONObject(raw)
            fun required(key: String) = json.getString(key).also { require(it.isNotBlank()) { "$key required" } }
            val grants = json.getJSONArray("authorities")
            val authorities = (0 until grants.length()).map { grants.getString(it) }.toSet()
            require(authorities.isNotEmpty() && authorities.all { it.startsWith("browser.") })
            return OwnerRelayConfiguration(
                RelayEndpoints(required("publishSnapshots"), required("pollCommands"), required("publishReceipts")),
                required("deviceId"), required("workId"), required("checkpointId"), required("actor"), authorities
            )
        }
    }
}
