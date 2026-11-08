package io.github.zekurio.matinee.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/*
 * The parts of the contract (packages/contracts) the app reads, as the REST
 * API under /api/v1 sends them. Dates stay ISO strings until shown. Enums
 * stay strings too, so a value a newer server adds doesn't fail the parse.
 */

@Serializable
data class ImagePlaceholder(val blurhash: String, val aspectRatio: Double)

/** An image from a metadata provider. Load it through [Paths.artwork]. */
@Serializable
data class Artwork(val id: String, val placeholder: ImagePlaceholder? = null)

@Serializable
data class Images(
    val poster: Artwork? = null,
    val backdrop: Artwork? = null,
    val logo: Artwork? = null,
)

object TitleKind {
    const val MOVIE = "movie"
    const val SHOW = "show"
}

/** A movie or show: what a poster stands for. */
@Serializable
data class TitleSummary(
    val id: String,
    val libraryId: String,
    val kind: String,
    val name: String,
    val year: Int? = null,
    val overview: String? = null,
    val images: Images = Images(),
    val genres: List<String> = emptyList(),
    val rating: Double? = null,
    val contentRating: String? = null,
    val originalLanguage: String? = null,
    val favorite: Boolean = false,
    val watched: Boolean = false,
) {
    val isShow get() = kind == TitleKind.SHOW
}

@Serializable
data class WatchState(
    val positionSeconds: Double,
    val completed: Boolean,
    val updatedAt: String,
)

@Serializable
data class EpisodeInfo(
    val name: String? = null,
    val overview: String? = null,
    val airDate: String? = null,
    val runtimeMinutes: Int? = null,
    val still: Artwork? = null,
)

@Serializable
data class ProbeFormat(
    val name: String,
    val durationSeconds: Double? = null,
    val bitRate: Long? = null,
)

@Serializable
data class VideoStream(
    val index: Int,
    val codec: String,
    val codecTag: String? = null,
    val profile: String? = null,
    val level: Int? = null,
    val width: Int,
    val height: Int,
    val frameRate: Double? = null,
    val bitRate: Long? = null,
    val pixelFormat: String? = null,
    val bitDepth: Int? = null,
    val colorTransfer: String? = null,
    val hdr: String? = null,
    val dolbyVisionProfile: Int? = null,
    val hdr10Plus: Boolean = false,
)

@Serializable
data class AudioStream(
    val index: Int,
    val codec: String,
    val profile: String? = null,
    val channels: Int? = null,
    val channelLayout: String? = null,
    val language: String? = null,
    val title: String? = null,
    val default: Boolean = false,
)

@Serializable
data class SubtitleStream(
    val index: Int,
    val codec: String,
    val kind: String? = null,
    val language: String? = null,
    val title: String? = null,
    val default: Boolean = false,
    val forced: Boolean = false,
    val hearingImpaired: Boolean = false,
)

@Serializable
data class MediaProbe(
    val format: ProbeFormat,
    val video: VideoStream? = null,
    val audio: List<AudioStream> = emptyList(),
    val subtitles: List<SubtitleStream> = emptyList(),
)

/** One file: a movie's, or an episode. */
@Serializable
data class MediaItem(
    val id: String,
    val libraryId: String,
    val fileTitle: String,
    val title: TitleSummary? = null,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val episode: EpisodeInfo? = null,
    val relativePath: String,
    val container: String,
    val mimeType: String,
    val sizeBytes: Long,
    val modifiedAt: String,
    val durationSeconds: Double? = null,
    val probe: MediaProbe? = null,
    val progress: WatchState? = null,
    val favorite: Boolean = false,
)

@Serializable
data class FeaturedTitle(val title: TitleSummary, val item: MediaItem, val count: Int)

@Serializable
data class Season(
    val number: Int? = null,
    val name: String,
    val overview: String? = null,
    val poster: Artwork? = null,
    val itemCount: Int,
    val watchedCount: Int,
)

@Serializable
data class ShelfAdditions(val count: Int, val item: MediaItem, val season: Season? = null)

@Serializable
data class ShelfEntry(
    val title: TitleSummary,
    val item: MediaItem,
    val count: Int,
    val addedAt: String,
    val added: ShelfAdditions? = null,
)

object CreditKind {
    const val ACTOR = "actor"
    const val CREATOR = "creator"
    const val DIRECTOR = "director"
    const val WRITER = "writer"
}

@Serializable
data class Credit(
    val kind: String,
    val name: String,
    val role: String? = null,
    val photo: Artwork? = null,
)

@Serializable
data class Facet(val name: String, val titleCount: Int)

@Serializable
data class PersonSummary(
    val name: String,
    val photo: Artwork? = null,
    val kind: String,
    val titleCount: Int,
)

