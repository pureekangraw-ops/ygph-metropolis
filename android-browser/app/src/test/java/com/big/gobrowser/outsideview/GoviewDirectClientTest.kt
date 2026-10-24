package com.big.gobrowser.outsideview

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class GoviewDirectClientTest {
    private val id="94cdd7a2-1817-470c-bdf9-6a8cab11f001"
    @Test fun focusIsOnlyAViewportRequest() {
        val raw=JSONObject().put("schema","goview.direct-command.v1")
            .put("commandId",id).put("type","POINT_FOCUS")
            .put("point",JSONObject().put("latitude",13.81).put("longitude",100.67))
        val parsed=GoviewDirectProposal.parse(raw)
        assertEquals("POINT_FOCUS",parsed.type)
        assertNull(parsed.label)
        assertEquals(100.67,parsed.point.longitude,0.000001)
    }
    @Test fun unsafeProposalOrBadCoordinateRejected() {
        val raw=JSONObject().put("schema","goview.direct-command.v1")
            .put("commandId",id).put("type","PIN_PROPOSAL")
            .put("label","My cafe")
            .put("point",JSONObject().put("latitude",13.81).put("longitude",100.67))
        assertEquals("My cafe",GoviewDirectProposal.parse(raw).label)
        raw.put("type","UPLOAD_DEVICE_GPS")
        assertThrows(IllegalArgumentException::class.java){GoviewDirectProposal.parse(raw)}
        raw.put("type","PIN_PROPOSAL")
        raw.put("point",JSONObject().put("latitude",130).put("longitude",100.67))
        assertThrows(IllegalArgumentException::class.java){GoviewDirectProposal.parse(raw)}
    }
}
