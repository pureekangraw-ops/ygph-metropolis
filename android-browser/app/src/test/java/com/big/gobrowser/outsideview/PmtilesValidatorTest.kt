package com.big.gobrowser.outsideview

import java.io.File
import java.io.FileOutputStream
import org.junit.Assert.*
import org.junit.Test

class PmtilesValidatorTest {
    @Test fun gzipMetadataIsReadFromTheArchive() {
        val metadata="{\"attribution\":\"owner map\",\"vector_layers\":[{\"id\":\"roads\"}],\"minzoom\":0,\"maxzoom\":14}"
        val encoded=java.io.ByteArrayOutputStream().also { b -> java.util.zip.GZIPOutputStream(b).use { it.write(metadata.toByteArray()) } }.toByteArray()
        val header=ByteArray(127); "PMTiles".toByteArray().copyInto(header);header[7]=3;header[97]=2
        java.nio.ByteBuffer.wrap(header).order(java.nio.ByteOrder.LITTLE_ENDIAN).putLong(24,127L).putLong(32,encoded.size.toLong())
        val f=File.createTempFile("map-gzip","pmtiles");f.writeBytes(header+encoded)
        try { assertEquals("owner map",PmtilesValidator.inspect(f).attribution) } finally { f.delete() }
    }

    @Test fun validHeaderUsesPackageMetadataAndReturnsSha(){val f=File.createTempFile("map","pmtiles");FileOutputStream(f).use{it.write("PMTiles".toByteArray());it.write(byteArrayOf(3));it.write(ByteArray(120))};File(f.parentFile,f.name+".json").writeText("{\"attribution\":\"TEST\",\"vector_layers\":[{\"id\":\"outside_pin\"}],\"minzoom\":1,\"maxzoom\":12}");val p=PmtilesValidator.inspect(f);assertEquals("TEST",p.attribution);assertEquals(setOf("outside_pin"),p.vectorLayers);assertEquals(64,p.sha256.length);f.delete();File(f.parentFile,f.name+".json").delete()}
    @Test(expected=IllegalArgumentException::class) fun truncatedPackageRejected(){val f=File.createTempFile("map","pmtiles");f.writeText("bad");PmtilesValidator.inspect(f)}
}
