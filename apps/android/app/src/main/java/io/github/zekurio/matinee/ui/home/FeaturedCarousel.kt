package io.github.zekurio.matinee.ui.home

import io.github.zekurio.matinee.api.FeaturedTitle
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * The rules the featured carousel at the top of Home (HomeCarousel.kt) lays
 * itself out and moves by: how many cards share the row, how big they are,
 * where the row comes to rest, where the advance goes next, and the line
 * over a card's name. The iPhone app has the same rules in MatineeCore's
 * Home/HomeCarousel.swift and CarouselLayout; the tests hold both to the
 * same numbers. Sizes are in dp.
 */

/** The featured carousel's layout and paging. */
object FeaturedCarousel {
    /** How long a card stays before the carousel moves on, as Findroid's. */
    const val ADVANCE_MS = 5000L

    /** How long the move to the next card takes. */
    const val MOVE_MS = 600

    /** The gap between cards two or three to a row: the rails' 12. */
    const val GAP = 12f

    /** A card's height to its width, 16:9. */
    private const val ASPECT = 9f / 16f

    /** The most of the window's height a card takes, unless large text needs more. */
    private const val MAX_HEIGHT = 0.4f

    /** How many cards a window [width] dp wide shows side by side: one on a phone, two from 600, three from 840. */
    fun columns(width: Float): Int = when {
        width >= 840f -> 3
        width >= 600f -> 2
        else -> 1
    }

    /**
     * How many cards share the row for [count] titles: never more than there
     * are, so one or two titles on a wide window fill it rather than leave a
     * hole at the end.
     */
    fun perRow(width: Float, count: Int): Int = max(1, min(columns(width), count))

    /** How many places the row can come to rest at: one for each card that can lead it. Six titles three to a row rest at four. */
    fun stops(count: Int, perRow: Int): Int = max(count - max(perRow, 1) + 1, 1)

    /** The place after [stop], back to the first after the last. */
    fun next(stop: Int, stops: Int): Int = if (stops > 0) (stop + 1) % stops else 0

    /** The place before [stop], round to the last before the first. */
    fun previous(stop: Int, stops: Int): Int = if (stops > 0) (stop - 1 + stops) % stops else 0

    /** The place a row scrolled [offset] along rests nearest, each card [stride] from the last. */
    fun stop(offset: Float, stride: Float, stops: Int): Int {
        if (stride <= 0f || !offset.isFinite()) return 0
        return (offset / stride).roundToInt().coerceIn(0, max(stops - 1, 0))
    }

    /**
     * The gap between cards. One to a row, the [gutter]: a card at rest has
     * a gutter either side, so its neighbours sit just off the screen rather
     * than showing as slivers at its edges. Two or three to a row, the
     * rails' [GAP], so the row reads as one of Home's.
     */
    fun gap(perRow: Int, gutter: Float): Float = if (perRow <= 1) gutter else GAP

    /**
     * How wide a card is in a row [rowWidth] wide between [gutter]s. One to a
     * row runs from margin to margin, so it rests in the middle of the
     * screen, in line with the logo above and the rails below. Two or three
     * share the row, [gap] apart.
     */
    fun cardWidth(rowWidth: Float, gutter: Float, perRow: Int, gap: Float = gap(perRow, gutter)): Float {
        val inner = max(rowWidth - 2 * gutter, 0f)
        return if (perRow <= 1) inner else max((inner - gap * (perRow - 1)) / perRow, 0f)
    }

    /**
     * How tall a card is at [cardWidth]: 16:9, but no more than 40% of a
     * window [windowHeight] tall, so one title on a wide tablet is a band
     * rather than most of the screen. The card grows past it only for large
     * text, which HomeCarousel measures.
     */
    fun cardHeight(cardWidth: Float, windowHeight: Float): Float = min(cardWidth * ASPECT, windowHeight * MAX_HEIGHT)

    /** The card's sizes for [count] titles in a row [rowWidth] wide, in a window [windowWidth] by [windowHeight]. */
    fun layout(rowWidth: Float, windowWidth: Float, windowHeight: Float, gutter: Float, count: Int): CarouselLayout {
        val perRow = perRow(windowWidth, count)
        val gap = gap(perRow, gutter)
        val width = cardWidth(rowWidth, gutter, perRow, gap)
        return CarouselLayout(perRow, stops(count, perRow), gap, width, cardHeight(width, windowHeight))
    }
}

/** How the carousel lays its cards out, from [FeaturedCarousel.layout]. */
data class CarouselLayout(val perRow: Int, val stops: Int, val gap: Float, val cardWidth: Float, val cardHeight: Float) {
    /** How far one card is from the next. */
    val stride: Float get() = cardWidth + gap
}

/**
 * The line over a card's name: up to three of the title's genres, in plain
 * words the card cuts short at its end when they don't fit; null with none.
 * The card says nothing else but the name.
 */
fun FeaturedTitle.cardLine(separator: String = " · "): String? =
    shownGenres.takeIf { it.isNotEmpty() }?.joinToString(separator)
