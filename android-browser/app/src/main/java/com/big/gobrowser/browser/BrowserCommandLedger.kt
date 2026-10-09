package com.big.gobrowser.browser
import com.big.gobrowser.control.Command
/** One admission per ID, including while dispatch/readback or receipt delivery is in flight. */
class BrowserCommandLedger(private val capacity:Int=1024) {
    private val admitted=linkedMapOf<String,Command>()
    fun admit(command:Command):String? {
        admitted[command.commandId]?.let {return if(it==command)"DUPLICATE_COMMAND" else "COMMAND_ID_PAYLOAD_CHANGED"}
        if(admitted.size>=capacity)return "COMMAND_LEDGER_FULL"
        admitted[command.commandId]=command
        return null
    }
    fun clear()=admitted.clear()
}
