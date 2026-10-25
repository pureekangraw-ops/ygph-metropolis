package com.big.gobrowser.browser

import com.big.gobrowser.transport.*
import org.junit.Assert.*
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URL
import java.io.IOException

class BrowserResponseTest {
    private val id="11111111-2222-4333-8444-555555555555"
    private inner class Connection(val status:Int=200,val payload:String="{}",val echo:String?=id,
        val brokenBody:Boolean=false):HttpURLConnection(URL("https://synthetic.invalid/")) {
        var disconnected=false
        override fun connect(){}
        override fun disconnect(){disconnected=true}
        override fun usingProxy()=false
        override fun getResponseCode()=status
        override fun getHeaderField(name:String)=if(name.equals("X-Request-ID",true))echo else null
        override fun getInputStream()=if(brokenBody)throw IOException("PRIVATE_TOKEN") else payload.byteInputStream()
        override fun getErrorStream()=payload.byteInputStream()
    }
    private fun receive(c:Connection)=StationHttp.requestResponse(c,"GET",null,null,id)
    private fun failure(block:()->Unit):StationFailure {
        try {block();fail("expected safe failure")}catch(e:StationFailure){
            assertFalse(e.toString().contains("PRIVATE"));assertNull(e.cause);return e
        }
        throw AssertionError("missing failure")
    }
    @Test fun malformedJsonKeepsCorrelated200() {
        val c=Connection(payload="{bad PRIVATE_TOKEN")
        val e=failure{BrowserResponse.parse(receive(c),"/v1/session")}
        assertEquals(200,e.httpStatus);assertEquals(id,e.requestId);assertTrue(e.correlationConfirmed)
        assertEquals("STATION_REQUEST_FAILED",e.code);assertTrue(c.disconnected)
    }
    @Test fun invalidViewUrlKeepsExactSuccessStatus() {
        val c=Connection(202,"{\"url\":\"https://other.invalid/PRIVATE_URL\"}")
        val e=failure{BrowserResponse.parse(receive(c),"/v1/view")}
        assertEquals(202,e.httpStatus);assertEquals(id,e.requestId);assertTrue(e.correlationConfirmed)
        assertEquals("LIVE_VIEW_UNAVAILABLE",e.code);assertTrue(c.disconnected)
    }
    @Test fun validResponseRemainsUsableAndHasSafeDefaultToString() {
        val c=Connection(payload="{\"url\":\"https://live.browser.run/PRIVATE_URL\"}")
        val response=receive(c)
        assertEquals(200,response.httpStatus);assertTrue(response.correlationConfirmed)
        assertEquals("https://live.browser.run/PRIVATE_URL",BrowserResponse.parse(response,"/v1/view").getString("url"))
        assertFalse(response.toString().contains("PRIVATE"));assertTrue(c.disconnected)
    }
    @Test fun bodyErrorRetainsSafeCodeAndTransportFacts() {
        val c=Connection(payload="{\"error\":\"SESSION_UNAVAILABLE\"}")
        val e=failure{BrowserResponse.parse(receive(c),"/v1/session")}
        assertEquals("SESSION_UNAVAILABLE",e.code);assertEquals(200,e.httpStatus);assertTrue(e.correlationConfirmed)
    }
    @Test fun missingOrMismatchedEchoNeverClaimsCorrelation() {
        for(echo in listOf(null,"22222222-2222-4333-8444-555555555555")) {
            val c=Connection(echo=echo)
            val e=failure{receive(c)}
            assertEquals(200,e.httpStatus);assertEquals(id,e.requestId);assertFalse(e.correlationConfirmed)
            assertEquals("STATION_CORRELATION_UNVERIFIED",e.code);assertTrue(c.disconnected)
        }
    }
    @Test fun callersWithoutRequestIdRemainSupportedWithoutClaimingCorrelation() {
        val c=Connection(echo=null)
        val response=StationHttp.requestResponse(c,"GET",null,null,null)
        assertEquals("{}",response.body);assertEquals(200,response.httpStatus)
        assertNull(response.requestId);assertFalse(response.correlationConfirmed)
        assertTrue(c.disconnected)
    }
    @Test fun httpFailurePreservesExistingErrorBehavior() {
        val c=Connection(401,"{\"error\":\"UNAUTHORIZED\",\"secret\":\"PRIVATE\"}")
        val e=failure{receive(c)}
        assertEquals(401,e.httpStatus);assertEquals("UNAUTHORIZED",e.code);assertTrue(e.correlationConfirmed)
        assertTrue(c.disconnected)
    }
    @Test fun oversizedOrUnreadableSuccessBodyPreservesMetadata() {
        for(c in listOf(Connection(payload="x".repeat(65537)),Connection(brokenBody=true))) {
            val e=failure{receive(c)}
            assertEquals(200,e.httpStatus);assertEquals(id,e.requestId);assertTrue(e.correlationConfirmed)
            assertTrue(e.code in setOf("STATION_RESPONSE_TOO_LARGE","STATION_RESPONSE_READ_FAILED"));assertTrue(c.disconnected)
        }
    }
}
