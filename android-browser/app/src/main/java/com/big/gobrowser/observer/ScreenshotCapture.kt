package com.big.gobrowser.observer

enum class ScreenshotStatus { CAPTURED, DISABLED, NOT_ALLOWED, UNKNOWN }

data class CaptureResult(
    val status: ScreenshotStatus,
    val reason: String,
    val bytes: ByteArray? = null
)

object ScreenshotCapture {
    fun disabledByDefault(): CaptureResult = CaptureResult(ScreenshotStatus.DISABLED, "EXPLICIT_CAPTURE_REQUIRED")

    fun rejectSensitivePage(isLoginPage: Boolean, explicitPermission: Boolean): CaptureResult {
        if (isLoginPage) return CaptureResult(ScreenshotStatus.NOT_ALLOWED, "LOGIN_PAGE")
        if (!explicitPermission) return disabledByDefault()
        return CaptureResult(ScreenshotStatus.UNKNOWN, "NATIVE_CAPTURE_REQUIRED")
    }
}
