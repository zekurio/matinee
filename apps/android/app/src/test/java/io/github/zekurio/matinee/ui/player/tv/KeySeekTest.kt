package io.github.zekurio.matinee.ui.player.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class KeySeekTest {
    @Test
    fun pressesStepBySkipLength() {
        val keys = KeySeek()
        assertEquals(110.0, keys.press(100.0, 1, 10.0, 7200.0, repeat = 0, atMs = 0)!!, 0.0)
        assertEquals(120.0, keys.press(100.0, 1, 10.0, 7200.0, repeat = 0, atMs = 300)!!, 0.0)
        assertEquals(115.0, keys.press(100.0, -1, 5.0, 7200.0, repeat = 0, atMs = 600)!!, 0.0)
        assertEquals(115.0, keys.release()!!, 0.0)
        assertNull(keys.release())
    }

    @Test
    fun heldKeyGlidesFasterTheLongerItIsHeld() {
        val keys = KeySeek()
        keys.press(0.0, 1, 10.0, 7200.0, repeat = 0, atMs = 0)
        // The system repeats a held key every 50 ms after a pause.
        var at = 500L
        var repeat = 1
        fun holdFor(ms: Long): Double {
            val from = keys.target!!
            val until = at + ms
            while (at < until) {
                keys.press(0.0, 1, 10.0, 7200.0, repeat++, at)
                at += 50
            }
            return keys.target!! - from
        }
        val first = holdFor(1000)
        val later = holdFor(1000)
        assertTrue("speeds up: $first then $later", later > first * 1.3)
        // From 30 s of video a second, three steps of 10 s, doubling every 1.5 s.
        assertTrue("starts slow: $first", first in 30.0..80.0)
    }

    @Test
    fun speedStopsAtATenthOfTheVideoASecond() {
        val keys = KeySeek()
        keys.press(0.0, 1, 10.0, 600.0, repeat = 0, atMs = 0)
        var at = 20_000L
        keys.press(0.0, 1, 10.0, 600.0, repeat = 1, atMs = at)
        val from = keys.target!!
        repeat(20) {
            at += 50
            keys.press(0.0, 1, 10.0, 600.0, repeat = it + 2, atMs = at)
        }
        assertEquals(60.0, keys.target!! - from, 0.5)
    }

    @Test
    fun staysInsideTheVideo() {
        val keys = KeySeek()
        assertEquals(0.0, keys.press(4.0, -1, 10.0, 600.0, repeat = 0, atMs = 0)!!, 0.0)
        assertNull(KeySeek().press(4.0, 1, 10.0, 0.0, repeat = 0, atMs = 0))
    }
}
