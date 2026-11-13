package io.github.zekurio.matinee.ui.player

/*
 * The arithmetic of swipes on the video, apart from Compose so plain JUnit
 * covers it. The numbers are Findroid's, so a swipe goes as far there as here.
 */

/** The part of the video's height a swipe crosses to go from nothing to full. */
internal const val SWIPE_FULL_RANGE = 0.66f

/** Seconds a sideways swipe moves the video for each dp the finger travels. */
internal const val SWIPE_SECONDS_PER_DP = 0.25

/** How fast the video plays while a finger holds it. */
internal const val HOLD_SPEED = 2f

/**
 * A brightness or volume, from 0 to 1, that started at [start] after the
 * finger moved [dragY] pixels down a video [height] pixels high. Up raises it.
 */
internal fun swipeLevel(start: Float, dragY: Float, height: Float): Float {
    val from = if (start.isNaN()) 0f else start.coerceIn(0f, 1f)
    if (height <= 0f || dragY.isNaN()) return from
    return (from - dragY / (height * SWIPE_FULL_RANGE)).coerceIn(0f, 1f)
}

/** Where a sideways swipe of [dragDp] lands from [from] seconds, kept within the video. */
internal fun swipeSeek(from: Double, dragDp: Float, duration: Double): Double {
    if (dragDp.isNaN()) return seekClamp(from, duration)
    return seekClamp(from + dragDp * SWIPE_SECONDS_PER_DP, duration)
}