@Serializable
data class PersonCredit(val title: TitleSummary, val kind: String, val role: String? = null)

@Serializable
data class Person(
    val name: String,
    val photo: Artwork? = null,
    val kind: String,
    val titleCount: Int,
    val credits: List<PersonCredit> = emptyList(),
)

@Serializable
data class TitleList(val items: List<TitleSummary>, val total: Int)

@Serializable
data class KindCounts(val movie: Int = 0, val show: Int = 0)

@Serializable
data class BrowsedTitles(
    val items: List<TitleSummary>,
    val total: Int,
    val kinds: KindCounts = KindCounts(),
)

object TitleSort {
    const val NAME = "name"
    const val RECENT = "recent"
    const val YEAR = "year"
}

@Serializable
data class Title(
    val id: String,
    val libraryId: String,
    val kind: String,
    val name: String,
    val year: Int? = null,
    val overview: String? = null,
    val images: Images = Images(),
    val genres: List<String> = emptyList(),
    val rating: Double? = null,
    val contentRating: String? = null,
    val originalLanguage: String? = null,
    val favorite: Boolean = false,
    val watched: Boolean = false,
    val originalName: String? = null,
    val tagline: String? = null,
    val releaseDate: String? = null,
    val status: String? = null,
    val runtimeMinutes: Int? = null,
    val path: String = "",
    val studios: List<String> = emptyList(),
    val credits: List<Credit> = emptyList(),
    val itemCount: Int = 0,
    val seasons: List<Season> = emptyList(),
    val next: MediaItem? = null,
) {
    val isShow get() = kind == TitleKind.SHOW

    val summary
        get() = TitleSummary(
            id = id, libraryId = libraryId, kind = kind, name = name, year = year,
            overview = overview, images = images, genres = genres, rating = rating,
            contentRating = contentRating, originalLanguage = originalLanguage,
            favorite = favorite, watched = watched,
        )
}

@Serializable
data class Library(
    val id: String,
    val name: String,
    val kind: String,
    val itemCount: Int = 0,
    val titleCount: Int = 0,
    val scanning: Boolean = false,
)

@Serializable
data class PlaybackPreferences(
    val audioLanguage: String? = null,
    val subtitleMode: String = SubtitleMode.DEFAULT,
    val subtitleLanguage: String? = null,
    val rememberSubtitles: Boolean = true,
)

object SubtitleMode {
    const val DEFAULT = "default"
    const val ALWAYS = "always"
    const val FOREIGN = "foreign"
    const val FORCED = "forced"
    const val OFF = "off"
    val all = listOf(DEFAULT, ALWAYS, FOREIGN, FORCED, OFF)
}

/** Stands for the language a title was made in, in [PlaybackPreferences.audioLanguage]. */
const val ORIGINAL_LANGUAGE = "original"

@Serializable
data class ProfileSharing(val favorites: Boolean = false, val stats: Boolean = false)

@Serializable
data class User(
    val id: String,
    val username: String,
    val displayName: String? = null,
    val role: String,
    val avatarId: String? = null,
    val playback: PlaybackPreferences? = null,
    val sharing: ProfileSharing = ProfileSharing(),
) {
    val name get() = displayName?.takeIf { it.isNotBlank() } ?: username
    val isAdmin get() = role == "admin"
}

@Serializable
data class SessionUser(val user: User? = null)

@Serializable
data class ProfileUser(
    val id: String,
    val username: String,
    val displayName: String? = null,
    val role: String,
    val avatarId: String? = null,
) {
    val name get() = displayName?.takeIf { it.isNotBlank() } ?: username
}

@Serializable
data class SearchResults(
    val users: List<ProfileUser> = emptyList(),
    val titles: List<TitleSummary> = emptyList(),
    val people: List<PersonSummary> = emptyList(),
    val genres: List<Facet> = emptyList(),
    val studios: List<Facet> = emptyList(),
)

@Serializable
data class SetupState(val accountRequired: Boolean = false)

@Serializable
data class OidcConfig(val displayName: String, val allowSignUp: Boolean = false)

@Serializable
data class AuthConfig(
    val setup: SetupState? = null,
    val passkeys: Boolean = true,
    val passkeySignUp: Boolean = false,
    val oidc: OidcConfig? = null,
)

@Serializable
data class AppSession(val token: String, val user: User)

@Serializable
data class DeviceCode(
    val deviceCode: String,
    val userCode: String,
    val verificationUri: String,
    val verificationUriComplete: String,
    val expiresIn: Int,
    val interval: Int,
)

/** `pending` until someone approves, then `approved` with the session. */
@Serializable
data class DeviceSignIn(val status: String, val token: String? = null, val user: User? = null)

