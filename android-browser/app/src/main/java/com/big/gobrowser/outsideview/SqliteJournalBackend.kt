package com.big.gobrowser.outsideview

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.security.MessageDigest
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Android platform SQLite, schema v1. No network or new dependency. Legacy files are never deleted. */
class SqliteJournalBackend(private val root:File,private val beforeCommit:()->Unit={}) : JournalBackend {
    private val file get()=File(root,"goview.sqlite")
    private fun hash(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
    private fun open():SQLiteDatabase {
        check(root.isDirectory || root.mkdirs())
        val db=SQLiteDatabase.openOrCreateDatabase(file,null)
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
            db.rawQuery("SELECT payload,sha256 FROM journal WHERE singleton=1",null).use {cursor->
                check(cursor.moveToFirst()){"GOVIEW database state missing"}
                val payload=cursor.getString(0)
                check(hash(payload.toByteArray(Charsets.UTF_8))==cursor.getString(1)){"GOVIEW database checksum mismatch"}
                payload
            }
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
                db.execSQL("CREATE TABLE journal (singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, sha256 TEXT NOT NULL)")
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
    private fun put(db:SQLiteDatabase,payload:String,revision:Long) {
        val values=ContentValues().apply {put("singleton",1);put("revision",revision);put("payload",payload);put("sha256",hash(payload.toByteArray(Charsets.UTF_8)))}
        check(db.insertWithOnConflict("journal",null,values,SQLiteDatabase.CONFLICT_REPLACE)!=-1L){"GOVIEW SQLite write failed"}
        db.rawQuery("SELECT payload FROM journal WHERE singleton=1",null).use {cursor->check(cursor.moveToFirst() && cursor.getString(0)==payload){"GOVIEW transaction readback mismatch"}}
    }
}
