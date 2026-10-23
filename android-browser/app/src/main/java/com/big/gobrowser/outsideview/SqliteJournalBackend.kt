package com.big.gobrowser.outsideview

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.security.MessageDigest
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Android platform SQLite, schema v1. No network or new dependency. Legacy files are never deleted. */
class SqliteJournalBackend(private val root:File,private val beforeCommit:()->Unit={}) : JournalBackend {
    private val file:File get() {
        val pointer=File(root,"goview.current")
        if(!pointer.exists())return File(root,"goview.sqlite")
        val name=pointer.readText()
        require(name.matches(Regex("goview-recovered-[a-f0-9-]+\\.sqlite"))){"Invalid database recovery pointer"}
        return File(root,name)
    }
    override fun recover(payload:String,revision:Long) {
        // Build a new database beside the damaged one, then switch a tiny atomic pointer.
        // The previous database and its sidecars remain untouched for forensic recovery.
        val id=java.util.UUID.randomUUID().toString()
        val staging=File(root,"recovery-build-$id")
        SqliteJournalBackend(staging,beforeCommit).initialize(payload,revision,null)
        val target=File(root,"goview-recovered-$id.sqlite")
        Files.move(File(staging,"goview.sqlite").toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE)
        val pointer=File(root,"goview.current.tmp")
        java.io.FileOutputStream(pointer).use {it.write(target.name.toByteArray(Charsets.UTF_8));it.fd.sync()}
        Files.move(pointer.toPath(),File(root,"goview.current").toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING)
    }
    private fun hash(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
    private fun open():SQLiteDatabase {
        check(root.isDirectory || root.mkdirs())
        val db=SQLiteDatabase.openOrCreateDatabase(file.path,null,android.database.DatabaseErrorHandler {
            // Android default corruption handling may delete the database; never use it for owner data.
            throw android.database.sqlite.SQLiteDatabaseCorruptException("GOVIEW database corrupt; original retained for explicit recovery")
        })
        try {
            db.execSQL("PRAGMA synchronous=FULL")
            require(db.version in 0..1){"Unsupported GOVIEW database schema; legacy data retained"}
            return db
        } catch(error:Throwable){db.close();throw error}
    }
    override fun read():String? {
        if(!file.exists())return null
        return open().use {db->
            if(db.version==0)return@use null
            readPayload(db)
        }
    }
    override fun initialize(payload:String,revision:Long,legacy:File?) {
        // Backup is fsynced and installed before SQLite activation. Never overwrite a previous backup.
        legacy?.takeIf {it.isFile}?.let {source->
            val backup=File(root,"journal.pre-sqlite-v1.json")
            if(backup.exists())check(backup.readBytes().contentEquals(source.readBytes())){"Legacy backup differs; migration stopped"}
            else {
                val temp=File(root,"journal.pre-sqlite-v1.tmp")
                java.io.FileOutputStream(temp).use {out->source.inputStream().use {it.copyTo(out)};out.fd.sync()}
                Files.move(temp.toPath(),backup.toPath(),StandardCopyOption.ATOMIC_MOVE)
            }
        }
        open().use {db->
            if(db.version==1){check(read()!=null);return}
            db.beginTransaction()
            try {
                db.execSQL("CREATE TABLE journal (singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL, byte_count INTEGER NOT NULL, sha256 TEXT NOT NULL)")
                db.execSQL("CREATE TABLE journal_chunks (sequence INTEGER PRIMARY KEY, payload BLOB NOT NULL)")
                put(db,payload,revision)
                db.version=1
                beforeCommit()
                db.setTransactionSuccessful()
            } finally {db.endTransaction()}
        }
    }
    override fun write(payload:String,revision:Long) {
        open().use {db->
            require(db.version==1){"GOVIEW database not initialized"}
            db.beginTransaction()
            try {put(db,payload,revision);beforeCommit();db.setTransactionSuccessful()} finally {db.endTransaction()}
        }
    }
    /** Cursor rows stay below 256 KiB, including multibyte text; no whole-document Cursor row. */
    private fun readPayload(db:SQLiteDatabase):String {
        val metadata=db.rawQuery("SELECT byte_count,sha256 FROM journal WHERE singleton=1",null).use {cursor->
            check(cursor.moveToFirst()){"GOVIEW database state missing"};cursor.getInt(0) to cursor.getString(1)
        }
        check(metadata.first>=0)
        val output=java.io.ByteArrayOutputStream()
        db.rawQuery("SELECT sequence,payload FROM journal_chunks ORDER BY sequence",null).use {cursor->
            var expected=0
            while(cursor.moveToNext()) {
                check(cursor.getInt(0)==expected++){"GOVIEW chunk missing"}
                val bytes=cursor.getBlob(1);check(bytes.size in 1..262144)
                check(output.size().toLong()+bytes.size<=metadata.first.toLong())
                output.write(bytes)
            }
        }
        val bytes=output.toByteArray()
        check(bytes.size==metadata.first && hash(bytes)==metadata.second){"GOVIEW database checksum mismatch"}
        return Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString()
    }
    private fun put(db:SQLiteDatabase,payload:String,revision:Long) {
        val bytes=payload.toByteArray(Charsets.UTF_8)
        val values=ContentValues().apply {put("singleton",1);put("revision",revision);put("byte_count",bytes.size);put("sha256",hash(bytes))}
        check(db.insertWithOnConflict("journal",null,values,SQLiteDatabase.CONFLICT_REPLACE)!=-1L){"GOVIEW SQLite write failed"}
        db.delete("journal_chunks",null,null)
        var offset=0;var sequence=0
        while(offset<bytes.size) {
            val end=minOf(offset+262144,bytes.size)
            val chunk=ContentValues().apply {put("sequence",sequence++);put("payload",bytes.copyOfRange(offset,end))}
            check(db.insertOrThrow("journal_chunks",null,chunk)!=-1L);offset=end
        }
        check(readPayload(db)==payload){"GOVIEW transaction readback mismatch"}
    }
}
