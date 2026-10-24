package com.big.gobrowser.browser

import kotlin.math.abs
import kotlin.math.roundToInt

/** Translate a clearly vertical phone swipe to the existing bounded Cloudflare scroll action.
 * This pure function is also regression-tested without a network session.
 * A finger swipe UP means positive scrollY (the remote page moves DOWN).
 */
internal object RemoteSwipeScroll {
    fun delta(startX: Float, startY: Float, endX: Float, endY: Float, thresholdPx: Float): Int? {
        if (!startX.isFinite() || !startY.isFinite() || !endX.isFinite() ||
            !endY.isFinite() || !thresholdPx.isFinite() || thresholdPx <= 0f) return null
        val y = startY - endY
        val x = endX - startX
        if (abs(y) < thresholdPx || abs(y) <= abs(x) * 1.25f) return null
        return y.roundToInt().coerceIn(-1800, 1800).takeUnless { it == 0 }
    }
}
