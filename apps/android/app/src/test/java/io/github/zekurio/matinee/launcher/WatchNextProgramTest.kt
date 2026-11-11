package io.github.zekurio.matinee.launcher

import io.github.zekurio.matinee.api.Artwork
import io.github.zekurio.matinee.api.EpisodeInfo
import io.github.zekurio.matinee.api.Images
import io.github.zekurio.matinee.api.ItemLabel as ServerLabel
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.NextUpEntry
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.api.WatchState
import io.github.zekurio.matinee.ui.ItemLabel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchNextProgramTest {
    private val label = ItemLabel("The Show", "2025", "The Return", false, "S02E03")

    @Test
    fun publishesBothListsInServerOrderWithoutEligibilityRules() {
        val programs = watchNextPrograms(listOf(item("b"), item("a")), listOf(next("d"), next("c"))) { label }
        assertEquals(listOf("b", "a", "d", "c"), programs.map { it.itemId })
        assertEquals(listOf(WatchNextKind.Continue, WatchNextKind.Continue, WatchNextKind.Next, WatchNextKind.Next), programs.map { it.kind })
    }

    @Test
    fun mapsLabelsProgressAndEpisodeArtwork() {
        val program = watchNextPrograms(listOf(item()), emptyList()) { label }.single()
        assertEquals("The Show", program.title)
        assertEquals("The Return", program.episodeTitle)
        assertEquals("Episode overview", program.description)
        assertEquals("still", program.artworkId)
        assertFalse(program.poster)
        assertTrue(program.episode)
        assertEquals(2, program.seasonNumber)
        assertEquals(3, program.episodeNumber)
        assertEquals(600_500L, program.durationMillis)
        assertEquals(12_250L, program.positionMillis)
        assertEquals(1_735_689_600_000L, program.engagementMillis)
    }

    @Test
    fun nextUsesShowEngagementWithoutInventingPlayback() {
        val next = next().copy(item = item().copy(progress = null, durationSeconds = null, episode = null))
        val program = watchNextPrograms(emptyList(), listOf(next)) { label }.single()
        assertEquals(WatchNextKind.Next, program.kind)
        assertEquals(1_738_368_000_000L, program.engagementMillis)
        assertNull(program.positionMillis)
        assertNull(program.durationMillis)
        assertEquals("backdrop", program.artworkId)
        assertEquals("Show overview", program.description)
        assertFalse(program.watchedAfter(-1))
    }

    @Test
    fun movieUsesItsNameAndPosterWhenThereIsNoLandscapeArt() {
        val item = item()
        val movie = item.copy(title = item.title!!.copy(kind = "movie", images = Images(Artwork("poster", null), null, null)), episode = null, episodeNumber = null, seasonNumber = null)
        val program = watchNextPrograms(listOf(movie), emptyList()) { ItemLabel("A Movie", "2025", "A Movie", false, null) }.single()
        assertEquals("A Movie", program.title)
        assertNull(program.episodeTitle)
        assertEquals("poster", program.artworkId)
        assertTrue(program.poster)
        assertFalse(program.episode)
    }

    @Test
    fun dismissalNeedsNewPlaybackNotJustAnotherSync() {
        val program = watchNextPrograms(listOf(item()), emptyList()) { label }.single()
        assertFalse(program.watchedAfter(program.engagementMillis!!))
        assertTrue(program.watchedAfter(program.engagementMillis - 1))
        assertFalse(program.copy(positionMillis = 0).watchedAfter(-1))
        assertFalse(program.copy(engagementMillis = null).watchedAfter(-1))
    }

    @Test
    fun continueWithoutProgressNeverGetsAnEngagementTime() {
        val program = watchNextPrograms(listOf(item().copy(progress = null)), emptyList()) { label }.single()
        assertNull(program.engagementMillis)
        assertNull(program.positionMillis)
    }

    @Test
    fun invalidServerTimeNeverFallsBackToEpisodeProgressOrLocalTime() {
        val next = next().copy(lastWatchedAt = "invalid")
        val program = watchNextPrograms(emptyList(), listOf(next)) { label }.single()
        assertNull(program.engagementMillis)
    }

    @Test
    fun nextUsesShowTimeEvenIfEpisodeHasProgress() {
        val program = watchNextPrograms(emptyList(), listOf(next())) { label }.single()
        assertEquals(1_738_368_000_000L, program.engagementMillis)
    }

    private fun next(id: String = "item") = NextUpEntry(item(id), "2025-02-01T00:00:00Z")

    private fun item(id: String = "item") = MediaItem(
        id = id, libraryId = "library", fileTitle = "file", relativePath = "not parsed", container = "mkv", mimeType = "video/x-matroska",
        label = ServerLabel("show", "The Show", "2025", "show", "The Return", false, 3, "S02E03", "E03", "show", emptyList()),
        title = TitleSummary("show", "library", "show", "The Show", 2025, "Show overview", Images(Artwork("poster", null), Artwork("backdrop", null), null), emptyList(), null, null, null, false, false),
        seasonNumber = 2, episodeNumber = 3,
        episode = EpisodeInfo("The Return", "Episode overview", null, 10, Artwork("still", null)),
        sizeBytes = 1000, modifiedAt = "2020-01-01T00:00:00Z", durationSeconds = 600.5, probe = null,
        progress = WatchState(12.25, false, "2025-01-01T00:00:00Z"), favorite = false,
    )
}
