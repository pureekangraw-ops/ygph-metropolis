package com.big.gobrowser.lyra
import org.junit.Test
import org.junit.Assert.*
class ModelConfigurationTest {
    @Test fun roundTripKeepsOnlyEndpointAndModel(){val c=ModelConfiguration("https://owner.example/v1/chat/completions","owner-model");assertEquals(c,ModelConfiguration.decode(c.encode()));assertFalse(c.encode().contains("token"))}
    @Test(expected=IllegalArgumentException::class) fun cleartextRejected(){ModelConfiguration("http://owner.example/chat","model")}
    @Test(expected=IllegalArgumentException::class) fun embeddedCredentialRejected(){ModelConfiguration("https://token@owner.example/chat","model")}
    @Test(expected=IllegalArgumentException::class) fun queryCredentialRejected(){ModelConfiguration("https://owner.example/chat?token=x","model")}
}
