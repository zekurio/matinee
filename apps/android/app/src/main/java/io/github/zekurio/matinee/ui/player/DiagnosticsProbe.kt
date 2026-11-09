package io.github.zekurio.matinee.ui.player

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaLibraryInfo
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.HttpDataSource
import androidx.media3.decoder.ffmpeg.FfmpegLibrary
import androidx.media3.exoplayer.ExoPlaybackException
import androidx.media3.exoplayer.mediacodec.MediaCodecDecoderException
import androidx.media3.exoplayer.mediacodec.MediaCodecRenderer
import io.github.zekurio.matinee.BuildConfig

/*
 * Reads what a playback report holds from Android and Media3, through
 * Safe's checks. It takes only typed fields: never an exception's message,
 * a URI, a Format's label or language, or the device's serial or name.
 */

/** The app's version, Android's, and the model; nothing that tells one phone of a model from another. */
@OptIn(UnstableApi::class)
fun deviceDiagnostics(context: Context): DeviceDiagnostics = DeviceDiagnostics.of(
    appVersion = BuildConfig.VERSION_NAME,
    appBuild = BuildConfig.VERSION_CODE,
    buildType = BuildConfig.BUILD_TYPE,
    androidRelease = Build.VERSION.RELEASE,
    sdk = Build.VERSION.SDK_INT,
    manufacturer = Build.MANUFACTURER,
    model = Build.MODEL,
    abi = Build.SUPPORTED_ABIS.firstOrNull(),
    tv = context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK),
    media3 = MediaLibraryInfo.VERSION,
    ffmpeg = runCatching { FfmpegLibrary.isAvailable() }.getOrDefault(false),
)

private fun trackKind(type: Int) = when (type) {
    C.TRACK_TYPE_VIDEO -> TrackKind.VIDEO
    C.TRACK_TYPE_AUDIO -> TrackKind.AUDIO
    C.TRACK_TYPE_TEXT -> TrackKind.TEXT
    else -> TrackKind.OTHER
}

private fun Int.known() = takeIf { it != Format.NO_VALUE && it > 0 }

/** A format by its MIME type, codec string, and size or channels; not its id, label, or language. */
@OptIn(UnstableApi::class)
fun formatDiagnostics(type: TrackKind, format: Format, selected: Boolean, support: Int?) = TrackDiagnostics(
    type = type,
    selected = selected,
    mime = Safe.mime(format.sampleMimeType),
    codecs = Safe.token(format.codecs, 40),
    width = format.width.known(),
    height = format.height.known(),
    channels = format.channelCount.known(),
    sampleRate = format.sampleRate.known(),
    bitrate = format.bitrate.known(),
    support = support?.let { Safe.constant(C.getFormatSupportString(it)) },
)

/**
 * The video and audio tracks the player picked, or, for a type it picked
 * none of, the first it had, which tells why: support says what the device
 * makes of it.
 */
@OptIn(UnstableApi::class)
fun trackDiagnostics(tracks: Tracks): List<TrackDiagnostics> = buildList {
    for (kind in listOf(C.TRACK_TYPE_VIDEO, C.TRACK_TYPE_AUDIO)) {
        val type = trackKind(kind)
        val groups = tracks.groups.filter { it.type == kind && it.length > 0 }
        val selected = groups.flatMap { group ->
            (0 until group.length).filter(group::isTrackSelected).map { formatDiagnostics(type, group.getTrackFormat(it), true, group.getTrackSupport(it)) }
        }
        if (selected.isNotEmpty()) {
            addAll(selected.take(2))
        } else {
            groups.firstOrNull()?.let { add(formatDiagnostics(type, it.getTrackFormat(0), false, it.getTrackSupport(0))) }
        }
    }
}.take(MAX_TRACKS)

/**
 * An error by its codes. The message, and every cause's, can hold the
 * file's URL with its token or a path on the phone, so none are read.
 */
@OptIn(UnstableApi::class)
fun errorDiagnostics(e: PlaybackException): ErrorDiagnostics {
    val exo = e as? ExoPlaybackException
    val causes = generateSequence(e.cause) { it.cause }.take(MAX_CAUSES + 2).toList()
    val http = causes.firstNotNullOfOrNull { (it as? HttpDataSource.InvalidResponseCodeException)?.responseCode }
    val init = causes.firstNotNullOfOrNull { it as? MediaCodecRenderer.DecoderInitializationException }
    val decoding = causes.firstNotNullOfOrNull { it as? MediaCodecDecoderException }
    val renderer = exo?.type == ExoPlaybackException.TYPE_RENDERER
    return ErrorDiagnostics(
        code = e.errorCode,
        name = Safe.constant(e.errorCodeName),
        type = exo?.let {
            Safe.token(
                when (it.type) {
                    ExoPlaybackException.TYPE_SOURCE -> "source"
                    ExoPlaybackException.TYPE_RENDERER -> "renderer"
                    ExoPlaybackException.TYPE_REMOTE -> "remote"
                    else -> "unexpected"
                },
            )
        },
        renderer = exo?.rendererName?.takeIf { renderer }?.let { Safe.token(it, 64) },
        format = exo?.rendererFormat?.takeIf { renderer }?.let { formatDiagnostics(trackKind(MimeTypes.getTrackType(it.sampleMimeType)), it, true, null) },
        formatSupport = exo?.takeIf { renderer }?.let { Safe.constant(C.getFormatSupportString(it.rendererFormatSupport)) },
        httpStatus = http,
        decoder = (init?.codecInfo?.name ?: decoding?.codecInfo?.name)?.let { Safe.token(it, 64) },
        secureDecoder = init?.secureDecoderRequired,
        // Class names only, which R8 shortens in a release build.
        causes = causes.take(MAX_CAUSES).mapNotNull { Safe.token(it.javaClass.simpleName, 64) },
    )
}
