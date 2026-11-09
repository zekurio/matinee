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
    /** The provider entry it's matched to; null while it has none. */
    val providerId: String? = null,
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
    /** The provider its metadata comes from, by id; null when it has none. */
    val metadataProvider: String? = null,
    /** One of its titles' backdrops, a different one each day. */
    val backdrop: Artwork? = null,
)

/** A source of metadata the server knows, as in `metadata.providers`. */
@Serializable
data class MetadataProvider(
    val id: String,
    val name: String,
    /** The server has the API key it needs. */
    val configured: Boolean = false,
)

/** A candidate from a provider search, for fixing a wrong match. */
@Serializable
data class MetadataMatch(
    val provider: String,
    val id: String,
    val name: String,
    val year: Int? = null,
    val overview: String? = null,
    val poster: Artwork? = null,
)

/** One image of a title, season, or episode, for editing it. */
@Serializable
data class ItemImage(
    val slot: String,
    /** Null when it has none. */
    val image: Artwork? = null,
    /** An admin picked, uploaded, or removed it, so fetching the metadata again leaves it alone. */
    val chosen: Boolean = false,
    val uploaded: Boolean = false,
)

/** An image the library's provider has for a title, season, or episode. */
@Serializable
data class RemoteImage(
    val id: String,
    val preview: Artwork,
    val width: Int? = null,
    val height: Int? = null,
    /** BCP 47 tag of the text on it; null for none, or when the provider doesn't say. */
    val language: String? = null,
)

/**
 * Whose images: a title's own, one of its seasons' with [season], or an
 * episode's with [season] and [episode], as the contract's `ImageTarget`.
 */
data class ImageTarget(val titleId: String, val season: Int? = null, val episode: Int? = null) {
    /** The images there are to edit: a title's poster, backdrop, and logo, a season's poster, an episode's still. */
    val slots: List<String>
        get() = when {
            season == null -> listOf(ImageSlot.POSTER, ImageSlot.BACKDROP, ImageSlot.LOGO)
            episode == null -> listOf(ImageSlot.POSTER)
            else -> listOf(ImageSlot.STILL)
        }
}

object ImageSlot {
    const val POSTER = "poster"
    const val BACKDROP = "backdrop"
    const val LOGO = "logo"
    const val STILL = "still"
}

/** What an image upload may be, as the contract's `ImageUpload`. */
const val MAX_IMAGE_BYTES = 25L * 1024 * 1024
val IMAGE_TYPES = setOf("image/jpeg", "image/png", "image/webp")

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
    /** When the account was made, an ISO time. */
    val createdAt: String? = null,
) {
    val name get() = displayName?.takeIf { it.isNotBlank() } ?: username
}

/** A profile as the contract's `profiles.get` has it; a list is null when its owner doesn't share it. */
@Serializable
data class Profile(
    val user: ProfileUser,
    val self: Boolean,
    val sharing: ProfileSharing = ProfileSharing(),
    val favorites: List<TitleSummary>? = null,
    val favoriteItems: List<MediaItem>? = null,
    val recent: List<WatchedEntry>? = null,
)

/** A file someone played, for "recently watched". */
@Serializable
data class WatchedEntry(val item: MediaItem, val watchedAt: String, val completed: Boolean = false)

/** How far back statistics look, ending now, as the contract's `StatsRange`. */
val STATS_RANGES = listOf("7d", "30d", "90d", "365d", "all")

/** What someone watched in a range: `profiles.stats`. */
@Serializable
data class WatchStats(
    val range: String,
    /** How long each bucket is: `day`, `week`, or `month`. */
    val unit: String,
    val totals: WatchTotals,
    val buckets: List<StatsBucket> = emptyList(),
    /** Only the hours with watch time. */
    val activity: List<ActivityCell> = emptyList(),
    val genres: List<GenreStat> = emptyList(),
    val titles: List<TitleStat> = emptyList(),
)

/** Watch time of sessions that started in one hour of one weekday; [weekday] 1 is Monday. */
@Serializable
data class ActivityCell(val weekday: Int, val hour: Int, val watchSeconds: Double = 0.0)

/** A place on a board of `stats.leaderboard`; [value] is seconds for watch time, days for streaks, a count for the rest. */
@Serializable
data class LeaderboardEntry(val rank: Int, val user: ProfileUser, val value: Double, val self: Boolean = false)

/** One metric's places: the top ten, then the viewer between their neighbors when they rank lower. */
@Serializable
data class LeaderboardBoard(val metric: String, val entries: List<LeaderboardEntry> = emptyList())

@Serializable
data class Leaderboard(val range: String, val boards: List<LeaderboardBoard> = emptyList(), val sharing: Boolean = false)

@Serializable
data class WatchTotals(
    val watchSeconds: Double = 0.0,
    val plays: Int = 0,
    val movies: Int = 0,
    val episodes: Int = 0,
    val shows: Int = 0,
)

/** Watch time in one day, week, or month; [start] is its first day, YYYY-MM-DD. */
@Serializable
data class StatsBucket(val start: String, val watchSeconds: Double = 0.0, val plays: Int = 0)

@Serializable
data class GenreStat(val name: String, val watchSeconds: Double = 0.0)

@Serializable
data class TitleStat(val title: TitleSummary, val watchSeconds: Double = 0.0, val plays: Int = 0)

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
    /** Accents an admin picked for the Matinee theme on this server. */
    val themeAccents: ThemeAccents = ThemeAccents(),
)

/** An accent per appearance for the Matinee theme, as `#rrggbb`; null keeps its own. */
@Serializable
data class ThemeAccents(val light: String? = null, val dark: String? = null)

/** A sitting with a file while the server was out of reach; times are ISO instants. */
@Serializable
data class OfflinePlay(
    val sessionId: String,
    val itemId: String,
    val startedAt: String,
    val endedAt: String,
    val playedSeconds: Double,
    val positionSeconds: Double,
    val durationSeconds: Double? = null,
)

@Serializable
internal data class OfflinePlays(val plays: List<OfflinePlay>)

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

/** A device waiting for someone to approve its code. */
@Serializable
data class DeviceRequest(
    val userCode: String,
    val deviceName: String? = null,
    val platform: String,
    val expiresAt: String,
)

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

/** `watchedAt` for the day a file came out: an episode's air date, a movie's release date. */
const val WATCHED_RELEASED = "released"

/** `watchedAt` for a time the user doesn't remember: counted in totals, charted nowhere. */
const val WATCHED_UNKNOWN = "unknown"

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
internal data class IdentifyBody(val providerId: String)

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
