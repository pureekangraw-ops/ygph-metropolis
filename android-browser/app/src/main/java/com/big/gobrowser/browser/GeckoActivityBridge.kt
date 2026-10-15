package com.big.gobrowser.browser

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime

/** Pass the provider's activity result back to Gecko, without reading or storing credentials. */
class GeckoActivityBridge(
    private val canLaunch: () -> Boolean,
    private val onStatus: (String) -> Unit = {},
    private val launch: (PendingIntent, Int) -> Unit
) : GeckoRuntime.ActivityDelegate {
    private var pending: GeckoResult<Intent>? = null

    override fun onStartActivityForResult(intent: PendingIntent): GeckoResult<Intent> {
        if (!canLaunch()) { onStatus("ACTIVITY_NOT_FOREGROUND"); return GeckoResult.fromException(IllegalStateException("ACTIVITY_NOT_FOREGROUND")) }
        if (pending != null) { onStatus("AUTHENTICATION_ALREADY_PENDING"); return GeckoResult.fromException(IllegalStateException("AUTHENTICATION_ALREADY_PENDING")) }
        val result = GeckoResult<Intent>()
        pending = result
        onStatus("PROVIDER_REQUESTED")
        try { launch(intent, REQUEST_CODE); onStatus("PROVIDER_LAUNCHED") }
        catch (error: Exception) { pending = null; onStatus("PROVIDER_LAUNCH_FAILED"); result.completeExceptionally(error) }
        return result
    }

    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CODE) return false
        val result = pending ?: return true
        pending = null
        if (resultCode == Activity.RESULT_OK && data != null) { onStatus("PROVIDER_RESULT_OK"); result.complete(data) }
        else { onStatus("PROVIDER_CANCELLED_OR_EMPTY"); result.completeExceptionally(IllegalStateException("AUTHENTICATION_CANCELLED_OR_EMPTY")) }
        return true
    }

    fun cancel() {
        val result = pending ?: return
        pending = null
        onStatus("ACTIVITY_DESTROYED")
        result.completeExceptionally(IllegalStateException("ACTIVITY_DESTROYED"))
    }

    companion object { const val REQUEST_CODE = 7301 }
}
