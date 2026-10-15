package com.big.gobrowser.transport

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class EvidenceExportTest {
    @Test fun redactsCredentialVariantsAndPreservesNormalEvidence() {
        EvidenceRedactorTest.main(emptyArray())
    }
    @Test fun copiesNestedMapAndBrowserStringsWithoutMutatingLocalData() {
        val original=JSONObject().put("captureId","capture-1").put("sequence",7)
            .put("state",JSONObject().put("notes",JSONArray().put(JSONObject().put("value","api_key=canary"))))
        val clean=EvidenceExport.redactJson(original)
        assertFalse(clean.toString().contains("canary"))
        assertTrue(original.toString().contains("canary"))
        assertEquals("capture-1",clean.getString("captureId"))
        assertEquals(7,clean.getInt("sequence"))
    }
    @Test fun removesExactDeviceCredentialEvenWithoutAFieldLabel() {
        val input=JSONObject().put("text","See this unexpected device-secret-value on page")
        assertFalse(EvidenceExport.redactJson(input,"device-secret-value").toString().contains("device-secret-value"))
    }
    @Test fun filtersNamedSecretFieldsAndContextAtTheModelBoundary() {
        val context=JSONObject().put("browser",JSONObject().put("title","token=titleCanary")
            .put("targets",JSONArray().put(JSONObject().put("signature","a\u001fhttps://example.com/?token=signatureCanary"))))
            .put("api_key","fieldCanary")
        val request=JSONObject().put("text","ordinary question").put("context",context)
        val message=com.big.gobrowser.lyra.redactedModelMessage(request,"model-credential")
        listOf("titleCanary","signatureCanary","fieldCanary").forEach {assertFalse(message.toString().contains(it))}
        assertEquals("ordinary question",message.getString("text"))
        assertTrue(context.toString().contains("signatureCanary"))
    }
}
