package com.big.gobrowser.outsideview

import android.content.Context
import android.net.Uri
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

class LocalMapPackageStore(private val context:Context){
    private val root get()=File(context.filesDir,"maps")
    private val activeFile get()=File(root,"active.pmtiles")
    fun import(uri:Uri):MapPackage{root.mkdirs();val staged=File(root,"incoming-${System.nanoTime()}.pmtiles");context.contentResolver.openInputStream(uri).use{input->requireNotNull(input){"cannot open map package"};staged.outputStream().use{out->input.copyTo(out,64*1024);out.fd.sync()}};val candidate=runCatching{PmtilesValidator.inspect(staged)}.getOrElse{staged.delete();throw it};val backup=File(root,"previous.pmtiles");if(activeFile.isFile)Files.move(activeFile.toPath(),backup.toPath(),StandardCopyOption.REPLACE_EXISTING);try{Files.move(staged.toPath(),activeFile.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING)}catch(e:Exception){if(backup.isFile)Files.move(backup.toPath(),activeFile.toPath(),StandardCopyOption.REPLACE_EXISTING);staged.delete();throw IllegalStateException("atomic map activation unavailable",e)};return candidate.copy(file=activeFile)}
    fun active():MapPackage?=if(!activeFile.isFile)null else runCatching{PmtilesValidator.inspect(activeFile)}.getOrNull()
}
