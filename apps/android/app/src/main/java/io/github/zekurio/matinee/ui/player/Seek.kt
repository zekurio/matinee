package io.github.zekurio.matinee.ui.player

import kotlin.math.ceil

/*
 * The seek bar's arithmetic, apart from Compose so plain JUnit covers it.
 * Times are in seconds; a duration that isn't a positive number means the
 * video's length isn't known yet, and the bar can't seek.
 */

/** Whether a bar over [duration] can seek at all. */
internal fun seekable(duration: Double): Boolean = duration.isFinite() && duration > 0

/** [seconds] kept within the video, or 0 while its length is unknown. */
internal fun seekClamp(seconds: Double, duration: Double): Double {
    if (!seekable(duration) || seconds.isNaN()) return 0.0
    return seconds.coerceIn(0.0, duration)
}

/** How far along the bar [seconds] sits, from 0 to 1. */
internal fun seekFraction(seconds: Double, duration: Double): Float =
    if (seekable(duration)) (seekClamp(seconds, duration) / duration).toFloat() else 0f

/** The time under a point [x] pixels along a bar [width] pixels wide. */
internal fun seekAt(x: Float, width: Float, duration: Double): Double {
    if (!seekable(duration) || width <= 0f || x.isNaN()) return 0.0
    return (x / width).coerceIn(0f, 1f) * duration
}

/**
 * The steps a screen reader's range info gets, so each swipe up or down
 * moves the range by about [step] seconds, the same as the skip buttons.
 * Compose moves an adjustable range by its length over steps + 1.
 */
internal fun seekSteps(duration: Double, step: Double): Int {
    if (!seekable(duration) || !step.isFinite() || step <= 0) return 0
    val count = ceil(duration / step)
    return if (count >= Int.MAX_VALUE) Int.MAX_VALUE - 1 else (count.toInt() - 1).coerceAtLeast(0)
}

/** Where one press of left ([direction] below 0) or right moves [from], by [step] seconds. */
internal fun seekStepped(from: Double, direction: Int, step: Double, duration: Double): Double {
    if (direction == 0 || !step.isFinite() || step <= 0) return seekClamp(from, duration)
    return seekClamp(from + if (direction < 0) -step else step, duration)
}
