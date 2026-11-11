package io.github.zekurio.matinee.ui.player.tv

import io.github.zekurio.matinee.ui.player.seekClamp
import io.github.zekurio.matinee.ui.player.seekable
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** Seconds of video a held key moves per second at first, as a multiple of one press's step. */
private const val HOLD_START_STEPS = 3.0

/** Seconds a held key takes to double its speed. */
private const val HOLD_DOUBLING_SECONDS = 1.5

/** The fastest a held key moves: this share of the video per second. */
private const val HOLD_MAX_SHARE = 0.1

/** The longest gap between two repeats that counts in full, so a stall doesn't jump. */
private const val HOLD_GAP_MS = 250L

/**
 * Where left and right on a remote have taken the seek bar. A press steps
 * by the skip length; a held key glides on from there, faster the longer
 * it's held, up to a tenth of the video a second. The player seeks once,
 * to [target], when the key comes up. Apart from Compose, so plain JUnit
 * covers it.
 */
internal class KeySeek {
    /** Where the keys have got to, until [release]. */
    var target: Double? = null
        private set

    private var heldSince = 0L
    private var last = 0L

    /**
     * A key down: [repeat] is the system's count of repeats while held, and
     * [atMs] the event's time. Moves on from [target], or from [from] for a
     * first press, by [step] seconds toward [direction].
     */
    fun press(from: Double, direction: Int, step: Double, duration: Double, repeat: Int, atMs: Long): Double? {
        if (!seekable(duration) || direction == 0) return null
        val start = target
        val sign = if (direction < 0) -1 else 1
        val next = if (start == null || repeat == 0) {
            heldSince = atMs
            (start ?: from) + sign * step
        } else {
            val held = (atMs - heldSince) / 1000.0
            val base = step * HOLD_START_STEPS
            val rate = min(base * 2.0.pow(held / HOLD_DOUBLING_SECONDS), max(duration * HOLD_MAX_SHARE, base))
            start + sign * rate * (atMs - last).coerceIn(0L, HOLD_GAP_MS) / 1000.0
        }
        last = atMs
        return seekClamp(next, duration).also { target = it }
    }

    /** The key came up: where to seek, if the keys moved. */
    fun release(): Double? = target.also { target = null }
}
