package io.github.zekurio.matinee.ui.player

import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.PLAYBACK_BUSY
import io.github.zekurio.matinee.api.PLAYBACK_RESTRICTED
import io.github.zekurio.matinee.api.PlaybackDevice
import io.github.zekurio.matinee.api.PlaybackMethod
import io.github.zekurio.matinee.api.PlaybackSnap
import io.github.zekurio.matinee.api.PlaybackStart
import io.github.zekurio.matinee.api.PlaybackStartInput
import io.github.zekurio.matinee.api.PlaybackSubtitleMode
import io.github.zekurio.matinee.api.SubtitleDelivery
import io.github.zekurio.matinee.api.SubtitlePick
import io.github.zekurio.matinee.api.SubtitleSource
import io.github.zekurio.matinee.api.SubtitleTrack
import kotlin.math.roundToLong

/*
 * The player's side of `playback.start`. The server picks the source, the
 * audio, and the subtitle; the player keeps what the viewer picked and
 * which methods failed, sends all of it with every call, and loads what
 * comes back. Plain Kotlin, so the JVM tests run it.
 */

/** What the viewer picked in this sitting. What's left out, the server picks. */
data class Picks(val audio: Int? = null, val subtitle: SubtitlePick? = null, val quality: String? = null) {
    /** These picks with [change] on top. */
    operator fun plus(change: Picks) = Picks(
        audio = change.audio ?: audio,
        subtitle = change.subtitle ?: subtitle,
        quality = change.quality ?: quality,
    )
}

/** Something to tell the viewer about an answer. */
enum class NoticeKind { BURN_IN_FAILED, QUALITY_FAILED, SWITCH_FAILED }

/**
 * Why the server won't play the file for this account now: its access
 * rules out every way left, or it plays on as many devices as it may.
 * Asking again gets the same answer, so the player shows the server's
 * message and stops.
 */
enum class Refusal { RESTRICTED, BUSY }

/** The refusal [e] is, or null for any other failure. */
fun refusal(e: Exception): Refusal? = when ((e as? ApiException)?.code) {
    PLAYBACK_RESTRICTED -> Refusal.RESTRICTED
    PLAYBACK_BUSY -> Refusal.BUSY
    else -> null
}

/**
 * What every `playback.start` of a sitting carries again, since the server
 * keeps nothing between calls: the viewer's picks, and the methods that
 * didn't play, which the server never answers with.
 */
data class Asking(val picks: Picks = Picks(), val failed: List<String> = emptyList()) {
    /**
     * The picks with [change] on top. A pick that may take an encode, a
     * quality or a subtitle in pictures, tries encodes again after one
     * failed, since the viewer asked for it. [tracks] are the file's.
     */
    fun pick(change: Picks, tracks: List<SubtitleTrack>): Asking {
        val subtitle = tracks.firstOrNull { it.id == change.subtitle?.trackId }
        val encodes = (change.quality != null && change.quality != ORIGINAL_QUALITY) ||
            (subtitle != null && subtitle.delivery != SubtitleDelivery.WEBVTT)
        return Asking(picks + change, if (encodes) failed - PlaybackMethod.TRANSCODE else failed)
    }

    /** With [method] among the failed, so the server falls back past it. */
    fun fail(method: String) = if (method in failed) this else copy(failed = failed + method)

    /** Every method tried again, as a retry does. */
    fun forgetFailures() = copy(failed = emptyList())

    /** The call for [at] seconds into the file, or where the viewer stopped for null. */
    fun input(itemId: String, sessionId: String, device: PlaybackDevice, at: Double?, snap: String = PlaybackSnap.BEFORE) =
        PlaybackStartInput(
            itemId = itemId,
            sessionId = sessionId,
            device = device,
            audio = picks.audio,
            subtitle = picks.subtitle,
            quality = picks.quality,
            position = at?.coerceAtLeast(0.0),
            snap = snap,
            failed = failed,
        )