/** A place the account is signed in. */
@Serializable
data class AccountSession(
    val id: String,
    val current: Boolean,
    val client: String,
    val deviceName: String? = null,
    val platform: String? = null,
    val browser: String? = null,
    val createdAt: String,
    val lastSeenAt: String,
)

object SubtitleDelivery {
    const val WEBVTT = "webvtt"
    const val PGS = "pgs"
    const val BURN_IN = "burn-in"
}

@Serializable
data class SubtitleTrack(
    val id: String,
    val label: String,
    val language: String? = null,
    val title: String? = null,
    val forced: Boolean = false,
    val sdh: Boolean = false,
    val default: Boolean = false,
    val source: String,
    val format: String,
    val delivery: String? = null,
)

@Serializable
data class Subtitles(val tracks: List<SubtitleTrack> = emptyList(), val audioLanguage: String? = null)

@Serializable
data class AudioTrack(
    val index: Int,
    val label: String,
    val language: String? = null,
    val title: String? = null,
    val codec: String,
    val format: String,
    val channels: Int? = null,
    val layout: String? = null,
    val primary: Boolean = false,
)

@Serializable
data class Keyframes(val before: Double, val after: Double? = null)

@Serializable
data class Trickplay(
    val key: String,
    val width: Int,
    val height: Int,
    val columns: Int,
    val rows: Int,
    val count: Int,
    val intervalSeconds: Double,
)

@Serializable
data class TrickplayStatus(val status: String, val images: Trickplay? = null)

@Serializable
data class PlaybackOptions(
    val videoCodecs: List<String> = listOf("h264"),
    val audioCodecs: List<String> = listOf("aac"),
    val audioLanguages: List<String> = emptyList(),
    val subtitleLanguages: List<String> = emptyList(),
)

/** What the server sends with a failed request. */
@Serializable
data class ApiErrorBody(
    val code: String? = null,
    val status: Int? = null,
    val message: String? = null,
)

// Request bodies.

@Serializable
internal data class SeasonBody(val season: Int?)

@Serializable
internal data class WatchedBody(val watched: Boolean, val watchedAt: String? = null)

@Serializable
internal data class TitleWatchedBody(
    val watched: Boolean,
    @SerialName("season") val season: Int? = null,
    val watchedAt: String? = null,
)

@Serializable
internal data class FavoriteBody(val favorite: Boolean)

@Serializable
internal data class ProgressBody(
    val positionSeconds: Double,
    val durationSeconds: Double? = null,
    val sessionId: String? = null,
    val playedSeconds: Double? = null,
    val paused: Boolean? = null,
    val closed: Boolean? = null,
)

@Serializable
internal data class AppTokenBody(val code: String, val codeVerifier: String)

@Serializable
internal data class AppDeviceBody(val name: String?, val platform: String)

@Serializable
internal data class DeviceCodeBody(val deviceCode: String)

// Downloads, from packages/contracts/src/downloads.ts.

/** The video of a download: `copy` keeps it, `encode` makes it fit [maxHeight] at about [bitrate]. */
@Serializable
data class DownloadVideoSpec(
    val mode: String,
    val codec: String? = null,
    val maxHeight: Int? = null,
    val bitrate: Int? = null,
)

/** One audio track of a download, by its index from `media.audio`, kept or converted. */
@Serializable
data class DownloadAudioSpec(
    val index: Int,
    val mode: String,
    val codec: String? = null,
    val channels: Int? = null,
)

/** What a download holds. Audio goes in the order listed; the first is the default. */
@Serializable
data class DownloadSpec(val video: DownloadVideoSpec, val audio: List<DownloadAudioSpec>)

@Serializable
data class DownloadPlanVideo(
    val mode: String,
    val codec: String,
    val width: Int,
    val height: Int,
    val bitrate: Long? = null,
)

@Serializable
data class DownloadPlanAudio(
    val index: Int,
    val label: String,
    val language: String? = null,
    val mode: String,
    val codec: String,
    val channels: Int? = null,
)

/** What a download will hold, as the server worked it out. */
@Serializable
data class DownloadPlan(
    val durationSeconds: Double,
    val estimatedBytes: Long,
    val segmentSeconds: Double = 6.0,
    val video: DownloadPlanVideo,
    val audio: List<DownloadPlanAudio> = emptyList(),
)

/** A download `downloads.start` set up, which the app then fetches in segments. */
@Serializable
data class ServerDownload(
    val id: String,
    val itemId: String,
    val fileName: String,
    val plan: DownloadPlan,
)

@Serializable
internal data class DownloadSpecBody(val spec: DownloadSpec)
