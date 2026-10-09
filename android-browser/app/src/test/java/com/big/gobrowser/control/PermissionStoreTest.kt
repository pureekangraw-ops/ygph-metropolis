package com.big.gobrowser.control
import org.junit.Assert.*
import org.junit.Test
class PermissionStoreTest {
    @Test fun deviceSharingRevocationCarriesToOtherTabs() {
        val permissions=PermissionStore(100L,deviceScope=true)
        assertEquals(101L,permissions.revoke("first"))
        assertEquals(101L,permissions.epoch("second"))
        assertEquals(102L,permissions.revoke("second"))
        assertEquals(102L,permissions.epoch("first"))
    }
}
