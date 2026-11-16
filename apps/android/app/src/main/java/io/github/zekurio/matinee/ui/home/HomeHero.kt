package io.github.zekurio.matinee.ui.home

import io.github.zekurio.matinee.api.FeaturedTitle
import io.github.zekurio.matinee.api.isShow
import io.github.zekurio.matinee.ui.Load
import kotlin.math.max
import kotlin.math.min

/*
 * The rules the tablet's featured banner at the top of Home (Hero.kt) lays
 * itself out and moves by, after the web's components/hero.tsx and the
 * place home.tsx gives it: whether Home opens with it at all, what it
 * shows, how tall it is and where its text and buttons sit for the window,
 * which facts a slide lists, and how its repeating pages map to slides.
 * The iPad's are the same, in MatineeCore's Home/HomeHero.swift, and the
 * tests hold both to the same numbers. The phone's card carousel is
 * HomeCarousel.kt; both name a title and list its genres through the
 * `FeaturedTitle` helpers at the end of this file. Lengths are dp.
 */

/** How wide a window opens Home with the banner rather than the cards: a tablet's, as the iPad's regular width. */
const val BANNER_FROM_WIDTH = 600f

/** Whether a window [width] dp wide opens Home with the banner. Below that, a phone's, it's the card carousel. */
fun opensWithBanner(width: Float): Boolean = width >= BANNER_FROM_WIDTH

/**
 * What the banner shows besides the title's name and its picture. The
 * owner picked the web's banner for the iPad, and tablets match it, so
 * [TABLET] is all of the web's: its facts, its genres as badges, the
 * overview, and Play and Details. Each is one switch here.
 */
data class BannerParts(val genres: Genres, val facts: Boolean, val buttons: Boolean, val overview: Boolean) {
    /** How the genres show: the web's frosted badges, each opening its genre; a line of plain text, as the card has; or not at all. */
    enum class Genres { Badges, Line, None }

    companion object {
        /** A tablet's banner: the web's, all of it, as the iPad's. */
        val TABLET = BannerParts(Genres.Badges, facts = true, buttons = true, overview = true)
    }
}

/** Featured slides, as the banner pages through them. */
object HeroPaging {
    /**
     * How many times over the banner's pages repeat, so it can keep going
     * forward: after the last slide comes the first again, rather than a
     * rewind through them all.
     */
    const val LOOPS = 1000

    /** How long a slide stays before the banner moves on: the web's 8 seconds. */
    const val ADVANCE_MS = 8000L

    /** How many pages the banner has for [count] slides. */
    fun pages(count: Int): Int = if (count > 1) count * LOOPS else count

    /** The page it opens on: the middle of the repeats, so it can go either way. */
    fun initialPage(count: Int): Int = if (count > 1) count * (LOOPS / 2) else 0

    /** The slide [page] shows. */
    fun slide(page: Int, count: Int): Int = if (count > 0) ((page % count) + count) % count else 0

    /** The page nearest [page] that shows slide [index], for a dot's tap. */
    fun page(showing: Int, from: Int, count: Int): Int = from - slide(from, count) + showing
}

/**
 * Where the banner puts things in a window, after the web's breakpoints: a
 * tablet's (`sm`, from 640 wide), a desktop's (`lg`, from 1024), and a
 * short window's (`sm` under 540 tall). A tablet in portrait is the web's
 * tablet, on its side its desktop. Lengths from the bottom are measured up
 * from the banner's bottom edge.
 *
 * [width] and [height] are the window's, less on Android what the tab bar
 * takes at the bottom (`Hero.kt`), which the web hasn't got. [rowsBelow] is
 * whether Continue watching or Next up follow the banner (or may, while
 * they load): on a desktop the web gives the banner what those rows leave
 * of the first screen, which in a tablet's window is its floor,
 * `max(360px, min(64vh, 40vw))`. Otherwise it's `min(68vh, 720px)`, at
 * least 480, or a short window's whole height.
 */
data class HeroLayout(val width: Float, val windowHeight: Float, val rowsBelow: Boolean) {
    enum class Size {
        /** `sm` up to `lg`: buttons well up from the bottom, the dots under them at the right. */
        Medium,

        /** `lg`: the buttons near the bottom, the dots level with them. */
        Large,

        /** `sm` and under 540 tall: everything low, no genres. */
        Short,
    }

    val size: Size = when {
        width >= 1024f -> Size.Large
        windowHeight <= 540f -> Size.Short
        else -> Size.Medium
    }

    /** How tall the banner is, from the screen's top, under the status bar and Home's header. */
    val height: Float = when {
        size == Size.Large && rowsBelow -> max(360f, min(windowHeight * 0.64f, width * 0.4f))
        size == Size.Short -> windowHeight
        else -> max(min(windowHeight * 0.68f, 720f), 480f)
    }

    /** From the bottom to the buttons' bottom edge: `bottom-28`, `lg:bottom-8`, short `bottom-12`. */
    val buttonsBottom: Float = when (size) {
        Size.Large -> 32f
        Size.Short -> 48f
        Size.Medium -> 112f
    }

    /** The room between the buttons and the slide's text above them. */
    val textGap: Float = if (size == Size.Short) 16f else 24f

    /** From the bottom to the dots' row, where it isn't level with the buttons: `sm:bottom-12`, short `bottom-3`. */
    val dotsBottom: Float = if (size == Size.Short) 12f else 48f

    /** Whether the dots and arrows sit level with the buttons, at the right. */
    val dotsBesideButtons: Boolean get() = size == Size.Large

    /** Whether the window is tall enough for the overview: the web's hides it under 700 tall on a tablet and 880 on a desktop. */
    val showsOverview: Boolean = when (size) {
        Size.Large -> windowHeight > 880f
        Size.Short -> false
        Size.Medium -> windowHeight > 700f
    }

    /** Whether there's room for the genres: not in a short window. */
    val showsGenres: Boolean get() = size != Size.Short

    /** The title's size: `clamp(2.25rem, 7vh, 3rem)` on a tablet, `clamp(3rem, 5.5vh, 4.5rem)` on a desktop. */
    val titleSize: Float =
        if (size == Size.Large) (windowHeight * 0.055f).coerceIn(48f, 72f) else (windowHeight * 0.07f).coerceIn(36f, 48f)
}

/**
 * Whether Continue watching or Next up follow the banner, which on a
 * desktop-sized window keeps it short enough for them to start in the
 * first screen: either has titles, or is still loading, as the web's
 * `fold` assumes they'll come.
 */
fun rowsFollowBanner(resume: Load<List<*>>, nextUp: Load<List<*>>): Boolean {
    fun coming(load: Load<List<*>>) = when (load) {
        Load.Loading -> true
        is Load.Ready -> load.value.isNotEmpty()
        is Load.Failed -> false
    }
    return coming(resume) || coming(nextUp)
}

/**
 * The name a featured title goes by, typed out, on the phone's card and
 * the tablet's banner alike. Never the provider's logo image: it can't be
 * made to read on every picture behind it.
 */
val FeaturedTitle.featuredName: String get() = title.name

/** The genres a featured title lists, at most three, as the web's banner. */
val FeaturedTitle.shownGenres: List<String> get() = title.genres.take(3)

/** The year, and a show's episode count when it has more than one. */
fun FeaturedTitle.facts(episodes: (Int) -> String): List<String> = listOfNotNull(
    title.year?.toString(),
    if (title.isShow && count > 1) episodes(count) else null,
)
