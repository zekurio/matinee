package io.github.zekurio.matinee.ui.player.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DisplayModeTest {
    @Test
    fun refreshRatePrefersExactThenLowestMultiple() {
        val modes = listOf(60f, 50f, 24f, 23.976f, 120f)
        assertEquals(23.976f, matchingRefreshRate(modes, 23.976)!!, 0f)
        assertEquals(24f, matchingRefreshRate(modes, 24.0)!!, 0f)
        assertEquals(50f, matchingRefreshRate(modes, 25.0)!!, 0f)
        assertEquals(60f, matchingRefreshRate(modes, 30.0)!!, 0f)
        assertEquals(24f, matchingRefreshRate(listOf(60f, 24f), 23.976)!!, 0f)
        assertNull(matchingRefreshRate(listOf(60f), 24.0))
        assertNull(matchingRefreshRate(modes, null))
        assertNull(matchingRefreshRate(modes, 0.0))
    }
}
