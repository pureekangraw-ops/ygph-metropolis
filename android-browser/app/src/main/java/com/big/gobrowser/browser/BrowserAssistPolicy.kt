package com.big.gobrowser.browser

import com.big.gobrowser.observer.Target

/**
 * On-device owner-assisted actions only. No page can grant itself an action:
 * a fresh target, native approval and the Gecko observer's signature check are all required.
 */
object BrowserAssistPolicy {
    fun selectionIsCurrent(selectedTab: String, currentTab: String, selectedUrl: String, currentUrl: String,
                           selected: Target, currentTargets: List<Target>): Boolean =
        selectedTab == currentTab && selectedUrl == currentUrl && currentTargets.any {
            it.id == selected.id && it.frameId == selected.frameId && it.signature == selected.signature
        }
    private val secret = Regex("(?i)(password|passcode|one.time|otp|2fa|verification.code|security.code|credit.card|card.number|card.cvc|card.cvv|cc.number|cc.csc|cc.exp|bank.account|routing.number|pin.code|รหัสผ่าน|รหัสยืนยัน|เลขบัตร|เลขบัญชี|รหัส otp)")
    private val highImpact = Regex("(?i)(pay(?:ment)?|purchase|buy.now|checkout|place.order|transfer|withdraw|delete|remove|erase|discard|submit|send|publish|post|confirm|approve|authorize|accept|consent|unsubscribe|ชำระ|จ่ายเงิน|ซื้อ|สั่งซื้อ|โอน|ถอน|ลบ|ส่งข้อความ|ส่งคำสั่ง|เผยแพร่|ยืนยัน|อนุมัติ|ยอมรับ)")
    private val secretAuto = Regex("(?i)(one.time.code|current.password|new.password|cc.|transaction.|webauthn)")
    private val blockedTypes = setOf("password", "hidden", "file", "checkbox", "radio", "submit", "reset", "button", "image")

    fun rejection(target: Target, action: String, value: String = ""): String? {
        if (target.frameId != "frame-0") return "FRAME_NOT_SUPPORTED"
        if (target.visibility != "visible" || target.disabled || target.signature.isBlank()) return "TARGET_NOT_INTERACTIVE"
        val name = listOfNotNull(target.label, target.role, target.type).joinToString(" ")
        if (secret.containsMatchIn(name) || secretAuto.containsMatchIn(target.autocomplete)) return "SENSITIVE_TARGET"
        val tag = target.tag.lowercase()
        val type = target.type.lowercase()
        return when (action) {
            "FILL" -> when {
                tag !in setOf("input", "textarea", "select") || type in blockedTypes -> "NOT_TEXT_FIELD"
                value.length > 2000 -> "VALUE_TOO_LONG"
                else -> null
            }
            "CLICK" -> when {
                tag !in setOf("a", "button") && target.role !in setOf("button", "link") -> "NOT_CLICK_TARGET"
                type in setOf("submit", "reset") -> "SUBMIT_REQUIRES_OWNER"
                highImpact.containsMatchIn(name) || highImpact.containsMatchIn(target.href.orEmpty()) -> "HIGH_IMPACT_REQUIRES_OWNER"
                target.href != null && !target.href.startsWith("https://", ignoreCase = true) -> "UNSAFE_LINK"
                else -> null
            }
            else -> "UNSUPPORTED_ACTION"
        }
    }
}
