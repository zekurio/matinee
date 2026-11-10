package io.github.zekurio.matinee.api

/*
 * What the app adds to the generated models in ContractModels.kt: names
 * it reads them by, and the contract's constants the OpenAPI document
 * doesn't carry.
 */

val TitleSummary.isShow get() = kind == TitleKind.SHOW

val Title.isShow get() = kind == TitleKind.SHOW

/** The title as a card shows it. */
val Title.summary
    get() = TitleSummary(
        id = id, libraryId = libraryId, kind = kind, name = name, year = year,
        overview = overview, images = images, genres = genres, rating = rating,
        contentRating = contentRating, originalLanguage = originalLanguage,
        favorite = favorite, watched = watched,
    )

val User.name get() = displayName?.takeIf { it.isNotBlank() } ?: username
val User.isAdmin get() = role == UserRole.ADMIN

val ProfileUser.name get() = displayName?.takeIf { it.isNotBlank() } ?: username

val AdminUser.name get() = displayName?.takeIf { it.isNotBlank() } ?: username
val AdminUser.isAdmin get() = role == UserRole.ADMIN

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

/** What an image upload may be, as the contract's `ImageUpload`. */
const val MAX_IMAGE_BYTES = 25L * 1024 * 1024
val IMAGE_TYPES = setOf("image/jpeg", "image/png", "image/webp")

/** Stands for the language a title was made in, in [PlaybackPreferences.audioLanguage]. */
const val ORIGINAL_LANGUAGE = "original"

/** What an account that never changed its preferences plays with, as the contract's `DEFAULT_PLAYBACK_PREFERENCES`. */
val DEFAULT_PLAYBACK_PREFERENCES = PlaybackPreferences(
    audioLanguage = null,
    subtitleMode = SubtitleMode.DEFAULT,
    subtitleLanguage = null,
    rememberSubtitles = true,
    skipBackSeconds = DEFAULT_SKIP_SECONDS,
    skipForwardSeconds = DEFAULT_SKIP_SECONDS,
)

/** How far a skip goes when the account hasn't said, as the contract's `DEFAULT_SKIP_SECONDS`. */
const val DEFAULT_SKIP_SECONDS = 10

/** Seconds a skip back moves. The server always fills it in; the model only reads it as optional. */
val PlaybackPreferences.skipBack: Int get() = skipBackSeconds ?: DEFAULT_SKIP_SECONDS

/** Seconds a skip forward moves. */
val PlaybackPreferences.skipForward: Int get() = skipForwardSeconds ?: DEFAULT_SKIP_SECONDS

/** What to assume when `playback.options` doesn't load: H.264 and AAC, which every server encodes to. */
val FALLBACK_PLAYBACK_OPTIONS = PlaybackOptions(
    qualities = emptyList(),
    downloadVideoPresets = emptyList(),
    skipSteps = emptyList(),
    videoCodecs = listOf(TranscodeVideoCodec.H264),
    audioCodecs = listOf(TranscodeAudioCodec.AAC),
    audioLanguages = emptyList(),
    subtitleLanguages = emptyList(),
)

/** A sitting with a file while the server was out of reach, for `playback.offline`; times are ISO instants. */
typealias OfflinePlay = PlaybackOfflineInput.Play

/** The code `playback.start` fails with when nothing this device plays is left, as the contract's `PLAYBACK_UNPLAYABLE`. */
const val PLAYBACK_UNPLAYABLE = "UNPLAYABLE"
