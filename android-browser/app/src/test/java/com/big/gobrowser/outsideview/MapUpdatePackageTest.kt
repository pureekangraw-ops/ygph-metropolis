package com.big.gobrowser.outsideview

import java.io.File
import org.junit.Assert.*
import org.junit.Test

class MapUpdatePackageTest {
    private fun batch()=GeoJsonImport.parse("""{"type":"FeatureCollection","name":"SYNTHETIC","features":[{"type":"Feature","id":"one","geometry":{"type":"Point","coordinates":[10,20]},"properties":{"name":"Synthetic pin","source":"synthetic"}}]}""".byteInputStream())
    @Test fun versionedExportRoundTripsStableIdsPropertiesNotesAndReceipts() {
        val a=java.nio.file.Files.createTempDirectory("goview-export").toFile();val b=java.nio.file.Files.createTempDirectory("goview-import").toFile()
        try {
            val source=MapStateStore(a);val first=source.importGeoJsonWithReceipt(batch());assertEquals("SAVED",first.status)
            val before=source.load();val id=before.state.pins.keys.single()
            source.commit(before.copy(state=before.state.copy(notes=mapOf(id to "owner note"))))
            val exported=source.exportGeoJson();val parsed=GeoJsonImport.parse(exported.byteInputStream())
            assertTrue(parsed.nativePackage);assertEquals(source.load().state.revision,parsed.packageVersion)
            val destination=MapStateStore(b);destination.importGeoJsonWithReceipt(parsed)
            assertEquals(source.load().state.pins,destination.load().state.pins)
            assertEquals(source.load().state.notes,destination.load().state.notes)
            assertEquals("DUPLICATE",destination.importGeoJsonWithReceipt(parsed).status)
            assertEquals(2,MapStateStore(b).load().updates.size)
            assertEquals(1,destination.load().state.pins.size)
        }finally{a.deleteRecursively();b.deleteRecursively()}
    }
    @Test fun fieldEditIsVersionedAndResearchCannotOverwriteConfirmedData() {
        val root=java.nio.file.Files.createTempDirectory("goview-field").toFile()
        try {
            val store=MapStateStore(root);val input=batch();store.importGeoJson(input)
            val old=store.load();val id=old.state.pins.keys.single()
            val edit=store.editOwnerPin(id,"Field checked",Point(11.0,21.0),true,old.state.revision)
            val current=store.load();assertEquals(2L,edit.revision);assertEquals("owner-field-confirmation",current.state.pins[id]!!.evidence.source)
            assertThrows(Exception::class.java){store.importGeoJson(input)}
            assertEquals(current,store.load())
            val replacement=current.state.pins[id]!!.copy(label="web research")
            assertTrue(validate(MapCommand("web",MapAction.UPSERT_PIN,pin=replacement),current.state,System.currentTimeMillis()).any {it.contains("field-confirmed")})
            assertThrows(Exception::class.java){store.editOwnerPin(id,"stale",Point(1.0,1.0),false,old.state.revision)}
            val exported=GeoJsonImport.parse(store.exportGeoJson().byteInputStream())
            assertEquals("DUPLICATE",store.importGeoJsonWithReceipt(exported).status)
            val fresh=GeoJsonImport.merge(MapJournal(MapState()),exported).state.pins[id]!!
            assertEquals(EvidenceStatus.UNKNOWN,fresh.evidence.coordinate)
            assertTrue(fresh.evidence.source!!.contains("owner-field-confirmation"))
            assertEquals(current.state.pins[id]!!.note,fresh.note)
        }finally{root.deleteRecursively()}
    }
    @Test fun rejectedImportReceiptDoesNotMutateMapData() {
        val root=java.nio.file.Files.createTempDirectory("goview-error").toFile()
        try {val store=MapStateStore(root);store.importGeoJson(batch());val state=store.load().state
            val receipt=store.recordImportFailure("Invalid coordinates")
            assertEquals("REJECTED",receipt.status);assertEquals(state,MapStateStore(root).load().state)
            assertEquals(receipt,store.load().updates.last())
        }finally{root.deleteRecursively()}
    }
}
