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
}
