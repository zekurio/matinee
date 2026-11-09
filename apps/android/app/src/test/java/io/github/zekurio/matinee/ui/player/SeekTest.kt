package io.github.zekurio.matinee.ui.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SeekTest {
    @Test
    fun unknownLengthCannotSeek() {
        assertFalse(seekable(0.0))
        assertFalse(seekable(-5.0))
        assertFalse(seekable(Double.NaN))
        assertFalse(seekable(Double.POSITIVE_INFINITY))
        assertTrue(seekable(0.5))
        assertEquals(0.0, seekClamp(42.0, 0.0), 0.0)
        assertEquals(0f, seekFraction(42.0, 0.0), 0f)
        assertEquals(0.0, seekAt(50f, 100f, 0.0), 0.0)
        assertEquals(0, seekSteps(0.0, 10.0))
    }

    @Test
    fun clampKeepsWithinTheVideo() {
        assertEquals(0.0, seekClamp(-3.0, 100.0), 0.0)
        assertEquals(100.0, seekClamp(130.0, 100.0), 0.0)
        assertEquals(37.5, seekClamp(37.5, 100.0), 0.0)
        assertEquals(0.0, seekClamp(Double.NaN, 100.0), 0.0)
    }

    @Test
    fun fractionFollowsTheTime() {
        assertEquals(0.25f, seekFraction(25.0, 100.0), 1e-6f)
        assertEquals(1f, seekFraction(250.0, 100.0), 0f)
        assertEquals(0f, seekFraction(-1.0, 100.0), 0f)
    }

    @Test
    fun pointMapsToTime() {
        assertEquals(30.0, seekAt(30f, 100f, 100.0), 1e-4)
        assertEquals(0.0, seekAt(-20f, 100f, 100.0), 0.0)
        assertEquals(100.0, seekAt(140f, 100f, 100.0), 0.0)
        assertEquals(0.0, seekAt(10f, 0f, 100.0), 0.0)
    }

    @Test
    fun stepsMoveAboutOneSkip() {
        // An hour in ten-second steps: 360 positions, so 359 steps between the ends.
        val steps = seekSteps(3600.0, 10.0)
        assertEquals(359, steps)
        assertEquals(10.0, 3600.0 / (steps + 1), 1e-9)
        // A length that doesn't divide still moves no more than one skip.
        val odd = seekSteps(95.0, 10.0)
        assertTrue(95.0 / (odd + 1) <= 10.0)
        // Shorter than a step: no steps, so one swipe crosses it.
        assertEquals(0, seekSteps(4.0, 10.0))
        assertEquals(0, seekSteps(100.0, 0.0))
        assertEquals(0, seekSteps(100.0, Double.NaN))
    }

    @Test
    fun keysStepAndStopAtTheEnds() {
        assertEquals(40.0, seekStepped(30.0, 1, 10.0, 100.0), 0.0)
        assertEquals(20.0, seekStepped(30.0, -1, 10.0, 100.0), 0.0)
        assertEquals(100.0, seekStepped(95.0, 1, 10.0, 100.0), 0.0)
        assertEquals(0.0, seekStepped(5.0, -1, 10.0, 100.0), 0.0)
        assertEquals(30.0, seekStepped(30.0, 0, 10.0, 100.0), 0.0)
        assertEquals(0.0, seekStepped(30.0, 1, 10.0, 0.0), 0.0)
    }
}
