package com.big.gobrowser.browser

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime

/** Pass the provider's activity result back to Gecko, without reading or storing credentials. */
class GeckoActivityBridge(
    private val canLaunch: () -> Boolean,
    private val launch: (PendingIntent, Int) -> Unit
) : GeckoRuntime.ActivityDelegate {
    private var pending: GeckoResult<Intent>? = null

    override fun onStartActivityForResult(intent: PendingIntent): GeckoResult<Intent> {
        if (!canLaunch()) return GeckoResult.fromException(IllegalStateException("ACTIVITY_NOT_FOREGROUND"))
        if (pending != null) return GeckoResult.fromException(IllegalStateException("AUTHENTICATION_ALREADY_PENDING"))
        val result = GeckoResult<Intent>()
        pending = result
        try { launch(intent, REQUEST_CODE) }
        catch (error: Exception) { pending = null; result.completeExceptionally(error) }
        return result
    }

    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != REQUEST_CODE) return false
        val result = pending ?: return true
        pending = null
        if (resultCode == Activity.RESULT_OK && data != null) result.complete(data)
        else result.completeExceptionally(IllegalStateException("AUTHENTICATION_CANCELLED_OR_EMPTY"))
        return true
    }

    fun cancel() {
        val result = pending ?: return
        pending = null
        result.completeExceptionally(IllegalStateException("ACTIVITY_DESTROYED"))
    }

    companion object { const val REQUEST_CODE = 7301 }
}
