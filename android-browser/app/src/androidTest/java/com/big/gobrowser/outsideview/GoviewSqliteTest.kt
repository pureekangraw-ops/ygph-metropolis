package com.big.gobrowser.outsideview

import android.database.sqlite.SQLiteDatabase
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Synthetic copies only: never opens the app's real outside-view directory. */
@RunWith(AndroidJUnit4::class)
class GoviewSqliteTest {
    private fun isolated(test:(File)->Unit) {
        val root=File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir,"goview-sqlite-${System.nanoTime()}")
        try {root.mkdirs();test(root)}finally{root.deleteRecursively()}
    }
    private fun seed(root:File):MapJournal {
        val pin=Pin("synthetic","Synthetic",Point(10.0,20.0),"",Evidence(EvidenceStatus.VERIFIED,"owner-field-confirmation",123),note="keep")
        val journal=MapJournal(MapState(pins=mapOf(pin.id to pin),notes=mapOf("unrelated" to "preserve"),revision=7))
        MapStateStore(root).commit(journal)
        return journal
    }
    private fun fails(block:()->Unit) {assertTrue(runCatching(block).isFailure)}
    @Test fun migrationPreservesExactLegacyBackupAndReopensIdempotently()=isolated {root->
        val original=seed(root);val legacy=File(root,"journal.json").readBytes()
        val store=MapStateStore(root,SqliteJournalBackend(root))
        assertEquals(original,store.load())
        assertArrayEquals(legacy,File(root,"journal.pre-sqlite-v1.json").readBytes())
        store.commit(original.copy(state=original.state.copy(revision=8,notes=original.state.notes+("new" to "saved"))))
        val fresh=MapStateStore(root,SqliteJournalBackend(root)).load()
        assertEquals(8L,fresh.state.revision);assertEquals("preserve",fresh.state.notes["unrelated"])
        assertEquals(original.state.pins,fresh.state.pins)
        assertEquals(fresh,MapStateStore(root,SqliteJournalBackend(root)).load())
        assertArrayEquals(legacy,File(root,"journal.json").readBytes())
        assertArrayEquals(legacy,File(root,"journal.pre-sqlite-v1.json").readBytes())
    }
    @Test fun interruptedMigrationRollsBackAndRetryKeepsLegacy()=isolated {root->
        val original=seed(root);val legacy=File(root,"journal.json").readBytes()
        fails {MapStateStore(root,SqliteJournalBackend(root){error("synthetic before commit")}).load()}
        assertArrayEquals(legacy,File(root,"journal.json").readBytes())
        SQLiteDatabase.openOrCreateDatabase(File(root,"goview.sqlite"),null).use {assertEquals(0,it.version)}
        assertEquals(original,MapStateStore(root,SqliteJournalBackend(root)).load())
    }
    @Test fun failedWriteRetainsPreviouslyCommittedReadback()=isolated {root->
        val original=seed(root);MapStateStore(root,SqliteJournalBackend(root)).load()
        fails {MapStateStore(root,SqliteJournalBackend(root){error("synthetic write failure")}).commit(original.copy(state=original.state.copy(revision=9,pins=emptyMap())))}
        assertEquals(original,MapStateStore(root,SqliteJournalBackend(root)).load())
    }
    @Test fun corruptLegacyAndFutureSchemaFailClosed()=isolated {root->
        File(root,"journal.json").writeText("corrupt synthetic")
        fails {MapStateStore(root,SqliteJournalBackend(root)).load()}
        assertFalse(File(root,"goview.sqlite").exists())
        assertEquals("corrupt synthetic",File(root,"journal.json").readText())
        SQLiteDatabase.openOrCreateDatabase(File(root,"goview.sqlite"),null).use {it.version=2}
        fails {MapStateStore(root,SqliteJournalBackend(root)).load()}
        SQLiteDatabase.openOrCreateDatabase(File(root,"goview.sqlite"),null).use {assertEquals(2,it.version)}
    }
    @Test fun checksumFailureNeverFallsBackToOldLegacyState()=isolated {root->
        seed(root);MapStateStore(root,SqliteJournalBackend(root)).load()
        SQLiteDatabase.openOrCreateDatabase(File(root,"goview.sqlite"),null).use {it.execSQL("UPDATE journal_chunks SET payload=X'7B7D' WHERE sequence=0")}
        fails {MapStateStore(root,SqliteJournalBackend(root)).load()}
        assertTrue(File(root,"journal.pre-sqlite-v1.json").isFile)
    }
    @Test fun recreatedStoreSharesTransactionWithOldWorker()=isolated {root->
        seed(root)
        val old=MapStateStore(root,SqliteJournalBackend(root));val recreated=MapStateStore(root,SqliteJournalBackend(root))
        val started=java.util.concurrent.CountDownLatch(1)
        val error=java.util.concurrent.atomic.AtomicReference<Throwable>()
        val worker=Thread {try {synchronized(old.transactionLock){val j=old.load();started.countDown();Thread.sleep(50);old.commit(j.copy(state=j.state.copy(notes=j.state.notes+("old" to "committed")),renderedRevision=-1))}}catch(t:Throwable){error.set(t);started.countDown()}}
        worker.start();assertTrue(started.await(5,java.util.concurrent.TimeUnit.SECONDS))
        recreated.prepareScreen();worker.join(5000);assertFalse(worker.isAlive);assertNull(error.get())
        val final=MapStateStore(root,SqliteJournalBackend(root)).load()
        assertEquals("committed",final.state.notes["old"]);assertEquals(1,final.state.pins.size)
    }
    @Test fun largeMultibyteJournalMigratesReopensAndRollsBackWithoutCursorOverflow()=isolated {root->
        val base=seed(root)
        val pins=(0 until 200).associate {i->val p=base.state.pins.values.single().copy(id="synthetic-$i",note="ก".repeat(8192));p.id to p}
        val large=base.copy(state=base.state.copy(pins=pins))
        MapStateStore(root).commit(large)
        val legacy=File(root,"journal.json").readBytes();assertTrue(legacy.size>2*1024*1024)
        fails {MapStateStore(root,SqliteJournalBackend(root){error("large migration rollback")}).load()}
        assertArrayEquals(legacy,File(root,"journal.json").readBytes())
        assertEquals(large,MapStateStore(root,SqliteJournalBackend(root)).load())
        assertEquals(large,MapStateStore(root,SqliteJournalBackend(root)).load())
        fails {MapStateStore(root,SqliteJournalBackend(root){error("large update rollback")}).commit(base)}
        assertEquals(large,MapStateStore(root,SqliteJournalBackend(root)).load())
        assertArrayEquals(legacy,File(root,"journal.pre-sqlite-v1.json").readBytes())
    }

    @Test fun delayedOldScreenParseAndRecreatedScreenWriteRetainBothRecords()=isolated {root->
        seed(root)
        val old=MapStateStore(root,SqliteJournalBackend(root));val recreated=MapStateStore(root,SqliteJournalBackend(root))
        val started=java.util.concurrent.CountDownLatch(1);val resume=java.util.concurrent.CountDownLatch(1)
        val failure=java.util.concurrent.atomic.AtomicReference<Throwable>()
        val raw="""{"type":"FeatureCollection","features":[{"type":"Feature","id":"delayed","geometry":{"type":"Point","coordinates":[11,21]},"properties":{"name":"Synthetic delayed"}}]}""".toByteArray()
        val input=object:java.io.ByteArrayInputStream(raw) {
            var first=true
            override fun read(buffer:ByteArray,offset:Int,length:Int):Int {
                if(first){first=false;started.countDown();check(resume.await(5,java.util.concurrent.TimeUnit.SECONDS))}
                return super.read(buffer,offset,length)
            }
        }
        val worker=Thread {try {val batch=GeoJsonImport.parse(input);old.approveUpdate(old.previewUpdate(batch,"synthetic-old-screen"))}catch(t:Throwable){failure.set(t)}}
        worker.start();assertTrue(started.await(5,java.util.concurrent.TimeUnit.SECONDS))
        recreated.prepareScreen()
        synchronized(recreated.transactionLock){val j=recreated.load();recreated.commit(j.copy(state=j.state.copy(notes=j.state.notes+("recreated" to "retained"),revision=j.state.revision+1)))}
        resume.countDown();worker.join(10000);assertFalse(worker.isAlive);assertNull(failure.get())
        val readback=MapStateStore(root,SqliteJournalBackend(root)).load()
        assertEquals(2,readback.state.pins.size);assertEquals("retained",readback.state.notes["recreated"])
        assertEquals("preserve",readback.state.notes["unrelated"])
    }

    @Test fun explicitRecoveryFromBrokenDatabasePreservesOriginalAndSurvivesInterruptedAttempt()=isolated {root->
        val original=seed(root);val store=MapStateStore(root,SqliteJournalBackend(root));store.load()
        val backup=store.createBackup();val backupBytes=File(root,"backups/$backup").readBytes()
        val database=File(root,"goview.sqlite");database.writeText("damaged synthetic sqlite header")
        fails {store.load()}
        val failing=MapStateStore(root,SqliteJournalBackend(root){error("interrupted synthetic recovery")})
        fails {failing.approveRecovery(failing.previewRecovery(backup))}
        assertEquals("damaged synthetic sqlite header",database.readText());assertFalse(File(root,"goview.current").exists())
        assertArrayEquals(backupBytes,File(root,"backups/$backup").readBytes())
        val receipt=store.approveRecovery(store.previewRecovery(backup))
        assertEquals("RECOVERED",receipt.status);assertTrue(receipt.readbackVerified)
        assertEquals("damaged synthetic sqlite header",database.readText())
        assertEquals(original.state.pins,MapStateStore(root,SqliteJournalBackend(root)).load().state.pins)
        assertArrayEquals(backupBytes,File(root,"backups/$backup").readBytes())
    }

}
