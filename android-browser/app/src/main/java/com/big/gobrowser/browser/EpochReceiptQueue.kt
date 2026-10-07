package com.big.gobrowser.browser
import com.big.gobrowser.control.Receipt
/** Revoke retires unsent receipts; callbacks from that epoch cannot refill the outbox. */
class EpochReceiptQueue(private val capacity:Int=100) {
    private var epoch=0L
    private val items=java.util.ArrayDeque<Receipt>()
    fun revoke(nextEpoch:Long){require(nextEpoch>=epoch);epoch=nextEpoch;items.clear()}
    fun enqueue(generation:Long,receipt:Receipt):Boolean {
        if(generation!=epoch||items.size>=capacity||items.any {it.commandId==receipt.commandId})return false
        items.addLast(receipt);return true
    }
    fun toList():List<Receipt> = items.toList()
    fun remove(receipt:Receipt)=items.remove(receipt)
    fun clear()=items.clear()
}
