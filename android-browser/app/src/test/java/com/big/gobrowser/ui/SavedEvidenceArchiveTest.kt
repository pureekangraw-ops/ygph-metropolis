package com.big.gobrowser.ui

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SavedEvidenceArchiveTest {
    @Test fun retainsAllRecordsBeyondTwentyAndDoesNotTruncateNewEvidence() {
        var records=JSONArray()
        val evidence="ordinary evidence ".repeat(1100)
        for(index in 0 until 35) records=SavedEvidenceArchive.prepend(records,"map","$evidence $index",index.toLong())
        assertEquals(35,records.length())
        assertEquals(34L,records.getJSONObject(0).getLong("savedAt"))
        assertEquals(0L,records.getJSONObject(34).getLong("savedAt"))
        assertEquals("$evidence 34",records.getJSONObject(0).getString("text"))
    }
    @Test fun redactsNewEvidenceAndLeavesExistingArchiveUntouched() {
        val existing=JSONArray().put(JSONObject().put("view","browser").put("text","old note"))
        val result=SavedEvidenceArchive.prepend(existing,"browser","token=canary",1L)
        assertEquals(1,existing.length())
        assertEquals(2,result.length())
        assertFalse(result.getJSONObject(0).getString("text").contains("canary"))
        assertEquals("old note",result.getJSONObject(1).getString("text"))
    }
}
