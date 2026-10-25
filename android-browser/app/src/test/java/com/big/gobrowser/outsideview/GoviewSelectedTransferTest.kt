package com.big.gobrowser.outsideview

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.nio.file.Files

class GoviewSelectedTransferTest {
    private fun fixture(id:String="one")=GeoJsonImport.parse("""{"type":"FeatureCollection","features":[{"type":"Feature","id":"$id","geometry":{"type":"Point","coordinates":[10,20]},"properties":{"name":"Synthetic $id"}}]}""".byteInputStream())
    private class Memory:GoviewTransferTransport {
        val entries=mutableMapOf<String,String>();var puts=0;var receipts=0;var failPut=false;var failReceipt=false
        override fun put(envelope:GoviewTransfer):String {puts++;entries[envelope.transferId]=envelope.json();if(failPut)error("synthetic uncertain write");return envelope.json()}
        override fun get(transferId:String,uploadReadback:Boolean)=entries[transferId]?:error("synthetic missing")
        override fun receipt(transferId:String,body:String):String {receipts++;if(failReceipt)error("synthetic receipt offline");return body}
    }
    private fun proposal(s:GoviewTransfer):GoviewTransfer {
        val capture=s.transferId;val version=s.identity.getLong("baseVersion")
        val pkg=JSONObject("""{"type":"FeatureCollection","features":[{"type":"Feature","id":"added-by-go","geometry":{"type":"Point","coordinates":[11,21]},"properties":{"name":"Synthetic GO proposal"}}]}""")
        val payload=JSONObject().put("contractVersion",1).put("operation","propose-update").put("sourceCaptureId",capture).put("baseVersion",version).put("package",pkg).toString()
        return GoviewTransfer.parse(GoviewTransfer(capture+"-proposal","PROPOSAL","goview.map-update",JSONObject().put("captureId",capture).put("baseVersion",version).put("snapshotSha256",s.sha256),GoviewTransfer.digest(payload),payload).json())
    }
    @Test fun uncertainUploadReopensAndReadsBackWithoutRepeatingMutation() {
        val root=Files.createTempDirectory("goview-transfer").toFile()
        try {
            val store=MapStateStore(File(root,"map"));store.importGeoJson(fixture());val state=store.load().state
            val selected=store.selectedSnapshot(state.pins.keys,state.revision);val transport=Memory().apply {failPut=true}
            val files=File(root,"transfers");val exchange=GoviewSelectedTransfer(files,store,transport)
            assertTrue(runCatching {exchange.upload(selected)}.isFailure);assertEquals(1,transport.puts)
            val reopened=GoviewSelectedTransfer(files,MapStateStore(File(root,"map")),transport)
            reopened.verifyUpload(selected.captureId);assertEquals(1,transport.puts);assertEquals(state,store.load().state)
            assertEquals("UPLOAD",store.load().updates.last().operation);assertFalse(store.load().updates.last().readbackVerified)
        }finally{root.deleteRecursively()}
    }
    @Test fun failedReceiptDeliveryNeverReplaysUpdateAndCanRetryAfterReopen() {
        val root=Files.createTempDirectory("goview-receipt").toFile()
        try {
            val store=MapStateStore(File(root,"map"));store.importGeoJson(fixture());val state=store.load().state
            val transport=Memory();val files=File(root,"transfers");val exchange=GoviewSelectedTransfer(files,store,transport)
            val s=exchange.upload(store.selectedSnapshot(state.pins.keys,state.revision));val p=proposal(s);transport.entries[p.transferId]=p.json()
            val preview=exchange.download(s.transferId);assertEquals(state,store.load().state)
            val receipt=store.approveUpdate(preview);val saved=store.load();transport.failReceipt=true
            assertTrue(runCatching {exchange.report(receipt)}.isFailure);assertEquals(saved,store.load())
            transport.failReceipt=false;GoviewSelectedTransfer(files,MapStateStore(File(root,"map")),transport).report(receipt)
            assertEquals(saved,store.load());assertEquals(2,transport.receipts)
            assertTrue(runCatching {exchange.download(s.transferId)}.isFailure) // old base cannot silently replay
        }finally{root.deleteRecursively()}
    }
    @Test fun privatePayloadAndWrongSnapshotBindingFailBeforeDispatchOrMapMutation() {
        val root=Files.createTempDirectory("goview-binding").toFile()
        try {
            val store=MapStateStore(File(root,"map"));store.importGeoJson(fixture());val state=store.load().state
            val transport=Memory();val exchange=GoviewSelectedTransfer(File(root,"transfers"),store,transport)
            val selected=store.selectedSnapshot(state.pins.keys,state.revision)
            val privateJson=JSONObject(selected.json).put("gps","synthetic-private").toString()
            assertTrue(runCatching {exchange.upload(selected.copy(json=privateJson))}.isFailure)
            val hidden=JSONObject(selected.json);hidden.getJSONObject("captureReceipt").put("gps","synthetic-private")
            assertTrue(runCatching {exchange.upload(selected.copy(json=hidden.toString()))}.isFailure);assertEquals(0,transport.puts)
            val s=exchange.upload(selected);val p=proposal(s)
            val wrong=p.copy(identity=JSONObject(p.identity.toString()).put("snapshotSha256","0".repeat(64)))
            transport.entries[p.transferId]=wrong.json()
            assertTrue(runCatching {exchange.download(s.transferId)}.isFailure);assertEquals(state,store.load().state)
        }finally{root.deleteRecursively()}
    }
    @Test fun actualKotlinAndWorkerAdaptersCompleteSyntheticSelectedRoundtrip() {
        var repository=File(System.getProperty("user.dir")).absoluteFile
        while(!File(repository,"goview-package-bridge/tests/typed-server-fixture.mjs").isFile)repository=repository.parentFile?:error("Repository fixture missing")
        val process=ProcessBuilder("node",File(repository,"goview-package-bridge/tests/typed-server-fixture.mjs").path).redirectError(ProcessBuilder.Redirect.INHERIT).start()
        val root=Files.createTempDirectory("goview-cross-runtime").toFile()
        try {
            val port=process.inputStream.bufferedReader().readLine().toInt()
            fun call(path:String,token:String,method:String="GET",body:String?=null):String {
                val c=URI("http://127.0.0.1:$port$path").toURL().openConnection() as HttpURLConnection
                try {c.requestMethod=method;c.connectTimeout=3000;c.readTimeout=5000;c.setRequestProperty("Authorization","Bearer $token");c.setRequestProperty("Content-Type","application/json")
                    if(body!=null){c.doOutput=true;c.outputStream.use {it.write(body.toByteArray(Charsets.UTF_8))}}
                    check(c.responseCode in 200..299){"synthetic HTTP ${c.responseCode}: ${c.errorStream?.bufferedReader()?.readText()}"}
                    return c.inputStream.bufferedReader().use {it.readText()}
                }finally{c.disconnect()}
            }
            val transport=object:GoviewTransferTransport {
                override fun put(envelope:GoviewTransfer)=call("/v1/transfers/"+envelope.transferId,"U".repeat(32),"PUT",envelope.json())
                override fun get(transferId:String,uploadReadback:Boolean)=call("/v1/transfers/$transferId",(if(uploadReadback)"U" else "R").repeat(32))
                override fun receipt(transferId:String,body:String)=call("/v1/transfers/$transferId/receipt","R".repeat(32),"POST",body)
            }
            fun go(name:String,args:JSONObject)=JSONObject(call("/synthetic-go/$name","G".repeat(32),"POST",args.toString()))
            val store=MapStateStore(File(root,"map"));store.importGeoJson(fixture());store.importGeoJson(fixture("unrelated"))
            val initial=store.load();val selectedId=initial.state.pins.keys.first()
            store.commit(initial.copy(state=initial.state.copy(notes=mapOf(selectedId to "private owner note"))))
            val before=store.load().state;val exchange=GoviewSelectedTransfer(File(root,"transfers"),store,transport)
            val s=exchange.upload(store.selectedSnapshot(setOf(selectedId),before.revision))
            assertFalse(s.payload.contains("private owner note"));assertEquals(1,GeoJsonImport.parse(s.payload.byteInputStream()).pins.size)
            val read=go("goview_transfer_read",JSONObject().put("transferId",s.transferId).put("sha256",s.sha256))
            assertTrue(read.toString(),read.getBoolean("ok"));assertEquals(s.payload,read.getJSONObject("envelope").getString("payload"))
            val p=proposal(s);assertTrue(go("goview_transfer_publish",JSONObject().put("envelope",JSONObject(p.json()))).getBoolean("ok"))
            assertFalse(go("goview_transfer_receipt",JSONObject().put("transferId",p.transferId)).getBoolean("ok"))
            val preview=exchange.download(s.transferId);assertEquals(before,store.load().state)
            assertEquals(before,MapStateStore(File(root,"map")).load().state) // reopen unapproved preview
            val backup=store.createBackup()
            val receipt=store.approveUpdate(preview);assertTrue(receipt.readbackVerified);exchange.report(receipt)
            val report=go("goview_transfer_receipt",JSONObject().put("transferId",p.transferId))
            assertTrue(report.getBoolean("ok"));assertFalse(report.getBoolean("independentlyVerified"))
            val reopened=MapStateStore(File(root,"map")).load();assertEquals(3,reopened.state.pins.size);assertEquals(before.notes,reopened.state.notes)
            assertEquals(setOf("SNAPSHOT","UPLOAD","DOWNLOAD","UPDATE"),reopened.updates.map {it.operation}.toSet())
            assertEquals(1,GoviewSelectedTransfer(File(root,"transfers"),store,transport).captures().size)
            val restored=store.approveRestore(store.previewRestore(backup));assertTrue(restored.readbackVerified)
            assertEquals(before.pins,MapStateStore(File(root,"map")).load().state.pins)
            assertEquals(before.notes,store.load().state.notes);assertEquals(2,store.backups().size)
        }finally{process.destroyForcibly();root.deleteRecursively()}
    }
}
