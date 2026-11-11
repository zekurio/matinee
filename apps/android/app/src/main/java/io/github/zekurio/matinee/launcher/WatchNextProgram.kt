package io.github.zekurio.matinee.launcher

import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.ui.ItemLabel
import java.time.Instant

/** The server's two lists, in their order, without local eligibility rules. */
internal fun watchNextPrograms(
    continuing: List<MediaItem>,
    next: List<MediaItem>,
    label: (MediaItem) -> ItemLabel,
): List<WatchNextProgram> = continuing.map { program(it, WatchNextKind.Continue, label(it)) } +
    next.map { program(it, WatchNextKind.Next, label(it)) }

internal enum class WatchNextKind { Continue, Next }

internal data class WatchNextProgram(
    val itemId: String,
    val kind: WatchNextKind,
    val title: String,
    val episodeTitle: String?,
    val description: String?,
    val episode: Boolean,
    val seasonNumber: Int?,
    val episodeNumber: Int?,
    val artworkId: String?,
    val poster: Boolean,
    val durationMillis: Long?,
    val positionMillis: Long?,
    val engagementMillis: Long?,
) {
    /** A hidden entry can return only after playback advances its server timestamp. */
    fun watchedAfter(dismissedAt: Long): Boolean =
        (positionMillis ?: 0) > 0 && engagementMillis != null && engagementMillis > dismissedAt
}

private fun program(item: MediaItem, kind: WatchNextKind, label: ItemLabel): WatchNextProgram {
    val episode = item.title?.kind == TitleKind.SHOW || item.episodeNumber != null
    val images = item.title?.images
    val landscape = item.episode?.still ?: images?.backdrop
    val artwork = landscape ?: images?.poster
    return WatchNextProgram(
        itemId = item.id,
        kind = kind,
        title = if (episode) listOfNotNull(label.showName, label.code, label.title).joinToString(" · ") else label.showName,
        episodeTitle = label.title.takeIf { episode },
        description = item.episode?.overview ?: item.title?.overview,
        episode = episode,
        seasonNumber = item.seasonNumber,
        episodeNumber = item.episodeNumber,
        artworkId = artwork?.id,
        poster = landscape == null,
        durationMillis = item.durationSeconds?.let { (it * 1000).toLong() },
        positionMillis = item.progress?.positionSeconds?.let { (it * 1000).toLong() },
        engagementMillis = item.progress?.updatedAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() },
    )
}
