package com.big.gobrowser.outsideview

import java.io.File

/** Storage boundary; transaction ownership remains with MapStateStore. */
interface JournalBackend {
    fun read():String?
    fun initialize(payload:String,revision:Long,legacy:File?)
    fun write(payload:String,revision:Long)
}
