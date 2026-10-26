package com.big.gobrowser.outsideview

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files

class GoviewStudioTransferTest {
    private fun envelope(id:String="synthetic-studio-transfer",version:Int=1):GoviewTransfer {
        val map="""{"schema":1,"mapId":"synthetic-map","title":"Synthetic","version":$version,"origin":{"lat":0,"lng":0},"nodes":[],"roads":[],"areas":[],"pois":[]}"""
        val raw="""{"format":"goview.map.package.v1","checksum":"sha256:${GoviewTransfer.digest(map)}","map":$map}"""+"\n"
        return GoviewTransfer.parse(GoviewTransfer(id,"STUDIO","goview.map.package.v1",JSONObject().put("mapId","synthetic-map").put("version",version),GoviewTransfer.digest(raw),raw).json())
    }
    private class Transport(var e:GoviewTransfer):GoviewTransferTransport {
        var reports=0;var fail=false;var badAck=false;val bodies=mutableListOf<String>()
        override fun put(envelope:GoviewTransfer):String=error("Studio downloader cannot upload")
        override fun get(transferId:String,uploadReadback:Boolean)=e.json()
        override fun receipt(transferId:String,body:String):String {reports++;bodies+=body;if(fail)error("synthetic lost ack");return if(badAck)JSONObject(body).put("sha256","0".repeat(64)).toString() else body}
    }
    private fun coordinator(root:File,t:Transport)=GoviewStudioTransfer(File(root,"typed"),File(root,"receipts"),t,{File(root,"saved.json").readBytes()},Any())
    private fun download(c:GoviewStudioTransfer,e:GoviewTransfer)=c.download(e.transferId,e.identity.getString("mapId"),e.identity.getInt("version"),e.sha256)
    private fun approve(root:File,e:GoviewTransfer) {
        File(root,"saved.json").writeText(e.payload)
        val file=File(root,"receipts/${e.transferId}.json")
        val r=JSONObject(file.readText()).put("status","OWNER_APPROVED_FILE_READBACK_VERIFIED").put("readbackSha256",e.sha256)
        file.writeText(r.toString())
    }
    @Test fun downloadAndReopenNeverSaveOrReportBeforeNativeApproval() {
        val root=Files.createTempDirectory("studio-transfer").toFile()
        try {
            val e=envelope();val t=Transport(e);val c=coordinator(root,t)
            assertEquals(e.payload,download(c,e).payload);assertFalse(File(root,"saved.json").exists())
            assertTrue(runCatching {coordinator(root,t).report(e.transferId)}.isFailure);assertEquals(0,t.reports)
            approve(root,e);assertEquals("SAVED",c.report(e.transferId).getString("status"));assertEquals(1,t.reports)
            assertEquals(e.payload,File(root,"saved.json").readText())
        }finally{root.deleteRecursively()}
    }
    @Test fun receiptAloneAndChangedSavedBytesCannotFabricateSuccess() {
        val root=Files.createTempDirectory("studio-proof").toFile()
        try {
            val e=envelope();val t=Transport(e);val c=coordinator(root,t);download(c,e);approve(root,e)
            File(root,"saved.json").writeText(e.payload+" ")
            assertTrue(runCatching {c.report(e.transferId)}.isFailure);assertEquals(0,t.reports)
            File(root,"saved.json").delete()
            assertTrue(runCatching {c.report(e.transferId)}.isFailure);assertEquals(0,t.reports)
        }finally{root.deleteRecursively()}
    }
    @Test fun lostAcknowledgementRetriesOnlyIdenticalReportAfterRestart() {
        val root=Files.createTempDirectory("studio-retry").toFile()
        try {
            val e=envelope();val t=Transport(e);val c=coordinator(root,t);download(c,e);approve(root,e)
            val before=File(root,"saved.json").readBytes();t.fail=true
            assertTrue(runCatching {c.report(e.transferId)}.isFailure);t.fail=false
            coordinator(root,t).report(e.transferId)
            assertEquals(2,t.reports);assertEquals(t.bodies[0],t.bodies[1]);assertArrayEquals(before,File(root,"saved.json").readBytes())
            assertEquals("REMOTE_RECEIPT_READBACK_VERIFIED",JSONObject(File(root,"receipts/${e.transferId}.json").readText()).getString("typedReportStatus"))
        }finally{root.deleteRecursively()}
    }
    @Test fun wrongSelectedIdentityAndConflictingReusePreservePriorApproval() {
        val root=Files.createTempDirectory("studio-identity").toFile()
        try {
            val e=envelope();val t=Transport(e);val c=coordinator(root,t)
            assertTrue(runCatching {c.download(e.transferId,"other-map",1,e.sha256)}.isFailure)
            assertTrue(runCatching {c.download(e.transferId,"synthetic-map",2,e.sha256)}.isFailure)
            assertTrue(runCatching {c.download(e.transferId,"synthetic-map",1,"0".repeat(64))}.isFailure)
            assertTrue(c.ids().isEmpty())
            download(c,e);approve(root,e);val approved=File(root,"receipts/${e.transferId}.json").readText()
            download(c,e);assertEquals(approved,File(root,"receipts/${e.transferId}.json").readText())
            t.e=envelope(version=2);assertTrue(runCatching {download(c,t.e)}.isFailure)
            assertEquals(approved,File(root,"receipts/${e.transferId}.json").readText());assertEquals(e.payload,c.local(e.transferId).payload)
        }finally{root.deleteRecursively()}
    }
    @Test fun malformedAcknowledgementNeverRecordsRemoteSuccess() {
        val root=Files.createTempDirectory("studio-ack").toFile()
        try {
            val e=envelope();val t=Transport(e);val c=coordinator(root,t);download(c,e);approve(root,e);t.badAck=true
            assertTrue(runCatching {c.report(e.transferId)}.isFailure)
            assertFalse(JSONObject(File(root,"receipts/${e.transferId}.json").readText()).has("typedReportStatus"))
        }finally{root.deleteRecursively()}
    }
}
