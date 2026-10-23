package com.big.gobrowser.outsideview

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Synthetic envelopes only; no network request or production readback claim. */
class GoviewObservationReadTest {
    private fun envelope():JSONObject {
        val payload=JSONObject().put("captureId","synthetic-capture").put("sequence",1).put("capturedAtEpochMs",100)
        return JSONObject().put("read_only",true).put("content_trust","untrusted_page_data").put("view","map").put("status","SNAPSHOT_AVAILABLE")
            .put("snapshot",JSONObject().put("captureId","synthetic-capture").put("deviceId","synthetic-device").put("sequence",1)
                .put("capturedAtEpochMs",100).put("receivedAtEpochMs",101).put("expiresAtEpochMs",130).put("payload",payload))
    }
    @Test fun exactFreshReadDoesNotInventRevisionOrUpdateAuthority() {
        val value=GoviewObservationRead.accept(envelope(),"synthetic-capture","synthetic-device",110)
        assertNull(value.revision);assertEquals(1L,value.sequence)
    }
    @Test fun unavailableAmbiguousExpiredOrWrongCaptureNeverFallBack() {
        for(status in listOf("NO_FRESH_SNAPSHOT","DEVICE_SELECTION_REQUIRED"))assertTrue(runCatching {
            GoviewObservationRead.accept(envelope().put("status",status),"synthetic-capture","synthetic-device",110)
        }.isFailure)
        assertTrue(runCatching {GoviewObservationRead.accept(envelope(),"different-capture","synthetic-device",110)}.isFailure)
        assertTrue(runCatching {GoviewObservationRead.accept(envelope(),"synthetic-capture","synthetic-device",130)}.isFailure)
    }
}
