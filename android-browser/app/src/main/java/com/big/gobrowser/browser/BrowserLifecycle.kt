package com.big.gobrowser.browser

import android.app.Activity
import android.os.PowerManager

class BrowserLifecycle(
    private val activity: Activity,
    private val powerManager: PowerManager
) {
    fun isInteractive(): Boolean =
        !activity.isFinishing && !activity.isDestroyed && powerManager.isInteractive
}
