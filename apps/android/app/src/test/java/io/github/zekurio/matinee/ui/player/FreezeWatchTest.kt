package io.github.zekurio.matinee.ui.player

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FreezeWatchTest {
    @Test
    fun framesComingIsNoFreeze() {
        val watch = FreezeWatch(limitMs = 5_000)
        for (t in 0L..20_000L step 40) {
            watch.frame(t)
            assertFalse(watch.check(t, playing = true, shown = true))
        }
    }

    @Test
    fun playingOnWithoutFramesIsAFreeze() {
        val watch = FreezeWatch(limitMs = 5_000)
        watch.frame(1_000)
        assertFalse(watch.check(1_000, playing = true, shown = true))
        assertFalse(watch.check(5_999, playing = true, shown = true))
        assertTrue(watch.check(6_000, playing = true, shown = true))
    }

    @Test
    fun pausedOrBufferingWaitsAgain() {
        val watch = FreezeWatch(limitMs = 5_000)
        watch.frame(0)
        assertFalse(watch.check(4_000, playing = true, shown = true))
        // Paused for a long while: no frames are expected.
        assertFalse(watch.check(60_000, playing = false, shown = true))
        // Playing again, the wait starts from now.
        assertFalse(watch.check(61_000, playing = true, shown = true))
        assertFalse(watch.check(65_999, playing = true, shown = true))
        assertTrue(watch.check(66_000, playing = true, shown = true))
    }

    @Test
    fun offScreenOrWithoutVideoIsNeverAFreeze() {
        val watch = FreezeWatch(limitMs = 5_000)
        assertFalse(watch.check(0, playing = true, shown = false))
        assertFalse(watch.check(60_000, playing = true, shown = false))
    }

    @Test
    fun aResetStartsTheWaitOver() {
        val watch = FreezeWatch(limitMs = 5_000)
        watch.check(0, playing = true, shown = true)
        assertTrue(watch.check(5_000, playing = true, shown = true))
        watch.reset()
        assertFalse(watch.check(5_000, playing = true, shown = true))
        assertTrue(watch.check(10_000, playing = true, shown = true))
    }
}
