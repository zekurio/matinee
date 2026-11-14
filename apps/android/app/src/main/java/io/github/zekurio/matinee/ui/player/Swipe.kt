package io.github.zekurio.matinee.ui.player

import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sqrt

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

/** Some screens turn their backlight off at 0, so the lowest brightness stays just above. */
internal const val MIN_BRIGHTNESS = 0.01f

/*
 * A window's brightness is the backlight's power, and the eye goes by ratios,
 * so equal steps of it look huge near the bottom and like nothing near the
 * top. A swipe's level goes through the curve the system's own slider uses,
 * the hybrid log-gamma one in Android's BrightnessUtils, so each bit of the
 * swipe looks like the same step.
 */
private const val HLG_R = 0.5f
private const val HLG_A = 0.17883277f
private const val HLG_B = 0.28466892f
private const val HLG_C = 0.55991073f

/** The window brightness, from [MIN_BRIGHTNESS] to 1, for a swipe [level] from 0 to 1. */
internal fun brightnessOfLevel(level: Float): Float {
    val at = if (level.isNaN()) 0f else level.coerceIn(0f, 1f)
    val power = if (at <= HLG_R) (at / HLG_R).pow(2) else exp((at - HLG_C) / HLG_A) + HLG_B
    return (MIN_BRIGHTNESS + (1f - MIN_BRIGHTNESS) * power / 12f).coerceIn(MIN_BRIGHTNESS, 1f)
}

/** The swipe level, from 0 to 1, that gives a window [brightness]. */
internal fun levelOfBrightness(brightness: Float): Float {
    if (brightness.isNaN()) return 0f
    val power = (brightness.coerceIn(MIN_BRIGHTNESS, 1f) - MIN_BRIGHTNESS) / (1f - MIN_BRIGHTNESS) * 12f
    val level = if (power <= 1f) sqrt(power) * HLG_R else HLG_A * ln(power - HLG_B) + HLG_C
    return level.coerceIn(0f, 1f)
}

/** Where a sideways swipe of [dragDp] lands from [from] seconds, kept within the video. */
internal fun swipeSeek(from: Double, dragDp: Float, duration: Double): Double {
    if (dragDp.isNaN()) return seekClamp(from, duration)
    return seekClamp(from + dragDp * SWIPE_SECONDS_PER_DP, duration)
}