    /**
     * What an answer to a failure leaves of the picks. An encode that burned
     * a subtitle in failed, and the server played on without it, so the
     * subtitle is off. An encode at a picked quality failed, and the
     * original plays, so that's the pick. A source that failed while it
     * played the original, as when the picked quality is one the account
     * may not use, lost nothing the viewer picked. [lost] is the answer
     * whose source failed, null for an answer to anything else.
     */
    fun settle(lost: PlaybackStart?, plan: PlaybackStart): Pair<Asking, NoticeKind?> = when {
        lost == null -> this to null
        lost.subtitleMode == PlaybackSubtitleMode.BURN_IN && plan.subtitleMode != PlaybackSubtitleMode.BURN_IN ->
            copy(picks = picks.copy(subtitle = SubtitlePick(null))) to NoticeKind.BURN_IN_FAILED
        picks.quality != null && picks.quality != ORIGINAL_QUALITY &&
            lost.quality != ORIGINAL_QUALITY && plan.quality == ORIGINAL_QUALITY ->
            copy(picks = picks.copy(quality = ORIGINAL_QUALITY)) to NoticeKind.QUALITY_FAILED
        else -> this to null
    }
}

/** How the player reads a source: the file by what it finds in it, a stream as MP4, an encode as HLS. */
enum class SourceKind { FILE, MP4, HLS }

/** A seek within the source the player has, a new copied stream from `playback.seek`, or a new answer. */
enum class SeekWay { IN_SOURCE, NEW_STREAM, NEW_START }

/**
 * What the player loads: the source of an answer, a stream from
 * `playback.seek` in its place, or a download. [offset] is where in the
 * file its time 0 is, above 0 only for a stream that starts partway in.
 * [start] is where it begins playing, in its own time. Positions, the
 * seek bar, subtitles, and trickplay all count in the file's time, which
 * is the source's time plus [offset].
 */
data class Source(
    /** The answer's method, or null for a download. */
    val method: String?,
    val url: String,
    val hls: Boolean,
    val offset: Double,
    val start: Double,
) {
    val mode: SourceMode
        get() = when {
            method == null -> SourceMode.LOCAL
            method == PlaybackMethod.DIRECT -> SourceMode.DIRECT
            hls -> SourceMode.HLS
            method == PlaybackMethod.REMUX -> SourceMode.STREAM
            else -> SourceMode.ENCODE
        }

    val kind: SourceKind
        get() = when (mode) {
            SourceMode.DIRECT, SourceMode.LOCAL -> SourceKind.FILE
            SourceMode.HLS -> SourceKind.HLS
            SourceMode.STREAM, SourceMode.ENCODE -> SourceKind.MP4
        }

    /** Where in the file it begins. */
    val position: Double get() = offset + start

    /** Where the player starts it, in its own time. */
    val startMs: Long get() = (start * 1000).roundToLong()

    /** The file and HLS seek by themselves. A copied stream starts over from `playback.seek`, another encode from `playback.start`. */
    val seeksItself: Boolean get() = mode == SourceMode.DIRECT || mode == SourceMode.LOCAL || mode == SourceMode.HLS

    /** It is the file, with all its tracks, so the player picks the audio inside it. */
    val holdsTracks: Boolean get() = mode == SourceMode.DIRECT || mode == SourceMode.LOCAL

    /** What a seek in it takes. */
    val seek: SeekWay
        get() = when {
            seeksItself -> SeekWay.IN_SOURCE
            mode == SourceMode.STREAM -> SeekWay.NEW_STREAM
            else -> SeekWay.NEW_START
        }

    /** Seconds into the file at [ms] into this source. */
    fun fileSeconds(ms: Long): Double = offset + ms / 1000.0

    /** Where [seconds] into the file is in this source. */
    fun sourceMs(seconds: Double): Long = ((seconds - offset) * 1000).roundToLong().coerceAtLeast(0)

    companion object {
        /** An answer's source, its path made an address by [resolve]. */
        fun of(plan: PlaybackStart, resolve: (String) -> String) =
            Source(plan.method, resolve(plan.url), plan.hls, plan.offset, plan.start)

        /** A download at [url], from [at] seconds in. */
        fun local(url: String, at: Double) = Source(null, url, false, 0.0, at.coerceAtLeast(0.0))
    }
}

