package com.big.gobrowser.outsideview

import java.io.File
import java.io.FileOutputStream
import org.junit.Assert.*
import org.junit.Test

class PmtilesValidatorTest {
    @Test fun validHeaderUsesPackageMetadataAndReturnsSha(){val f=File.createTempFile("map","pmtiles");FileOutputStream(f).use{it.write("PMTiles".toByteArray());it.write(byteArrayOf(3));it.write(ByteArray(120))};File(f.parentFile,f.name+".json").writeText("{\"attribution\":\"TEST\",\"vector_layers\":[{\"id\":\"outside_pin\"}],\"minzoom\":1,\"maxzoom\":12}");val p=PmtilesValidator.inspect(f);assertEquals("TEST",p.attribution);assertEquals(setOf("outside_pin"),p.vectorLayers);assertEquals(64,p.sha256.length);f.delete();File(f.parentFile,f.name+".json").delete()}
    @Test(expected=IllegalArgumentException::class) fun truncatedPackageRejected(){val f=File.createTempFile("map","pmtiles");f.writeText("bad");PmtilesValidator.inspect(f)}
}
