package io.github.zekurio.matinee.ui.title

import android.content.res.Resources
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalResources
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.Title
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.api.isShow
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.ViewerState
import io.github.zekurio.matinee.ui.channelLayout
import io.github.zekurio.matinee.ui.formatDay
import io.github.zekurio.matinee.ui.formatRuntime
import io.github.zekurio.matinee.ui.languageList
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.runtimeMinutes
import io.github.zekurio.matinee.ui.timeLeft
import io.github.zekurio.matinee.ui.videoSummary

/* What the title, season, and episode pages load and decide, for the phone's pages and the TV's alike. */

/** The person started [item] and hasn't finished it, so Play resumes it. */
fun isResuming(item: MediaItem?): Boolean = item?.progress?.let { !it.completed && it.positionSeconds > 0 } == true

/** A season's files, or with [season] null, the files without a season number. */
@Composable
fun rememberSeasonItems(titleId: String, season: Int?): Loader<List<MediaItem>> =
    rememberLoader("items-$titleId-$season") {
        if (season == null) looseItems(titleId) else titleItems(titleId, season)
    }

/** What Play starts in a season: the episode in progress, else the first unwatched, else the first. */
fun seasonNext(list: List<MediaItem>?, viewer: ViewerState): MediaItem? =
    list?.firstOrNull { it.progress?.completed == false && it.progress.positionSeconds > 0 }
        ?: list?.firstOrNull { !viewer.isWatched(it) }
        ?: list?.firstOrNull()

/** Every episode of the season is watched. */
fun seasonWatched(list: List<MediaItem>?, viewer: ViewerState): Boolean =
    list?.isNotEmpty() == true && list.all { viewer.isWatched(it) }

/** Mark a season watched or not, or with [season] null, the files without a season number. */
suspend fun setSeasonWatched(api: MatineeApi, viewer: ViewerState, title: TitleSummary, season: Int?, watched: Boolean, watchedAt: String?) {
    if (season == null) {
        // Null in the title-wide operation means every season, not the unnumbered files.
        api.looseItems(title.id).forEach { viewer.setWatched(api, it, watched, watchedAt) }
    } else {
        viewer.setWatched(api, title, watched, season, watchedAt)
    }
}

/** A show's page leads with the episode up next: one not finished, of a show with more than one season. */
fun showsNextUp(title: Title): Boolean {
    val next = title.next ?: return false
    return title.isShow && next.progress?.completed != true && title.seasons.size > 1
}

/** A title's facts: its year, then its episode count or runtime, then a show's status. */
fun titleFacts(title: Title, res: Resources): List<String> = listOfNotNull(
    title.year?.toString(),
    if (title.isShow) res.getQuantityString(R.plurals.media_episode_count, title.itemCount, title.itemCount)
    else formatRuntime(title.runtimeMinutes, res),
    if (title.isShow) title.status else null,
)

/** An episode's facts: its air date, then the time left in it, or its runtime. */
fun episodeFacts(item: MediaItem, viewer: ViewerState, res: Resources): List<String> {
    val resuming = isResuming(item) && !viewer.isWatched(item)
    return listOfNotNull(
        formatDay(item.episode?.airDate),
        if (resuming) timeLeft(item, res) else formatRuntime(runtimeMinutes(item), res),
    )
}

/** What a file holds, a line each: the picture, the audio, the subtitles. */
data class FileInfo(val video: String?, val audio: String?, val subtitles: String?)

/** The tracks a file holds, as the server lists them for the player. */
private data class FileTracks(val audio: List<String?>, val subtitles: List<String?>)

/**
 * What [item] holds: the picture, the audio's languages with the main
 * track's layout, and the subtitles' languages. The languages come from the
 * server's track lists, which include subtitle files beside the video;
 * until they load, or if they fail, from what the probe found in the file.
 * Null without a probe, or when it says nothing.
 */
@Composable
fun rememberFileInfo(item: MediaItem): FileInfo? {
    val probe = item.probe ?: return null
    val res = LocalResources.current
    val tracks = rememberLoader("tracks-${item.id}") {
        FileTracks(
            audio = media.audio(item.id).sortedByDescending { it.primary }.map { it.language },
            subtitles = media.subtitles(item.id).tracks.map { it.language },
        )
    }
    val loaded = (tracks.state as? Load.Ready)?.value
    val audio = loaded?.audio ?: probe.audio.sortedByDescending { it.default }.map { it.language }
    val subtitles = loaded?.subtitles ?: probe.subtitles.map { it.language }
    val main = probe.audio.firstOrNull { it.default } ?: probe.audio.firstOrNull()

    val video = videoSummary(item)
    // Each language once; a file whose tracks don't say gets their count instead.
    val audioLine = listOfNotNull(
        languageList(audio) ?: audio.size.takeIf { it > 0 }?.let { res.getQuantityString(R.plurals.media_audio_tracks, it, it) },
        main?.let(::channelLayout),
    ).joinToString(" · ").ifEmpty { null }
    val subtitleLine = languageList(subtitles)
        ?: subtitles.size.takeIf { it > 0 }?.let { res.getQuantityString(R.plurals.media_subtitles, it, it) }
    if (video == null && audioLine == null && subtitleLine == null) return null
    return FileInfo(video, audioLine, subtitleLine)
}