/**
 * Whether [next] plays from what [current] loaded, so the player keeps it:
 * the file, whose audio the player picks inside it, or a stream of the
 * same audio, quality, and picture. Only where it starts differs, as after
 * a subtitle the player draws.
 */
fun sameSource(current: PlaybackStart, next: PlaybackStart): Boolean {
    if (current.method != next.method || current.hls != next.hls) return false
    if (next.method == PlaybackMethod.DIRECT) return true
    return current.audio?.index == next.audio?.index &&
        current.quality == next.quality &&
        current.convertedAudio == next.convertedAudio &&
        burnedIn(current) == burnedIn(next)
}

private fun burnedIn(plan: PlaybackStart) = plan.subtitle?.id?.takeIf { plan.subtitleMode == PlaybackSubtitleMode.BURN_IN }

/** Who draws the subtitle that shows, and from where. */
sealed interface SubtitleShow {
    val track: SubtitleTrack?

    data object Off : SubtitleShow {
        override val track: SubtitleTrack? get() = null
    }

    /** The player screen draws WebVTT from [url], or from the file saved beside a download. */
    data class Screen(override val track: SubtitleTrack, val url: String) : SubtitleShow

    /** ExoPlayer or mpv draws a stream of the file it plays, by its index there. */
    data class InFile(override val track: SubtitleTrack, val stream: Int) : SubtitleShow

    /** mpv draws the PGS file at [url] over the video. */
    data class Overlay(override val track: SubtitleTrack, val url: String) : SubtitleShow

    /** The server burned it into the picture. */
    data class Burned(override val track: SubtitleTrack) : SubtitleShow
}

val SubtitleShow.rendering: SubtitleRendering?
    get() = when (this) {
        SubtitleShow.Off -> null
        is SubtitleShow.Screen -> SubtitleRendering.SCREEN
        is SubtitleShow.InFile, is SubtitleShow.Overlay -> SubtitleRendering.PLAYER
        is SubtitleShow.Burned -> SubtitleRendering.BURN_IN
    }

/** The index ffprobe gives a stream inside the file, from its track id, `stream-3`. */
fun streamIndex(track: SubtitleTrack): Int? =
    track.id.takeIf { track.source == SubtitleSource.EMBEDDED && it.startsWith("stream-") }?.removePrefix("stream-")?.toIntOrNull()

/**
 * How the subtitle of [plan] shows, by its `subtitleMode`: `client` is
 * WebVTT the screen draws, or a PGS file mpv draws; `player` a stream of
 * the file the engine draws; `burn-in` part of the picture. [mpv] says
 * which engine plays.
 */
fun subtitleShow(plan: PlaybackStart, mpv: Boolean): SubtitleShow {
    val track = plan.subtitle ?: return SubtitleShow.Off
    return when (plan.subtitleMode) {
        PlaybackSubtitleMode.BURN_IN -> SubtitleShow.Burned(track)
        PlaybackSubtitleMode.PLAYER -> streamIndex(track)?.let { SubtitleShow.InFile(track, it) } ?: SubtitleShow.Off
        PlaybackSubtitleMode.CLIENT -> {
            val url = plan.subtitleUrl ?: return SubtitleShow.Off
            when {
                track.delivery == SubtitleDelivery.WEBVTT -> SubtitleShow.Screen(track, url)
                track.delivery == SubtitleDelivery.PGS && mpv -> SubtitleShow.Overlay(track, url)
                else -> SubtitleShow.Off
            }
        }
        else -> SubtitleShow.Off
    }
}
