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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Home's sections, and the featured carousel's rules, the same cases as the iPhone's HomeSectionsTest.swift. */
class HomeSectionsTest {
    @Test
    fun railsTellLoadingEmptyFailedAndShownApart() {
        assertEquals(RailState.Loading, railState<Int>(Load.Loading))
        assertEquals(RailState.Empty, railState(Load.Ready(emptyList<Int>())))
        assertEquals(RailState.Failed("offline"), railState<Int>(Load.Failed("offline")))
        assertEquals(RailState.Shown(listOf(1)), railState(Load.Ready(listOf(1))))
    }

    @Test
    fun aRailKnowsItFailedForWantOfTheServer() {
        assertEquals(RailState.Failed("unreachable", disconnected = true), railState<Int>(Load.Failed("unreachable", disconnected = true)))
        assertEquals(RailState.Failed("broke", disconnected = false), railState<Int>(Load.Failed("broke")))
    }

    @Test
    fun homeIsOneErrorOnlyWhenNothingCouldShow() {
        val failed = Load.Failed("offline")
        val empty = Load.Ready(emptyList<Int>())
        assertTrue(failedOutright(failed, listOf(failed, empty, failed)))
        assertFalse(failedOutright(failed, listOf(failed, Load.Ready(listOf(1)), failed)))
        assertFalse(failedOutright(failed, listOf(failed, Load.Loading, failed)))
        assertFalse(failedOutright(Load.Ready(emptyList<Int>()), listOf(failed, failed, failed)))
    }

    @Test
    fun aPhoneShowsOneCardATabletTwoAndAWideWindowThree() {
        assertEquals(1, FeaturedCarousel.columns(402f))
        assertEquals(1, FeaturedCarousel.columns(599f))
        assertEquals(2, FeaturedCarousel.columns(600f))
        assertEquals(2, FeaturedCarousel.columns(820f))
        assertEquals(3, FeaturedCarousel.columns(840f))
        assertEquals(3, FeaturedCarousel.columns(1366f))
    }

    @Test
    fun fewTitlesFillTheRowRatherThanLeaveAHole() {
        assertEquals(3, FeaturedCarousel.perRow(1032f, 6))
        assertEquals(2, FeaturedCarousel.perRow(1032f, 2))
        assertEquals(1, FeaturedCarousel.perRow(820f, 1))
        assertEquals(1, FeaturedCarousel.perRow(402f, 0))
    }

    @Test
    fun theRowRestsWhereACardCanLeadIt() {
        assertEquals(6, FeaturedCarousel.stops(6, 1))
        assertEquals(4, FeaturedCarousel.stops(6, 3))
        assertEquals(1, FeaturedCarousel.stops(2, 2))
        assertEquals(1, FeaturedCarousel.stops(0, 1))
    }

    @Test
    fun theAdvanceGoesBackToTheFirstAfterTheLast() {
        assertEquals(1, FeaturedCarousel.next(0, 4))
        assertEquals(0, FeaturedCarousel.next(3, 4))
        assertEquals(0, FeaturedCarousel.next(0, 1))
        assertEquals(3, FeaturedCarousel.previous(0, 4))
        assertEquals(1, FeaturedCarousel.previous(2, 4))
    }

    @Test
    fun aScrolledRowRestsAtTheNearestStop() {
        assertEquals(0, FeaturedCarousel.stop(0f, 370f, 6))
        assertEquals(1, FeaturedCarousel.stop(190f, 370f, 6))
        assertEquals(5, FeaturedCarousel.stop(5000f, 370f, 6))
        assertEquals(0, FeaturedCarousel.stop(-40f, 370f, 6))
        assertEquals(0, FeaturedCarousel.stop(100f, 0f, 6))
        // The pager's place in cards, as HomeCarousel reads it.
        assertEquals(5, FeaturedCarousel.stop(4.6f, 1f, 6))
    }

    @Test
    fun oneCardToARowRestsInTheMiddleWithItsNeighboursOffTheScreen() {
        // A 412 dp phone: the card runs from gutter to gutter, 380 wide.
        val phone = FeaturedCarousel.layout(rowWidth = 412f, windowWidth = 412f, windowHeight = 915f, gutter = 16f, count = 7)
        assertEquals(1, phone.perRow)
        assertEquals(7, phone.stops)
        assertEquals(380f, phone.cardWidth, 0.01f)
        assertEquals(213.75f, phone.cardHeight, 0.01f)
        // A gutter apart, so at rest the next card starts exactly at the screen's edge.
        assertEquals(16f, phone.gap, 0.01f)
        assertEquals(412f, 16f + phone.cardWidth + phone.gap, 0.01f)
        // A single title is the same card.
        assertEquals(380f, FeaturedCarousel.layout(412f, 412f, 915f, 16f, 1).cardWidth, 0.01f)
    }

    @Test
    fun twoOrThreeToARowShareItAndStayAShortBand() {
        val tablet = FeaturedCarousel.layout(rowWidth = 800f, windowWidth = 800f, windowHeight = 1280f, gutter = 16f, count = 6)
        assertEquals(2, tablet.perRow)
        assertEquals(5, tablet.stops)
        assertEquals(12f, tablet.gap, 0.01f)
        assertEquals((768f - 12f) / 2f, tablet.cardWidth, 0.01f)
        val wide = FeaturedCarousel.layout(rowWidth = 1280f, windowWidth = 1280f, windowHeight = 800f, gutter = 16f, count = 2)
        assertEquals(2, wide.perRow)
        assertEquals(1, wide.stops)
        // 16:9 would be 341 tall; 40% of an 800 dp window is 320.
        assertEquals(320f, wide.cardHeight, 0.01f)
        assertEquals(FeaturedCarousel.cardHeight(300f, 2000f), 168.75f, 0.01f)
    }

    @Test
    fun aCardNamesUpToThreeGenresAndNothingElse() {
        assertEquals("Action · Sci-Fi · Drama", featured(TitleKind.MOVIE, 1999, listOf("Action", "Sci-Fi", "Drama", "War")).cardLine({ it }))
        assertEquals("Drama", featured(TitleKind.MOVIE, 1999, listOf("Drama")).cardLine({ it }, separator = ", "))
        assertNull(featured(TitleKind.MOVIE, 1999).cardLine({ it }))
        assertNull(featured(TitleKind.SHOW, null).cardLine({ it }))
    }

    private fun featured(kind: String, year: Int?, genres: List<String> = emptyList()): FeaturedTitle {
        val title = TitleSummary("t", "l", kind, "Name", year, null, Images(null, null, null), genres, null, null, null, null, false, false)
        val item = MediaItem(
            id = "i", libraryId = "l", fileTitle = "file", relativePath = "not parsed", container = "mkv", mimeType = "video/x-matroska",
            label = ItemLabel("t", "Name", null, kind, "Name", false, null, null, null, "t", emptyList()),
            title = title, seasonNumber = null, episodeNumber = null, episode = null,
            sizeBytes = 1000, modifiedAt = "2020-01-01T00:00:00Z", durationSeconds = 600.0, probe = null, progress = null, favorite = false,
        )
        return FeaturedTitle(title, item, 1)
    }
}
