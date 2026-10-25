package com.big.gobrowser.browser

import com.big.gobrowser.transport.StationDiagnostics
import com.big.gobrowser.transport.StationResponse
import java.net.URI
import org.json.JSONObject

/** Keep verified transport facts when JSON or Live View validation fails. */
object BrowserResponse {
    fun allowedViewerUrl(url:String):Boolean = runCatching {
        val uri=URI(url)
        uri.scheme=="https" && uri.host=="live.browser.run"
    }.getOrDefault(false)

    fun parse(response:StationResponse,path:String):JSONObject = response.validate { body ->
        JSONObject(body).also {
            if(path=="/v1/view" && !allowedViewerUrl(it.optString("url")))
                throw IllegalStateException("LIVE_VIEW_UNAVAILABLE")
            if(it.has("error"))throw IllegalStateException(
                StationDiagnostics.safeCode(it.optString("error")) ?: "STATION_REQUEST_FAILED")
        }
    }
}
