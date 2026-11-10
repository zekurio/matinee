package io.github.zekurio.matinee.ui.home

import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.decodeSaved
import io.github.zekurio.matinee.downloads.DownloadKind
import io.github.zekurio.matinee.downloads.DownloadState
import io.github.zekurio.matinee.downloads.OfflineItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflineHomeTest {
    private fun file(id: String, show: String? = null, season: Int? = null, episode: Int? = null, addedAt: Long = 0, state: String = DownloadState.DONE): OfflineItem {
        val title = if (show != null) {
            """{"id":"$show","libraryId":"l","kind":"show","name":"$show","year":2020,"images":{},"genres":[],"favorite":false,"watched":false}"""
        } else {
            """{"id":"movie-$id","libraryId":"l","kind":"movie","name":"$id","year":2020,"images":{},"genres":[],"favorite":false,"watched":false}"""
        }
        val item = decodeSaved(
            MediaItem.serializer(),
            """{"id":"$id","libraryId":"l","fileTitle":"$id","relativePath":"$id.mkv","container":"mkv",
               "mimeType":"video/x-matroska","sizeBytes":1,"modifiedAt":"2026-01-01T00:00:00.000Z",
               "durationSeconds":1000.0,"favorite":false,"title":$title,
               "seasonNumber":${season ?: "null"},"episodeNumber":${episode ?: "null"},
               "label":{"show":"$id","showName":"${show ?: id}","showKey":"k","untitled":false,"group":"g","groupLabel":[]}}""",
        )
        return OfflineItem(item = item, kind = DownloadKind.ORIGINAL, file = "$id/video.mkv", state = state, addedAt = addedAt)
    }

    @Test
    fun startedAndNotDoneIsContinueWatchingNewestFirst() {
        val a = file("a", addedAt = 1)
        val b = file("b", addedAt = 2)
        val c = file("c", addedAt = 3)
        val places = mapOf("a" to Place(100.0, 1000.0), "b" to Place(200.0, 1000.0), "c" to Place(990.0, 1000.0))
        val rows = offlineHomeRows(listOf(a, b, c), { places[it.id] }, { it.id == "c" })
        assertEquals(listOf("b", "a"), rows.resume.map { it.id })
    }

    @Test
    fun nextUpIsTheFirstDownloadedEpisodeAfterTheLastOneWatched() {
        val e1 = file("s1e1", show = "show", season = 1, episode = 1)
        val e2 = file("s1e2", show = "show", season = 1, episode = 2)
        val e3 = file("s1e3", show = "show", season = 1, episode = 3)
        val rows = offlineHomeRows(listOf(e3, e1, e2), { null }, { it.id == "s1e1" })
        assertEquals(listOf("s1e2"), rows.nextUp.map { it.id })
    }

    @Test
    fun aShowNobodyStartedHasNoNextUp() {
        val e1 = file("s1e1", show = "show", season = 1, episode = 1)
        assertTrue(offlineHomeRows(listOf(e1), { null }, { false }).nextUp.isEmpty())
    }

    @Test
    fun anEpisodeInProgressIsContinueWatchingNotNextUp() {
        val e1 = file("s1e1", show = "show", season = 1, episode = 1)
        val e2 = file("s1e2", show = "show", season = 1, episode = 2)
        val rows = offlineHomeRows(listOf(e1, e2), { if (it.id == "s1e1") Place(50.0, 1000.0) else null }, { false })
        assertEquals(listOf("s1e1"), rows.resume.map { it.id })
        assertEquals(listOf("s1e2"), rows.nextUp.map { it.id })
    }

    @Test
    fun moviesAndShowsAreSeparateAndUnfinishedDownloadsStayOut() {
        val movie = file("film", addedAt = 5)
        val episode = file("s1e1", show = "show", season = 1, episode = 1, addedAt = 4)
        val coming = file("later", addedAt = 9, state = DownloadState.RUNNING)
        val rows = offlineHomeRows(listOf(movie, episode, coming), { null }, { false })
        assertEquals(listOf("film"), rows.movies.map { it.id })
        assertEquals(listOf("show"), rows.shows.map { it.title.id })
        assertEquals(listOf("s1e1"), rows.shows.single().episodes.map { it.id })
    }

    @Test
    fun seasonsComeInOrderWithSpecialsAndLooseFilesLast() {
        val special = file("s0e1", show = "show", season = 0, episode = 1)
        val loose = file("extra", show = "show")
        val s2 = file("s2e1", show = "show", season = 2, episode = 1)
        val s1 = file("s1e2", show = "show", season = 1, episode = 2)
        val rows = offlineHomeRows(listOf(loose, special, s2, s1), { null }, { false })
        assertEquals(listOf("s1e2", "s2e1", "s0e1", "extra"), rows.shows.single().episodes.map { it.id })
    }

    @Test
    fun theServersRowsStayAsTheyWereOfWhatIsDownloaded() {
        val boss = file("boss-s2e3", show = "boss", season = 2, episode = 3, addedAt = 1)
        val film = file("film", addedAt = 2)
        val served = ServedRows(resume = listOf("not-downloaded", "film"), nextUp = listOf("boss-s2e3", "also-not-here"))
        val rows = offlineHomeRows(listOf(boss, film), { null }, { false }, served)
        assertEquals(listOf("film"), rows.resume.map { it.id })
        assertEquals(listOf("boss-s2e3"), rows.nextUp.map { it.id })
    }

    @Test
    fun theServersOrderComesFirstThenWhatWasStartedOffline() {
        val a = file("a", addedAt = 1)
        val b = file("b", addedAt = 2)
        val c = file("c", addedAt = 3)
        val served = ServedRows(resume = listOf("a", "b"))
        // c, the newest, was started offline since.
        val rows = offlineHomeRows(listOf(a, b, c), { if (it.id == "c") Place(10.0, 100.0) else null }, { false }, served)
        assertEquals(listOf("a", "b", "c"), rows.resume.map { it.id })
    }

    @Test
    fun whatWasFinishedOfflineLeavesContinueWatching() {
        val a = file("a")
        val rows = offlineHomeRows(listOf(a), { Place(99.0, 100.0) }, { true }, ServedRows(resume = listOf("a")))
        assertTrue(rows.resume.isEmpty())
    }

    @Test
    fun aNextUpStartedOfflineMovesToContinueWatching() {
        val e2 = file("s1e2", show = "show", season = 1, episode = 2)
        val e3 = file("s1e3", show = "show", season = 1, episode = 3)
        val rows = offlineHomeRows(
            listOf(e2, e3),
            { if (it.id == "s1e2") Place(30.0, 100.0) else null },
            { false },
            ServedRows(nextUp = listOf("s1e2")),
        )
        assertEquals(listOf("s1e2"), rows.resume.map { it.id })
        assertEquals(listOf("s1e3"), rows.nextUp.map { it.id })
    }

    @Test
    fun nextUpHasOneEpisodePerShow() {
        val e1 = file("s1e1", show = "show", season = 1, episode = 1)
        val e2 = file("s1e2", show = "show", season = 1, episode = 2)
        val e3 = file("s1e3", show = "show", season = 1, episode = 3)
        val rows = offlineHomeRows(listOf(e1, e2, e3), { null }, { it.id == "s1e1" }, ServedRows(nextUp = listOf("s1e3")))
        assertEquals(listOf("s1e3"), rows.nextUp.map { it.id })
    }
}
