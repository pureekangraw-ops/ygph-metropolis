package com.big.gobrowser.transport
import org.junit.Assert.*
import org.junit.Test

class StationDiagnosticsTest {
    private val id="11111111-2222-4333-8444-555555555555"
    @Test fun boundedAllowlistedErrors() {
        val known=StationDiagnostics.failure(502,"{\"error\":\"LIVE_VIEW_PROVIDER_ERROR\",\"url\":\"PRIVATE_URL\"}".byteInputStream(),id)
        assertEquals("LIVE_VIEW_PROVIDER_ERROR",known.code)
        assertEquals(id,known.requestId)
        for(body in listOf("{bad PRIVATE_TOKEN", "{\"error\":\"PRIVATE_TOKEN\"}","x".repeat(4097))) {
            val error=StationDiagnostics.failure(400,body.byteInputStream(),id)
            assertEquals("STATION_HTTP_400",error.code)
            assertFalse(error.toString().contains("PRIVATE"))
        }
        assertEquals("STATION_HTTP_401",StationDiagnostics.failure(401,null,id).code)
        assertNull(StationDiagnostics.failure(400,null,"https://private").requestId)
    }
    @Test fun byteLimitAndSafeUnexpectedErrors() {
        assertEquals("x".repeat(4096),StationDiagnostics.readBounded("x".repeat(4096).byteInputStream(),4096))
        try { StationDiagnostics.readBounded("ก".repeat(1400).byteInputStream(),4096);fail("must count bytes") } catch(_:IllegalArgumentException) {}
        assertEquals("STATION_REQUEST_FAILED",StationDiagnostics.safeFailure(Exception("https://private?jwt=TOKEN")))
    }
    @Test fun pollingCannotOverwriteLiveViewSlot() {
        val records=mutableMapOf<String,String>()
        records[StationDiagnostics.diagnosticKey("/v1/view")]="LIVE_VIEW_PROVIDER_ERROR"
        records[StationDiagnostics.diagnosticKey("/v1/session")]="REQUEST_SUCCEEDED"
        assertEquals("LIVE_VIEW_PROVIDER_ERROR",records["browser-view"])
        assertEquals("REQUEST_SUCCEEDED",records["browser-session"])
    }
}
