package com.big.gobrowser.transport

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.big.gobrowser.observer.Snapshot
import com.big.gobrowser.observer.Target
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/** Android's actual JSON codec, rather than source-pattern checks or mocked JSONObject. */
@RunWith(AndroidJUnit4::class)
class GeckoRelayWireTest {
    @Test fun snapshotPreservesFrameAndTargetEvidenceOnTheWire() {
        val target = Target("frame-child::target-0", "button", "Save", "button", 1, 2, 3, 4,
            "frame-child", "button", "button", "https://example.com/save", "visible", false, "captured-signature")
        val snapshot = Snapshot("device", "tab", "capture", 1, 1, 1000, "test", url = "https://example.com/",
            title = "Fixture", text = "Form", targets = listOf(target), truncated = false)
        val wire = HttpRelayClient.snapshotJson(snapshot).getJSONArray("targets").getJSONObject(0)
        assertEquals("frame-child", wire.getString("frameId"))
        assertEquals("captured-signature", wire.getString("signature"))
        assertEquals("button", wire.getString("tag"))
        assertEquals("https://example.com/save", wire.getString("href"))
        assertEquals("visible", wire.getString("visibility"))
        assertEquals(false, wire.getBoolean("disabled"))
    }
    @Test fun commandPreservesTopLevelFrameIdentityAndLegacyDefault() {
        val input = JSONObject().put("commandId", "cmd").put("actor", "GO").put("workId", "work")
            .put("checkpointId", "cp").put("tabId", "tab").put("deviceId", "device").put("captureId", "capture")
            .put("revision", 1).put("epoch", 1).put("issuedAtEpochMs", 1000).put("expiresAtEpochMs", 2000)
            .put("action", "CLICK").put("authority", "browser.click").put("frameId", "frame-child")
        assertEquals("frame-child", HttpRelayClient.commandFromJson(input).frameId)
        input.remove("frameId")
        assertEquals("frame-0", HttpRelayClient.commandFromJson(input).frameId)
    }
}
