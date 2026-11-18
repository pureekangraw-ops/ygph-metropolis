package com.big.gobrowser.outsideview

import android.content.Context
import com.big.gobrowser.transport.AndroidDeviceCredentialStore
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.util.concurrent.TimeUnit

/** Explicit selected-data exchange only. Separate credentials; no fallback to GO or Direct keys. */
class GoviewTransferClient(context:Context):GoviewTransferTransport {
    private val upload=AndroidDeviceCredentialStore(context,"goview-transfer-upload-key","goview-transfer-upload")
    private val read=AndroidDeviceCredentialStore(context,"goview-transfer-read-key","goview-transfer-read")
    private val client=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .connectTimeout(10,TimeUnit.SECONDS).readTimeout(20,TimeUnit.SECONDS).writeTimeout(20,TimeUnit.SECONDS).build()
    fun saveCredentials(uploadToken:String,readToken:String) {
        require(uploadToken!=readToken)
        for(token in listOf(uploadToken,readToken))require(token.length in 20..512&&token.all {it>' '&&it<'\u007f'})
        upload.save(uploadToken);read.save(readToken)
        check(upload.load()==uploadToken&&read.load()==readToken)
    }
    override fun put(envelope:GoviewTransfer):String {require(envelope.operation=="SNAPSHOT");return call(envelope.transferId,"PUT",envelope.json(),true)}
    override fun get(transferId:String,uploadReadback:Boolean)=call(transferId,"GET",null,uploadReadback)
    override fun receipt(transferId:String,body:String)=call(transferId,"POST",body,false,true)
    private fun call(id:String,method:String,body:String?,uploadRole:Boolean,receipt:Boolean=false):String {
        require(GoviewTransfer.validId(id))
        val token=(if(uploadRole)upload else read).load()?:error("TRANSFER_NOT_CONFIGURED")
        val url="https://goview-package-bridge.pureekangraw.workers.dev/v1/transfers/"+id+if(receipt)"/receipt" else ""
        val request=Request.Builder().url(url).header("Authorization","Bearer "+token).header("Cache-Control","no-store")
            .method(method,body?.toRequestBody("application/json; charset=utf-8".toMediaType())).build()
        client.newCall(request).execute().use {response ->
            if(!response.isSuccessful)throw DirectHttpFailure(response.code)
            return (response.body?:error("TRANSFER_EMPTY_RESPONSE")).byteStream().use {input ->
                val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
                while(true){val n=input.read(buffer);if(n<0)break;require(out.size()+n<=GoviewTransfer.MAX_ENVELOPE);out.write(buffer,0,n)}
                Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(out.toByteArray())).toString()
            }
        }
    }
}
