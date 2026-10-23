package com.big.gobrowser.outsideview

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

/** Test-only adapter. Its receipts are explicitly SYNTHETIC, never production delivery evidence. */
class GoviewPackageExchangeTest {
    private class SyntheticExchange:GoviewPackageExchange {
        val uploads=mutableMapOf<String,String>();val proposals=mutableMapOf<String,String>()
        override fun uploadSelected(snapshot:SelectedSnapshot):PackageTransferReceipt {
            require(JSONObject(snapshot.json).getString("captureId")==snapshot.captureId)
            uploads[snapshot.captureId]=snapshot.json
            return PackageTransferReceipt("synthetic-upload","UPLOAD",snapshot.captureId,"SYNTHETIC_UPLOADED","SYNTHETIC_TEST")
        }
        override fun downloadProposal(sourceCaptureId:String):DownloadedProposal {
            val content=proposals[sourceCaptureId]
            return DownloadedProposal(PackageTransferReceipt("synthetic-download","DOWNLOAD",sourceCaptureId,if(content==null)"SYNTHETIC_NOT_FOUND" else "SYNTHETIC_DOWNLOADED","SYNTHETIC_TEST"),content)
        }
    }
    @Test fun uploadDownloadAndOwnerCommitAreIndependentInSyntheticRoundtrip() {
        val root=Files.createTempDirectory("goview-adapter").toFile()
        try {
            val store=MapStateStore(root)
            val json=JSONObject("""{"type":"FeatureCollection","features":[{"type":"Feature","id":"synthetic","geometry":{"type":"Point","coordinates":[10,20]},"properties":{"name":"Synthetic"}}]}""")
            store.importGeoJson(GeoJsonImport.parse(json.toString().byteInputStream()))
            val before=store.load();val snapshot=store.selectedSnapshot(before.state.pins.keys,before.state.revision)
            val transport=SyntheticExchange();assertNull(transport.downloadProposal(snapshot.captureId).content)
            val upload=transport.uploadSelected(snapshot);assertEquals("UPLOAD",upload.operation)
            assertEquals(before.state,store.load().state)
            transport.proposals[snapshot.captureId]=JSONObject().put("contractVersion",1).put("operation","propose-update")
                .put("sourceCaptureId",snapshot.captureId).put("baseVersion",snapshot.version).put("package",json).toString()
            val download=transport.downloadProposal(snapshot.captureId)
            assertEquals("DOWNLOAD",download.receipt.operation);assertNotEquals(upload.id,download.receipt.id)
            assertEquals(before.state,store.load().state);assertEquals("SYNTHETIC_TEST",download.receipt.environment)
            val batch=GoviewSandboxContract.readFile(download.content!!.byteInputStream())
            val preview=store.previewUpdate(batch,snapshot.captureId)
            assertEquals(before.state,store.load().state)
            val committed=store.approveUpdate(preview)
            assertEquals("UPDATE",committed.operation);assertTrue(committed.readbackVerified)
            assertNotEquals(download.receipt.id,committed.id)
        }finally{root.deleteRecursively()}
    }
    @Test fun shippingAdapterNeverFabricatesTransferSuccess() {
        val snapshot=SelectedSnapshot("synthetic",1,"{}",MapUpdateReceipt("r","p",1,"CAPTURED_LOCAL",1,operation="SNAPSHOT"))
        assertEquals("BLOCKED",UnconfiguredGoviewExchange.uploadSelected(snapshot).status)
        val result=UnconfiguredGoviewExchange.downloadProposal(snapshot.captureId)
        assertEquals("BLOCKED",result.receipt.status);assertNull(result.content)
    }
}
