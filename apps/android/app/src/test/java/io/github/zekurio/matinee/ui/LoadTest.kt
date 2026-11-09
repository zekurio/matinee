package io.github.zekurio.matinee.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LoadTest {
    @Test
    fun aFailedRefreshKeepsWhatLoadedBefore() {
        val settled = Load.Ready(listOf(1, 2)).failedWith("offline")
        assertEquals(Load.Ready(listOf(1, 2)), settled.state)
        assertEquals("offline", settled.refreshError)
    }

    @Test
    fun aFailedFirstLoadFails() {
        val before: Load<List<Int>> = Load.Loading
        val settled = before.failedWith("offline")
        assertEquals(Load.Failed("offline"), settled.state)
        assertNull(settled.refreshError)
    }
}
