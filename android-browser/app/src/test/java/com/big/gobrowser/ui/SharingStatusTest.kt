package com.big.gobrowser.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class SharingStatusTest {
    @Test fun openingShareDoesNotClaimDelivery() {
        assertEquals(SharingState.WAITING, SharingStatus.resolve(true,true,true,true,true,null,false,100_000))
        assertEquals(SharingState.LIVE, SharingStatus.resolve(true,true,true,true,true,99_000,false,100_000))
    }
    @Test fun staleOfflineAndStoppedRemainDistinct() {
        assertEquals(SharingState.STALE, SharingStatus.resolve(true,true,true,true,true,69_999,false,100_000))
        assertEquals(SharingState.OFFLINE, SharingStatus.resolve(true,true,true,false,true,99_000,false,100_000))
        assertEquals(SharingState.WAITING, SharingStatus.resolve(true,true,true,true,true,99_000,true,100_000))
        assertEquals(SharingState.STOPPED, SharingStatus.resolve(false,true,true,true,true,99_000,false,100_000))
        assertEquals(SharingState.BACKGROUND, SharingStatus.resolve(false,true,false,true,true,99_000,false,100_000))
        assertEquals(SharingState.UNPAIRED, SharingStatus.resolve(true,false,true,true,true,null,false,100_000))
        assertEquals(SharingState.STALE, SharingStatus.resolve(true,true,true,true,false,99_000,false,100_000))
    }
}
