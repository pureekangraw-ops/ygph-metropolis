package com.big.gobrowser.outsideview

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject

class MapRelayGuardTest {
    private val c=MapRelayConfiguration("https://owner/snapshot","https://owner/commands","https://owner/receipt","device","work","checkpoint","GO",setOf("map.observe","map.note"))
    private val s=MapRelayCapture("capture",4,9,1000)
    private val e=MapRelayEnvelope(MapCommand("id",MapAction.NOTE,MapTarget("area","map"),note="note",expectedRevision=4),"GO","device","work","checkpoint","capture",4,9,900,2000,"map.note")
    private fun reject(v:MapRelayEnvelope=e,at:Long=1100,fg:Boolean=true,interactive:Boolean=true)=MapRelayGuard.rejection(v,c,s,at,fg,interactive)
    private fun wire()=JSONObject().put("commandId","id").put("actor","GO").put("deviceId","device").put("workId","work").put("checkpointId","checkpoint").put("captureId","capture").put("revision",4).put("epoch",9).put("issuedAtEpochMs",900).put("expiresAtEpochMs",2000).put("authority","map.note").put("command",MapCommandCodec.encode(e.command))
    @Test fun malformedEnvelopeNeverGetsAnExecutionCommand(){
        assertEquals(e,MapRelayEnvelope.decode(wire()))
        for (raw in listOf(wire().put("commandId","changed"),wire().put("revision",4.5),wire().put("epoch","9"),wire().put("script","alert(1)"),wire().also {it.getJSONObject("command").put("expectedRevision",JSONObject.NULL)})) {
            assertTrue(runCatching {MapRelayEnvelope.decode(raw)}.isFailure)
        }
    }
    @Test fun currentExplicitOwnerAuthorityAccepted(){assertNull(reject())}
    @Test fun eachOwnerBindingMustMatch(){assertNotNull(reject(e.copy(workId="other")));assertNotNull(reject(e.copy(checkpointId="other")));assertNotNull(reject(e.copy(deviceId="other")));assertNotNull(reject(e.copy(actor="LIGHT")))}
    @Test fun captureRevisionEpochAndExpectedRevisionMustMatch(){assertNotNull(reject(e.copy(captureId="old")));assertNotNull(reject(e.copy(epoch=8)));assertNotNull(reject(e.copy(revision=3)));assertNotNull(reject(e.copy(command=e.command.copy(expectedRevision=null))))}
    @Test fun expiredFutureExcessTtlAndBackgroundAreRejected(){assertNotNull(reject(at=2000));assertNotNull(reject(e.copy(issuedAt=7000,expiresAt=8000)));assertNotNull(reject(e.copy(expiresAt=40000)));assertNotNull(reject(fg=false));assertNotNull(reject(interactive=false))}
    @Test fun authorityMustExactlyMatchActionAndGrant(){assertNotNull(reject(e.copy(authority="map.*")));assertNotNull(reject(e.copy(command=e.command.copy(action=MapAction.CLEAR))));assertNotNull(reject(e.copy(command=e.command.copy(action=MapAction.ROUTE),authority="map.route")))}
}
