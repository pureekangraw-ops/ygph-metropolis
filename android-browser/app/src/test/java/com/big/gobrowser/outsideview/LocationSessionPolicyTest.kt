package com.big.gobrowser.outsideview
import org.junit.Assert.*
import org.junit.Test
class LocationSessionPolicyTest {
    @Test fun requiresFreshOwnerStartVisibleActivityAndEveryPermission() {
        assertTrue(LocationSessionPolicy.mayStart(true,true,true,true,true))
        for(i in 0..4){val conditions=BooleanArray(5){true};conditions[i]=false
            assertFalse(LocationSessionPolicy.mayStart(conditions[0],conditions[1],conditions[2],conditions[3],conditions[4]))
        }
    }
}
