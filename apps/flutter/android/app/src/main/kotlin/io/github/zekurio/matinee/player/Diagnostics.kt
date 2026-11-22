package io.github.zekurio.matinee.player

import android.app.UiModeManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.res.Configuration
import android.os.Build
import androidx.annotation.OptIn
import androidx.core.content.pm.PackageInfoCompat
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

/*
 * What the playback report reads of the device and Media3. It reads codes,
 * never messages: an error's message, and every cause's, can hold the file's
 * address with its token. Dart checks every string again before the report
 * keeps it.
 */

/** How many of an error's causes the report names. */
private const val MAX_CAUSES = 3

/** The video and audio tracks a report lists, at most. */
private const val MAX_TRACKS = 4

internal fun deviceDiagnostics(context: Context): DeviceDiagnosticsMessage {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val debuggable = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    val tv = context.getSystemService(UiModeManager::class.java)?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
    return DeviceDiagnosticsMessage(
        appBuild = PackageInfoCompat.getLongVersionCode(info),
        buildType = if (debuggable) "debug" else "release",
        release = Build.VERSION.RELEASE,
        sdk = Build.VERSION.SDK_INT.toLong(),
        manufacturer = Build.MANUFACTURER,
        model = Build.MODEL,
        abi = Build.SUPPORTED_ABIS.firstOrNull(),
        tv = tv,
        media3 = MediaLibraryInfo.VERSION,
        ffmpeg = runCatching { FfmpegLibrary.isAvailable() }.getOrDefault(false),
    )
}

private fun trackKind(type: Int) = when (type) {
    C.TRACK_TYPE_VIDEO -> TrackKindMessage.VIDEO
    C.TRACK_TYPE_AUDIO -> TrackKindMessage.AUDIO
    C.TRACK_TYPE_TEXT -> TrackKindMessage.TEXT
    else -> TrackKindMessage.OTHER
}

private fun Int.known(): Long? = takeIf { it != Format.NO_VALUE && it > 0 }?.toLong()

/** A format by its MIME type, codec string, and size or channels; not its id, label, or language. */
@OptIn(UnstableApi::class)
private fun formatDiagnostics(type: TrackKindMessage, format: Format, selected: Boolean, support: Int?) =
    FormatDiagnosticsMessage(
        type = type,
        selected = selected,
        mime = format.sampleMimeType,
        codecs = format.codecs,
        width = format.width.known(),
        height = format.height.known(),
        channels = format.channelCount.known(),
        sampleRate = format.sampleRate.known(),
        bitrate = format.bitrate.known(),
        support = support?.let(C::getFormatSupportString),
    )

/**
 * The video and audio tracks the player picked, or, for a type it picked
 * none of, the first it had, which tells why: support says what the device
 * makes of it.
 */
@OptIn(UnstableApi::class)
internal fun trackDiagnostics(tracks: Tracks): List<FormatDiagnosticsMessage> = buildList {
    for (kind in listOf(C.TRACK_TYPE_VIDEO, C.TRACK_TYPE_AUDIO)) {
        val type = trackKind(kind)
        val groups = tracks.groups.filter { it.type == kind && it.length > 0 }
        val selected = groups.flatMap { group ->
            (0 until group.length).filter(group::isTrackSelected)
                .map { formatDiagnostics(type, group.getTrackFormat(it), true, group.getTrackSupport(it)) }
        }
        if (selected.isNotEmpty()) {
            addAll(selected.take(2))
        } else {
            groups.firstOrNull()?.let { add(formatDiagnostics(type, it.getTrackFormat(0), false, it.getTrackSupport(0))) }
        }
    }
}.take(MAX_TRACKS)

/** An error by its codes, none of its messages. */
@OptIn(UnstableApi::class)
internal fun errorDiagnostics(e: PlaybackException): ErrorDiagnosticsMessage {
    val exo = e as? ExoPlaybackException
    val causes = generateSequence(e.cause) { it.cause }.take(MAX_CAUSES + 2).toList()
    val http = causes.firstNotNullOfOrNull { (it as? HttpDataSource.InvalidResponseCodeException)?.responseCode }
    val init = causes.firstNotNullOfOrNull { it as? MediaCodecRenderer.DecoderInitializationException }
    val decoding = causes.firstNotNullOfOrNull { it as? MediaCodecDecoderException }
    val renderer = exo?.type == ExoPlaybackException.TYPE_RENDERER
    return ErrorDiagnosticsMessage(
        code = e.errorCode.toLong(),
        name = e.errorCodeName,
        type = exo?.let {
            when (it.type) {
                ExoPlaybackException.TYPE_SOURCE -> "source"
                ExoPlaybackException.TYPE_RENDERER -> "renderer"
                ExoPlaybackException.TYPE_REMOTE -> "remote"
                else -> "unexpected"
            }
        },
        renderer = exo?.rendererName?.takeIf { renderer },
        format = exo?.rendererFormat?.takeIf { renderer }
            ?.let { formatDiagnostics(trackKind(MimeTypes.getTrackType(it.sampleMimeType)), it, true, null) },
        formatSupport = exo?.takeIf { renderer }?.let { C.getFormatSupportString(it.rendererFormatSupport) },
        httpStatus = http?.toLong(),
        decoder = init?.codecInfo?.name ?: decoding?.codecInfo?.name,
        secureDecoder = init?.secureDecoderRequired,
        // Class names only, which R8 shortens in a release build.
        causes = causes.take(MAX_CAUSES).map { it.javaClass.simpleName },
    )
}

/** The video stopping while playback goes on, as Media3 would name a decoder failing. */
internal fun frozenDiagnostics() = ErrorDiagnosticsMessage(
    code = PlaybackException.ERROR_CODE_DECODING_FAILED.toLong(),
    name = PlaybackException.getErrorCodeName(PlaybackException.ERROR_CODE_DECODING_FAILED),
    causes = emptyList(),
)
