package com.big.gobrowser.lyra

import java.net.URI
import org.json.JSONObject

data class ModelConfiguration(val endpoint:String,val model:String) {
    init {
        val u=URI(endpoint)
        require(u.scheme=="https" && !u.host.isNullOrBlank() && u.userInfo==null && u.fragment==null && u.rawQuery==null){"Use an HTTPS endpoint without credentials or query"}
        require(model.isNotBlank() && model.length<=200)
    }
    fun encode()=JSONObject().put("endpoint",endpoint).put("model",model).toString()
    companion object { fun decode(raw:String):ModelConfiguration {val j=JSONObject(raw);return ModelConfiguration(j.getString("endpoint"),j.getString("model"))} }
}
