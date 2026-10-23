package com.big.gobrowser.outsideview

import org.json.JSONObject

/** Validates data supplied by the existing read rail. Does not call a service or grant write authority. */
object GoviewObservationRead {
    data class Observation(val captureId:String,val sequence:Long,val revision:Long?,val payload:JSONObject)
    fun accept(envelope:JSONObject,expectedCaptureId:String,expectedDeviceId:String,now:Long):Observation {
        require(envelope.optBoolean("read_only")){"Read-only envelope required"}
        require(envelope.optString("content_trust")=="untrusted_page_data"){"Untrusted-data label required"}
        require(envelope.optString("view")=="map")
        require(envelope.optString("status")=="SNAPSHOT_AVAILABLE"){envelope.optString("status","READ_UNAVAILABLE")}
        val snapshot=envelope.getJSONObject("snapshot")
        require(snapshot.getString("captureId")==expectedCaptureId && snapshot.getString("deviceId")==expectedDeviceId){"Exact capture/device mismatch"}
        require(snapshot.getLong("expiresAtEpochMs")>now){"NO_FRESH_SNAPSHOT"}
        val payload=snapshot.getJSONObject("payload")
        val sequence=snapshot.getLong("sequence")
        require(payload.getString("captureId")==expectedCaptureId && payload.getLong("sequence")==sequence)
        require(snapshot.getLong("capturedAtEpochMs")==payload.getLong("capturedAtEpochMs"))
        // Existing ACK/read envelopes do not guarantee a map revision. Absence is UNKNOWN, never inferred.
        val revision=if(payload.has("revision") && payload.get("revision") is Number)payload.get("revision").toString().toBigDecimal().longValueExact() else null
        return Observation(expectedCaptureId,sequence,revision,payload)
    }
}
