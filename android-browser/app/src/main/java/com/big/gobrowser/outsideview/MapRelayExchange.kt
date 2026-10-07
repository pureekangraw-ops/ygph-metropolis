package com.big.gobrowser.outsideview

/** Preserve the server capture that admitted commands until native execution consumes them. */
object MapRelayExchange {
    fun <T> run(hasCapture:Boolean,pendingReceipt:Boolean,ensureActive:()->Unit,poll:()->List<T>,publish:()->Unit,receipt:()->Unit):List<T> {
        if(pendingReceipt){ensureActive();publish();ensureActive();receipt();return emptyList()}
        if(hasCapture){ensureActive();val commands=poll();if(commands.isNotEmpty())return commands;ensureActive();publish();return emptyList()}
        ensureActive();publish();ensureActive();return poll()
    }
}
