package io.github.zekurio.matinee.ui.home

import io.github.zekurio.matinee.api.FeaturedTitle
import io.github.zekurio.matinee.api.Images
import io.github.zekurio.matinee.api.ItemLabel
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.ui.Load
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The tablet's featured banner's rules, after the web's hero.tsx: the same cases as the iPad's HomeHeroTest.swift. */
class HomeHeroTest {
    @Test
    fun aTabletOpensWithTheBannerAndAPhoneWithTheCards() {
        assertFalse(opensWithBanner(412f))
        assertFalse(opensWithBanner(599f))
        assertTrue(opensWithBanner(600f))
        assertTrue(opensWithBanner(1280f))
    }

    @Test
    fun theBannerRepeatsForwardAndADotFindsTheNearestPage() {
        assertEquals(1, HeroPaging.pages(1))
        assertEquals(0, HeroPaging.initialPage(1))
        assertEquals(3000, HeroPaging.pages(3))
        assertEquals(1500, HeroPaging.initialPage(3))
        assertEquals(0, HeroPaging.slide(1500, 3))
        assertEquals(2, HeroPaging.slide(1502, 3))
        assertEquals(0, HeroPaging.slide(1503, 3))
        assertEquals(2, HeroPaging.slide(-1, 3))
        assertEquals(1505, HeroPaging.page(showing = 2, from = 1504, count = 3))
        assertEquals(1503, HeroPaging.page(showing = 0, from = 1505, count = 3))
    }

    @Test
    fun aTabletInPortraitIsTheWebsTabletAndStopsAt720() {
        // The iPad Pro 11-inch's 834 by 1210.
        val layout = HeroLayout(834f, 1210f, rowsBelow = true)
        assertEquals(HeroLayout.Size.Medium, layout.size)
        assertEquals(720f, layout.height)
        assertEquals(112f, layout.buttonsBottom)
        assertEquals(48f, layout.dotsBottom)
        assertFalse(layout.dotsBesideButtons)
        assertTrue(layout.showsOverview)
        assertTrue(layout.showsGenres)
        assertEquals(48f, layout.titleSize)
        // A shorter tablet window's is 68% of it, and never under 480.
        assertNear(612f, HeroLayout(800f, 900f, rowsBelow = true).height)
        assertEquals(480f, HeroLayout(800f, 600f, rowsBelow = true).height)
        assertFalse(HeroLayout(800f, 700f, rowsBelow = true).showsOverview)
    }

    @Test
    fun aTabletOnItsSideIsTheWebsDesktopAndLeavesRoomForTheRows() {
        // 1210 by 834: the web's floor, 40% of the width.
        val layout = HeroLayout(1210f, 834f, rowsBelow = true)
        assertEquals(HeroLayout.Size.Large, layout.size)
        assertEquals(484f, layout.height)
        assertEquals(32f, layout.buttonsBottom)
        assertTrue(layout.dotsBesideButtons)
        assertFalse(layout.showsOverview)
        assertEquals(48f, layout.titleSize)
        // With nothing to watch next under it, the tablet's height.
        assertNear(567.12f, HeroLayout(1210f, 834f, rowsBelow = false).height)
        // 1376 by 1032.
        assertNear(550.4f, HeroLayout(1376f, 1032f, rowsBelow = true).height)
        assertNear(56.76f, HeroLayout(1376f, 1032f, rowsBelow = true).titleSize)
        // Never under 360.
        assertEquals(360f, HeroLayout(1024f, 500f, rowsBelow = true).height)
    }

    @Test
    fun aShortWindowTakesItAllAndDropsTheGenres() {
        val layout = HeroLayout(900f, 520f, rowsBelow = true)
        assertEquals(HeroLayout.Size.Short, layout.size)
        assertEquals(520f, layout.height)
        assertEquals(48f, layout.buttonsBottom)
        assertEquals(12f, layout.dotsBottom)
        assertFalse(layout.showsGenres)
        assertFalse(layout.showsOverview)
    }

    @Test
    fun theRowsFollowWhileTheyLoadOrHaveTitles() {
        val none = Load.Ready(emptyList<Int>())
        assertTrue(rowsFollowBanner(Load.Loading, none))
        assertTrue(rowsFollowBanner(none, Load.Ready(listOf(1))))
        assertFalse(rowsFollowBanner(none, none))
        assertFalse(rowsFollowBanner(Load.Failed("x"), none))
    }

    @Test
    fun aTabletKeepsAllOfTheWebsBanner() {
        assertEquals(BannerParts(BannerParts.Genres.Badges, facts = true, buttons = true, overview = true), BannerParts.TABLET)
    }

    @Test
    fun aSlideListsTheYearAndAShowsEpisodes() {
        val episodes = { count: Int -> "$count episodes" }
        assertEquals(listOf("1999"), featured(TitleKind.MOVIE, 1999, 1).facts(episodes))
        assertEquals(listOf("2008", "6 episodes"), featured(TitleKind.SHOW, 2008, 6).facts(episodes))
        assertTrue(featured(TitleKind.SHOW, null, 1).facts(episodes).isEmpty())
    }

    @Test
    fun theCardAndTheBannerNameATitleAndListItsGenresAlike() {
        val slide = featured(TitleKind.MOVIE, 1999, 1, listOf("Action", "Sci-Fi", "Drama", "War"))
        assertEquals("Name", slide.featuredName)
        assertEquals(listOf("Action", "Sci-Fi", "Drama"), slide.shownGenres)
        assertEquals(slide.shownGenres.joinToString(" · "), slide.cardLine())
    }

    private fun assertNear(expected: Float, actual: Float) = assertEquals(expected, actual, 0.01f)

    private fun featured(kind: String, year: Int?, count: Int, genres: List<String> = emptyList()): FeaturedTitle {
        val title = TitleSummary("t", "l", kind, "Name", year, null, Images(null, null, null), genres, null, null, null, null, false, false)
        val item = MediaItem(
            id = "i", libraryId = "l", fileTitle = "file", relativePath = "not parsed", container = "mkv", mimeType = "video/x-matroska",
            label = ItemLabel("t", "Name", null, kind, "Name", false, null, null, null, "t", emptyList()),
            title = title, seasonNumber = null, episodeNumber = null, episode = null,
            sizeBytes = 1000, modifiedAt = "2020-01-01T00:00:00Z", durationSeconds = 600.0, probe = null, progress = null, favorite = false,
        )
        return FeaturedTitle(title, item, count)
    }
}
