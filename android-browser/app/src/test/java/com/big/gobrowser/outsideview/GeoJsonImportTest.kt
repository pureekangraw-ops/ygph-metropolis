package com.big.gobrowser.outsideview

import java.io.File
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class GeoJsonImportTest {
    private fun fixture(id: Int = 1, lon: String = "10.0") = """{"type":"FeatureCollection","name":"SYNTHETIC","features":[{"type":"Feature","id":$id,"geometry":{"type":"Point","coordinates":[$lon,20]},"properties":{"name":"<img src=x onerror=alert(1)>","coordinate_status":"candidate"}}]}"""
    @Test fun importRenderPersistReloadReadback() {
        val root = java.nio.file.Files.createTempDirectory("geojson-test").toFile()
        try {
            val store = MapStateStore(root)
            val batch = GeoJsonImport.parse(fixture().byteInputStream())
            store.importGeoJson(batch)
            val reloaded = MapStateStore(root).load().state
            assertEquals(1, reloaded.pins.size)
            val pin = reloaded.pins.values.single()
            assertEquals(EvidenceStatus.UNKNOWN, pin.evidence.coordinate)
            assertTrue(pin.note!!.contains("candidate"))
            assertEquals("<img src=x onerror=alert(1)>", MapFeatureBuilder.build(reloaded).pins.single().properties.getString("label"))
            assertEquals(1L, reloaded.revision)
            store.importGeoJson(batch)
            assertEquals(reloaded, store.load().state)
            store.importGeoJson(GeoJsonImport.parse(fixture(2).byteInputStream()))
            assertEquals(2, store.load().state.pins.size) // same coordinate, different source IDs
            val before = File(root,"journal.json").readBytes()
            assertThrows(IllegalArgumentException::class.java) { store.importGeoJson(GeoJsonImport.parse(fixture(lon="11").byteInputStream())) }
            assertArrayEquals(before, File(root,"journal.json").readBytes())
        } finally { root.deleteRecursively() }
    }
    @Test fun invalidBatchAndLimitsFailBeforeMutation() {
        for (lon in listOf("181", "null", "\"10\"")) assertThrows(Exception::class.java) { GeoJsonImport.parse(fixture(lon=lon).byteInputStream()) }
        assertThrows(Exception::class.java) { GeoJsonImport.parse(" ".repeat(GeoJsonImport.MAX_BYTES+1).byteInputStream()) }
        val json = JSONObject(fixture()); val features = json.getJSONArray("features"); features.put(features.getJSONObject(0))
        assertThrows(Exception::class.java) { GeoJsonImport.parse(json.toString().byteInputStream()) }
    }
    @Test fun corruptJournalIsNotOverwritten() {
        val root = java.nio.file.Files.createTempDirectory("geojson-corrupt").toFile()
        try { val file=File(root,"journal.json"); file.writeText("broken")
            assertThrows(Exception::class.java) { MapStateStore(root).importGeoJson(GeoJsonImport.parse(fixture().byteInputStream())) }
            assertEquals("broken",file.readText())
        } finally { root.deleteRecursively() }
    }
    @Test fun unrelatedDataAndPendingRenderArePreserved() {
        val original=Pin("owner:1","Owner",Point(1.0,2.0),"",Evidence())
        val journal=MapJournal(MapState(pins=mapOf(original.id to original),notes=mapOf("owner:1" to "keep")))
        val batch=GeoJsonImport.parse(fixture().byteInputStream())
        val merged=GeoJsonImport.merge(journal,batch)
        assertEquals(original,merged.state.pins[original.id]);assertEquals(journal.state.notes,merged.state.notes)
        assertThrows(Exception::class.java) {GeoJsonImport.merge(journal.copy(pending=PendingRender(MapCommand("pending",MapAction.CLEAR,scope="pins"),0,"token")),batch)}
    }
    @Test fun failedDiskWriteLeavesOriginalBytes() {
        val root=java.nio.file.Files.createTempDirectory("geojson-disk").toFile()
        try {
            val store=MapStateStore(root);store.importGeoJson(GeoJsonImport.parse(fixture().byteInputStream()))
            val before=File(root,"journal.json").readBytes()
            File(root,"journal.json.tmp").mkdir()
            assertThrows(Exception::class.java) {store.importGeoJson(GeoJsonImport.parse(fixture(2).byteInputStream()))}
            assertArrayEquals(before,File(root,"journal.json").readBytes())
        } finally {root.deleteRecursively()}
    }

    @Test fun equivalentPropertyKeyOrderIsIdempotent() {
        val a=fixture().replace("\"coordinate_status\":\"candidate\"", "\"nested\":{\"a\":1,\"b\":2},\"coordinate_status\":\"candidate\"")
        val b=a.replace("{\"a\":1,\"b\":2}","{\"b\":2,\"a\":1}")
        assertEquals(GeoJsonImport.parse(a.byteInputStream()),GeoJsonImport.parse(b.byteInputStream()))
    }
    @Test fun malformedVersionPropertiesAndAltitudeAreRejected() {
        for(version in listOf("1.5","2","\"1\"","null")) {
            val json=fixture().replace("\"type\":\"FeatureCollection\"","\"schemaVersion\":$version,\"type\":\"FeatureCollection\"")
            assertThrows(Exception::class.java){GeoJsonImport.parse(json.byteInputStream())}
        }
        for(properties in listOf("[]","42","\"invalid\"")) {
            val json=JSONObject(fixture());json.getJSONArray("features").getJSONObject(0).put("properties",org.json.JSONTokener(properties).nextValue())
            assertThrows(Exception::class.java){GeoJsonImport.parse(json.toString().byteInputStream())}
        }
        assertThrows(Exception::class.java){GeoJsonImport.parse(fixture().replace("10.0,20","10.0,20,5").byteInputStream())}
    }
    @Test fun savedDataSurvivesCameraAndStyleFailuresAndRetryIsIdempotent() {
        val root=java.nio.file.Files.createTempDirectory("geojson-present").toFile()
        try {
            val store=MapStateStore(root);val batch=GeoJsonImport.parse(fixture().byteInputStream())
            assertEquals(1,store.importGeoJson(batch))
            var reloaded=false
            assertFalse(GeoJsonImport.present({error("camera failed")},{reloaded=true}))
            assertTrue(reloaded)
            assertFalse(GeoJsonImport.present({},{error("style failed")}))
            assertEquals(batch.pins.toSet(),MapStateStore(root).load().state.pins.values.toSet())
            assertEquals(0,store.importGeoJson(batch))
        } finally {root.deleteRecursively()}
    }
    @Test fun commandReadsAfterImportTransactionInsteadOfOverwritingIt() {
        val root=java.nio.file.Files.createTempDirectory("geojson-concurrent").toFile()
        try {
            val store=MapStateStore(root)
            val renderer=object:MapRenderer {
                override val foregroundReady=false
                override val styleGeneration=0L
                override fun render(request:RenderRequest,callback:(RenderConfirmation)->Unit) {}
                override fun cancel() {}
            }
            val executor=MapCommandExecutor(MapStateStore(File(root,".")),renderer,ExecutionScope.TEST)
            val started=java.util.concurrent.CountDownLatch(1)
            var failure:Throwable?=null
            val thread=Thread {started.countDown();try {executor.submit(MapCommand("owner-note",MapAction.NOTE,MapTarget("owner","map"),note="preserve"))}catch(e:Throwable){failure=e}}
            synchronized(store.transactionLock) {
                thread.start();assertTrue(started.await(2,java.util.concurrent.TimeUnit.SECONDS))
                val deadline=System.nanoTime()+2_000_000_000L
                while(thread.state!=Thread.State.BLOCKED && System.nanoTime()<deadline)Thread.yield()
                assertEquals(Thread.State.BLOCKED,thread.state)
                store.importGeoJson(GeoJsonImport.parse(fixture().byteInputStream()))
            }
            thread.join(2000);assertFalse(thread.isAlive);assertNull(failure)
            assertEquals(1,store.load().state.pins.size)
            assertEquals("preserve",store.load().state.notes["owner"])
        } finally {root.deleteRecursively()}
    }

    @Test fun oldScreenImportAndRecreatedScreenShareOneJournalTransaction() {
        val root=java.nio.file.Files.createTempDirectory("geojson-recreation").toFile()
        val oldScreen=MapStateStore(root)
        val recreated=MapStateStore(File(root,"."))
        assertSame(oldScreen.transactionLock,recreated.transactionLock)
        val collection=JSONObject(fixture());val features=org.json.JSONArray()
        for(id in 1..39)features.put(JSONObject(fixture(id)).getJSONArray("features").getJSONObject(0))
        collection.put("features",features)
        val batch=GeoJsonImport.parse(collection.toString().byteInputStream())
        oldScreen.commit(MapJournal(MapState(notes=mapOf("owner-note" to "keep"))))
        val importEntered=java.util.concurrent.CountDownLatch(1)
        val finishImport=java.util.concurrent.CountDownLatch(1)
        val failures=java.util.concurrent.ConcurrentLinkedQueue<Throwable>()
        var recreatedSnapshot:MapJournal?=null
        val oldWorker=Thread {
            try {synchronized(oldScreen.transactionLock) {
                importEntered.countDown()
                check(finishImport.await(3,java.util.concurrent.TimeUnit.SECONDS))
                oldScreen.importGeoJson(batch)
            }}catch(error:Throwable){failures.add(error)}
        }
        val newWorker=Thread {
            try {
                recreatedSnapshot=recreated.prepareScreen()
                // An old revision's render callback must not write over imported records.
                check(!recreated.confirmScreen(RenderConfirmation("screen-old",0,1,"screen",emptySet())))
                check(recreated.confirmScreen(RenderConfirmation("screen-new",1,1,"screen",emptySet())))
            }catch(error:Throwable){failures.add(error)}
        }
        try {
            oldWorker.start();assertTrue(importEntered.await(2,java.util.concurrent.TimeUnit.SECONDS))
            newWorker.start()
            val deadline=System.nanoTime()+2_000_000_000L
            while(newWorker.state!=Thread.State.BLOCKED && System.nanoTime()<deadline)Thread.yield()
            assertEquals(Thread.State.BLOCKED,newWorker.state)
            finishImport.countDown();oldWorker.join(3000);newWorker.join(3000)
            assertFalse(oldWorker.isAlive);assertFalse(newWorker.isAlive);assertTrue(failures.toString(),failures.isEmpty())
            assertEquals(39,recreatedSnapshot!!.state.pins.size)
            val readback=MapStateStore(root).load()
            assertEquals(batch.pins.toSet(),readback.state.pins.values.toSet())
            assertEquals("keep",readback.state.notes["owner-note"])
            assertEquals(1L,readback.renderedRevision)
            assertFalse(File(root,"journal.json.tmp").exists())
        } finally {finishImport.countDown();oldWorker.join(3000);newWorker.join(3000);root.deleteRecursively()}
    }

}
