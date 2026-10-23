package com.big.gobrowser.outsideview

import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class GoviewWorkspaceTest {
    private fun fixture()=GeoJsonImport.parse("""{"type":"FeatureCollection","features":[{"type":"Feature","id":"s","geometry":{"type":"Point","coordinates":[10,20]},"properties":{"name":"Synthetic"}}]}""".byteInputStream())
    @Test fun fileReceiptAndPreviewNeverCommitUntilOwnerApproval() {
        val root=Files.createTempDirectory("goview-phases").toFile()
        try {
            val store=MapStateStore(root);val batch=fixture()
            val received=store.receiveFile(batch,"capture-synthetic")
            assertEquals("DOWNLOAD",received.operation);assertEquals("FILE_RECEIVED",received.status)
            assertTrue(store.load().state.pins.isEmpty());assertFalse(received.readbackVerified)
            val preview=store.previewUpdate(batch,"capture-synthetic")
            assertEquals(1,preview.added);assertTrue(store.load().state.pins.isEmpty())
            val saved=store.approveUpdate(preview)
            assertEquals("UPDATE",saved.operation);assertTrue(saved.readbackVerified)
            assertNotEquals(received.id,saved.id);assertEquals(received.correlationId,saved.correlationId)
            assertEquals(1,MapStateStore(root).load().state.pins.size)
            assertEquals("DUPLICATE",store.approveUpdate(store.previewUpdate(batch,"retry")).status)
        }finally{root.deleteRecursively()}
    }
    @Test fun concurrentEditInvalidatesApprovalAndPreservesUnrelatedRecords() {
        val root=Files.createTempDirectory("goview-conflict").toFile()
        try {
            val store=MapStateStore(root);val preview=store.previewUpdate(fixture(),"capture")
            store.commit(MapJournal(MapState(notes=mapOf("unrelated" to "keep"),revision=2)))
            assertTrue(runCatching {store.approveUpdate(preview)}.isFailure)
            assertEquals("keep",store.load().state.notes["unrelated"])
            store.approveUpdate(store.previewUpdate(fixture(),"re-preview"))
            assertEquals("keep",store.load().state.notes["unrelated"])
        }finally{root.deleteRecursively()}
    }
    @Test fun snapshotRequiresSelectionAndContainsOnlySelectedPins() {
        val root=Files.createTempDirectory("goview-snapshot").toFile()
        try {
            val store=MapStateStore(root);store.importGeoJson(fixture())
            val j=store.load();val pin=j.state.pins.values.single()
            store.commit(j.copy(state=j.state.copy(pins=j.state.pins+("unrelated" to pin.copy(id="unrelated",label="secret unrelated")),notes=mapOf("unrelated" to "secret note"))))
            assertTrue(runCatching {store.selectedSnapshot(emptySet(),j.state.revision)}.isFailure)
            val snapshot=store.selectedSnapshot(setOf(pin.id),j.state.revision)
            assertEquals("SNAPSHOT",snapshot.receipt.operation);assertEquals("CAPTURED_LOCAL",snapshot.receipt.status)
            assertFalse(snapshot.json.contains("secret"));assertFalse(snapshot.json.contains("viewport"));assertFalse(snapshot.json.contains("gps"))
            assertEquals(1,GeoJsonImport.parse(snapshot.json.byteInputStream()).pins.size)
            assertEquals(0,store.importGeoJson(GeoJsonImport.parse(snapshot.json.byteInputStream())))
            assertEquals(snapshot.captureId,snapshot.receipt.correlationId)
        }finally{root.deleteRecursively()}
    }
    @Test fun restoreRequiresReviewPreservesRollbackAndRejectsTampering() {
        val root=Files.createTempDirectory("goview-backup").toFile()
        try {
            val store=MapStateStore(root);store.importGeoJson(fixture());val original=store.load()
            val name=store.createBackup()
            store.commit(original.copy(state=original.state.copy(notes=mapOf("later" to "keep in rollback"),revision=2)))
            val restored=store.approveRestore(store.previewRestore(name))
            assertEquals("STORAGE",restored.operation);assertTrue(restored.readbackVerified)
            assertEquals(original.state.pins,MapStateStore(root).load().state.pins)
            assertEquals(2,store.backups().size)
            val rollback=store.backups().single {it!=name}
            store.approveRestore(store.previewRestore(rollback))
            assertEquals("keep in rollback",store.load().state.notes["later"])
            val preview=store.previewRestore(name)
            java.io.File(root,"backups/$name").writeText("{}")
            assertTrue(runCatching {store.approveRestore(preview)}.isFailure)
            assertEquals("keep in rollback",store.load().state.notes["later"])
        }finally{root.deleteRecursively()}
    }
    @Test fun transportIsExplicitlyBlockedAndHasNoCommitAuthority() {
        for(operation in GoviewSandboxContract.operations){
            val result=GoviewSandboxContract.blocked(operation,"synthetic")
            assertEquals("BLOCKED",result.getString("status"));assertEquals(operation,result.getString("operation"))
        }
        assertTrue(runCatching {GoviewSandboxContract.blocked("commit","synthetic")}.isFailure)
    }
    @Test fun proposalEnvelopeRejectsUnexpectedFieldsAndBindsCaptureAndBaseVersion() {
        val raw="""{"type":"FeatureCollection","features":[{"type":"Feature","id":"s","geometry":{"type":"Point","coordinates":[10,20]},"properties":{"name":"Synthetic"}}]}"""
        val envelope=org.json.JSONObject().put("contractVersion",1).put("operation","propose-update").put("sourceCaptureId","synthetic-capture").put("baseVersion",0).put("package",org.json.JSONObject(raw))
        val batch=GoviewSandboxContract.readFile(envelope.toString().byteInputStream())
        assertEquals("synthetic-capture",batch.sourceCaptureId);assertEquals(0L,batch.baseVersion)
        envelope.put("gps","not allowed")
        assertTrue(runCatching {GoviewSandboxContract.readFile(envelope.toString().byteInputStream())}.isFailure)
        val root=Files.createTempDirectory("proposal-version").toFile()
        try {val store=MapStateStore(root);store.commit(MapJournal(MapState(revision=1)))
            assertTrue(runCatching {store.previewUpdate(batch,"synthetic-capture")}.isFailure)
            assertTrue(store.load().state.pins.isEmpty())
        }finally{root.deleteRecursively()}
    }

}
