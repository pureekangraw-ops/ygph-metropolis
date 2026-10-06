package com.big.gobrowser.outsideview

import android.content.Context
import android.net.Uri
import java.io.File

class LocalMapPackageStore(private val context: Context) {
    private val root get() = File(context.filesDir,"maps")
    private val activeFile get() = File(root,"active.pmtiles")
    fun import(uri: Uri): MapPackage {
        root.mkdirs(); val staged=File(root,"incoming-${System.nanoTime()}.pmtiles")
        context.contentResolver.openInputStream(uri).use { input -> requireNotNull(input) { "cannot open map package" }; staged.outputStream().use { out -> input.copyTo(out, 64*1024) } }
        val sidecar=File(staged.parentFile,staged.name+".json"); sidecar.writeText("{\"attribution\":\"Local PMTiles\"}")
        val packageInfo=PmtilesValidator.inspect(staged); val target=activeFile
        if (target.exists()) File(root,"previous.pmtiles").delete().also { target.copyTo(File(root,"previous.pmtiles"),true) }
        staged.copyTo(target,true); sidecar.copyTo(File(root,"active.pmtiles.json"),true); staged.delete(); sidecar.delete()
        return PmtilesValidator.inspect(target)
    }
    fun active(): MapPackage? = if (!activeFile.isFile) null else runCatching { PmtilesValidator.inspect(activeFile) }.getOrNull()
}
