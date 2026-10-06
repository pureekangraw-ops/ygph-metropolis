package com.big.gobrowser.outsideview

import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest

data class MapPackage(val file: File, val sha256: String, val attribution: String, val minZoom: Int, val maxZoom: Int, val bounds: Bounds, val vectorLayers: Set<String>)

object PmtilesValidator {
    private const val HEADER = 127L
    fun inspect(file: File): MapPackage {
        require(file.isFile && file.length() >= HEADER) { "PMTiles file is truncated" }
        RandomAccessFile(file,"r").use { raf ->
            val magic=ByteArray(7); raf.readFully(magic); require(String(magic,Charsets.US_ASCII)=="PMTiles") { "invalid PMTiles magic" }
            val version=raf.readUnsignedByte(); require(version in 3..4) { "unsupported PMTiles version" }
        }
        val attribution = File(file.parentFile, file.name + ".json").takeIf { it.isFile }?.readText()?.let { Regex("\\\"attribution\\\"\\s*:\\s*\\\"([^\\\"]*)").find(it)?.groupValues?.get(1) }.orEmpty()
        require(attribution.isNotBlank()) { "attribution required" }
        return MapPackage(file,sha(file),attribution,0,14,Bounds(-180.0,-85.051129,180.0,85.051129),setOf("place","outside_zone","outside_grid","outside_pin"))
    }
    private fun sha(file: File): String { val md=MessageDigest.getInstance("SHA-256"); file.inputStream().use { input -> val buf=ByteArray(8192); var n=input.read(buf); while(n>=0){if(n>0)md.update(buf,0,n);n=input.read(buf)} }; return md.digest().joinToString("") { "%02x".format(it) } }
}
