package com.big.gobrowser.outsideview

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Android's real org.json and filesystem, using synthetic data in an isolated cache directory. */
@RunWith(AndroidJUnit4::class)
class GoviewExchangeTest {
    @Test fun platformJsonAndJournalPreserveExportEditAndReimport() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val root=File(context.cacheDir,"goview-exchange-${System.nanoTime()}")
        try {
            val first=MapStateStore(File(root,"first"))
            val raw="""{"type":"FeatureCollection","name":"SYNTHETIC-ANDROID","features":[{"type":"Feature","id":"test","geometry":{"type":"Point","coordinates":[10,20]},"properties":{"name":"Synthetic only","nested":{"z":1,"a":2}}}]}"""
            val reordered=raw.replace("\"z\":1,\"a\":2","\"a\":2,\"z\":1")
            first.importGeoJson(GeoJsonImport.parse(raw.byteInputStream()))
            assertEquals(0,first.importGeoJson(GeoJsonImport.parse(reordered.byteInputStream())))
            val before=first.load();val id=before.state.pins.keys.single()
            first.editOwnerPin(id,"Owner confirmed synthetic",Point(11.0,21.0),true,before.state.revision)
            val export=first.exportGeoJson()
            assertEquals(0,first.importGeoJson(GeoJsonImport.parse(export.byteInputStream())))
            val second=MapStateStore(File(root,"second"));second.importGeoJson(GeoJsonImport.parse(export.byteInputStream()))
            val readback=MapStateStore(File(root,"second")).load()
            assertEquals(1,readback.state.pins.size)
            assertEquals(Point(11.0,21.0),readback.state.pins[id]!!.point)
            assertEquals(EvidenceStatus.UNKNOWN,readback.state.pins[id]!!.evidence.coordinate)
            assertTrue(readback.state.pins[id]!!.evidence.source!!.contains("owner-field-confirmation"))
            assertEquals("SAVED",readback.updates.single().status)
        }finally{root.deleteRecursively()}
    }
    @Test fun sqliteFilePreviewApprovalSnapshotAndBackupRestoreHaveSeparateEvidence() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val root=File(context.cacheDir,"goview-local-cycle-${System.nanoTime()}")
        try {
            val store=MapStateStore(root,SqliteJournalBackend(root))
            val raw="""{"type":"FeatureCollection","features":[{"type":"Feature","id":"local","geometry":{"type":"Point","coordinates":[10,20]},"properties":{"name":"Synthetic cycle"}}]}"""
            val batch=GoviewSandboxContract.readFile(raw.byteInputStream())
            val received=store.receiveFile(batch,"synthetic-cycle")
            val preview=store.previewUpdate(batch,"synthetic-cycle")
            assertEquals("DOWNLOAD",received.operation);assertTrue(store.load().state.pins.isEmpty())
            val saved=store.approveUpdate(preview)
            assertEquals("UPDATE",saved.operation);assertTrue(saved.readbackVerified)
            val recreated=MapStateStore(root,SqliteJournalBackend(root));val readback=recreated.load()
            assertEquals(1,readback.state.pins.size)
            val snapshot=recreated.selectedSnapshot(readback.state.pins.keys,readback.state.revision)
            assertEquals("SNAPSHOT",snapshot.receipt.operation)
            assertNotEquals(saved.id,snapshot.receipt.id)
            assertTrue(File(root,"snapshots/${snapshot.captureId}.geojson").isFile)
            val backup=recreated.createBackup();val pin=readback.state.pins.values.single()
            recreated.editOwnerPin(pin.id,"Changed synthetic",pin.point,false,readback.state.revision)
            val restored=recreated.approveRestore(recreated.previewRestore(backup))
            assertEquals("STORAGE",restored.operation);assertTrue(restored.readbackVerified)
            assertEquals(pin,MapStateStore(root,SqliteJournalBackend(root)).load().state.pins[pin.id])
            assertEquals(0,recreated.importGeoJson(batch))
            assertEquals("BLOCKED",GoviewSandboxContract.blocked("upload-selected-package",snapshot.captureId).getString("status"))
            assertEquals("BLOCKED",GoviewSandboxContract.blocked("download-proposal",snapshot.captureId).getString("status"))
        }finally{root.deleteRecursively()}
    }

}
