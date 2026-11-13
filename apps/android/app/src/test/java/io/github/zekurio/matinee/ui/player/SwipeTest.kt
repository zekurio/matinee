package io.github.zekurio.matinee.ui.player

import org.junit.Assert.assertEquals
import org.junit.Test

class SwipeTest {
    @Test
    fun upRaisesAndDownLowers() {
        // A swipe across the whole range goes from nothing to full.
        assertEquals(1f, swipeLevel(0f, -SWIPE_FULL_RANGE * 1000f, 1000f), 1e-5f)
        assertEquals(0.5f, swipeLevel(0.5f, 0f, 1000f), 0f)
        assertEquals(0.4f, swipeLevel(0.5f, SWIPE_FULL_RANGE * 100f, 1000f), 1e-5f)
    }

    @Test
    fun levelStaysWithinRange() {
        assertEquals(1f, swipeLevel(0.9f, -5000f, 1000f), 0f)
        assertEquals(0f, swipeLevel(0.1f, 5000f, 1000f), 0f)
        assertEquals(1f, swipeLevel(3f, 0f, 1000f), 0f)
        assertEquals(0f, swipeLevel(Float.NaN, 0f, 1000f), 0f)
        assertEquals(0.3f, swipeLevel(0.3f, 50f, 0f), 0f)
        assertEquals(0.3f, swipeLevel(0.3f, Float.NaN, 1000f), 0f)
    }

    @Test
    fun sidewaysMovesByDistance() {
        assertEquals(100.0 + 200 * SWIPE_SECONDS_PER_DP, swipeSeek(100.0, 200f, 3600.0), 1e-6)
        assertEquals(100.0 - 200 * SWIPE_SECONDS_PER_DP, swipeSeek(100.0, -200f, 3600.0), 1e-6)
    }

    @Test
    fun seekStaysWithinTheVideo() {
        assertEquals(0.0, swipeSeek(10.0, -1000f, 3600.0), 0.0)
        assertEquals(60.0, swipeSeek(50.0, 1000f, 60.0), 0.0)
        assertEquals(0.0, swipeSeek(50.0, 100f, 0.0), 0.0)
        assertEquals(50.0, swipeSeek(50.0, Float.NaN, 60.0), 0.0)
    }
}
