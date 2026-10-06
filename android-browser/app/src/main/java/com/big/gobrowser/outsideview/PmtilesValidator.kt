package com.big.gobrowser.outsideview

import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

data class MapPackage(val file:File,val sha256:String,val attribution:String,val minZoom:Int,val maxZoom:Int,val bounds:Bounds,val vectorLayers:Set<String>)

object PmtilesValidator {
    private const val HEADER=127L
    private const val MAX_METADATA=4*1024*1024L
    fun inspect(file:File):MapPackage { require(file.isFile&&file.length()>=HEADER){"PMTiles file is truncated"};RandomAccessFile(file,"r").use{raf->val magic=ByteArray(7);raf.readFully(magic);require(String(magic,StandardCharsets.US_ASCII)=="PMTiles"){"invalid PMTiles magic"};val version=raf.readUnsignedByte();require(version==3||version==4){"unsupported PMTiles version"}};val metadata=metadata(file);require(metadata.size.toLong()<=MAX_METADATA){"metadata exceeds 4 MiB"};val json=runCatching{JSONObject(String(metadata,StandardCharsets.UTF_8))}.getOrElse{JSONObject()};val attribution=json.optString("attribution","").trim();require(attribution.isNotBlank()){"attribution required in package metadata"};val layers=mutableSetOf<String>();val layerArray=json.optJSONArray("vector_layers");if(layerArray!=null)for(i in 0 until layerArray.length())layers+=layerArray.getJSONObject(i).optString("id","").takeIf{it.isNotBlank()}?:"";require(layers.isNotEmpty()){"vector_layers required"};val min=json.optInt("minzoom",0);val max=json.optInt("maxzoom",14);require(min in 0..30&&max in min..30){"invalid zoom range"};val b=json.optJSONObject("bounds")?:JSONObject().put("west",-180.0).put("south",-85.051129).put("east",180.0).put("north",85.051129);val bounds=Bounds(b.getDouble("west"),b.getDouble("south"),b.getDouble("east"),b.getDouble("north"));return MapPackage(file,sha(file),attribution,min,max,bounds,layers)}
    private fun metadata(file:File):ByteArray { val side=File(file.parentFile,file.name+".json");if(side.isFile)return side.readBytes().also{require(it.size.toLong()<=MAX_METADATA){"metadata exceeds 4 MiB"}};RandomAccessFile(file,"r").use{raf->raf.seek(24);val offset=readLongLE(raf);val length=readLongLE(raf);require(length in 2..MAX_METADATA){"invalid metadata range"};require(offset>=HEADER&&offset+length<=file.length()){"metadata outside file"};raf.seek(offset);return ByteArray(length.toInt()).also{raf.readFully(it)}}}
    private fun readLongLE(raf:RandomAccessFile):Long{var v=0L;for(i in 0..7)v=v or ((raf.readUnsignedByte().toLong()) shl (i*8));return v}
    private fun sha(file:File):String{val md=MessageDigest.getInstance("SHA-256");file.inputStream().use{input->val buf=ByteArray(8192);var n=input.read(buf);while(n>=0){if(n>0)md.update(buf,0,n);n=input.read(buf)}};return md.digest().joinToString(""){"%02x".format(it)}}
}
