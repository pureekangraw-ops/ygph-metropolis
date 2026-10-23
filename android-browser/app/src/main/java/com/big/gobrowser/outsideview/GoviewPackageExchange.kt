package com.big.gobrowser.outsideview

/** Narrow proposed adapter: transport cannot approve or commit local map state. No credentials or URL. */
data class PackageTransferReceipt(val id:String,val operation:String,val correlationId:String,val status:String,val environment:String,val error:String?=null)
data class DownloadedProposal(val receipt:PackageTransferReceipt,val content:String?=null)
interface GoviewPackageExchange {
    fun uploadSelected(snapshot:SelectedSnapshot):PackageTransferReceipt
    fun downloadProposal(sourceCaptureId:String):DownloadedProposal
}
object UnconfiguredGoviewExchange:GoviewPackageExchange {
    private fun blocked(operation:String,capture:String)=PackageTransferReceipt(java.util.UUID.randomUUID().toString(),operation,capture,"BLOCKED","NOT_CONFIGURED","No deployed and authorized durable package contract")
    override fun uploadSelected(snapshot:SelectedSnapshot)=blocked("UPLOAD",snapshot.captureId)
    override fun downloadProposal(sourceCaptureId:String)=DownloadedProposal(blocked("DOWNLOAD",sourceCaptureId))
}
