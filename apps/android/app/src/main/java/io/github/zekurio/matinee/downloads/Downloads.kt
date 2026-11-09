package io.github.zekurio.matinee.downloads

import android.content.Context
import androidx.core.content.edit
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.DownloadAudioSpec
import io.github.zekurio.matinee.api.DownloadPlan
import io.github.zekurio.matinee.api.DownloadSpec
import io.github.zekurio.matinee.api.DownloadVideoSpec
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.ui.player.Capabilities
import io.github.zekurio.matinee.ui.player.audioChoice
import io.github.zekurio.matinee.ui.player.baseLanguage
import io.github.zekurio.matinee.ui.player.deviceLanguage
import io.github.zekurio.matinee.ui.player.drawable
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** A size and rate a version for this device can be encoded at, from DOWNLOAD_VIDEO_PRESETS. */
data class VideoPreset(val height: Int, val bitrate: Int)

val VIDEO_PRESETS = listOf(
    VideoPreset(1080, 6_000_000),
    VideoPreset(720, 2_500_000),
    VideoPreset(480, 1_500_000),
)

/** Codecs MP4 holds, so a download can keep them as they are (DOWNLOAD_COPY_*_CODECS). */
private val COPY_VIDEO = setOf("h264", "hevc", "av1", "vp9")
private val COPY_AUDIO = setOf("aac", "mp3", "ac3", "eac3", "opus", "flac", "alac")

/** Which subtitles a download saves beside the video. */
enum class DownloadSubtitles {
    /** The languages the person reads and hears. */
    USED,
    ALL,
    NONE,
}

/** The version the download sheet starts on: for this device, at a preset's height, or the file as it is. */
const val DEFAULT_DEVICE = "device"
const val DEFAULT_ORIGINAL = "original"

/** What a download is made of, before it starts: the tracks it holds and the subtitles saved beside it. */
data class DownloadSource(
    val item: MediaItem,
    val audio: List<AudioTrack>,
    val subtitles: List<SubtitleTrack>,
    val options: PlaybackOptions,
    val preferences: PlaybackPreferences,
)

/**
 * Downloads for watching offline: the file as it is, or a version the
 * server makes for this device. WorkManager fetches them in the
 * background, one unique job per file, resuming where a break left off.
 */
class Downloads(private val context: Context) {
    val store = DownloadStore(context.filesDir)
    val pending = PendingProgress(context)
    private val prefs = context.getSharedPreferences("downloads", Context.MODE_PRIVATE)
    private val work get() = WorkManager.getInstance(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Fetch only on Wi-Fi and other connections that aren't metered. */
    var unmeteredOnly: Boolean
        get() = prefs.getBoolean("unmetered_only", true)
        set(value) {
            prefs.edit { putBoolean("unmetered_only", value) }
            // Waiting downloads follow the new setting.
            store.items.value.values.filter { it.state == DownloadState.QUEUED }.forEach { schedule(it.id, replace = true) }
        }

    /**
     * The version the download sheet starts on: [DEFAULT_DEVICE], a preset's
     * height like "720", or [DEFAULT_ORIGINAL].
     */
    var defaultVersion: String
        get() = prefs.getString("default_version", null) ?: DEFAULT_DEVICE
        set(value) = prefs.edit { putString("default_version", value) }

    var subtitles: DownloadSubtitles
        get() = prefs.getString("subtitles", null)?.let { saved -> DownloadSubtitles.entries.firstOrNull { it.name == saved } }
            ?: DownloadSubtitles.USED
        set(value) = prefs.edit { putString("subtitles", value.name) }

    /** The audio track a download holds: the one the preferences would play. */
    private fun audioFor(source: DownloadSource): AudioTrack? =
        audioChoice(source.audio, source.preferences.audioLanguage, source.item.title?.originalLanguage).wanted

    /**
     * The version for this device: the video kept when the device decodes it
     * and MP4 holds it, else encoded to H.264 at [preset]; the preferred audio
     * track kept when it plays here, else converted to stereo.
     */
    fun deviceSpec(source: DownloadSource, preset: VideoPreset?): DownloadSpec {
        val video = source.item.probe?.video
        val keep = preset == null && video != null && video.codec in COPY_VIDEO && Capabilities.decodesVideo(video)
        val videoSpec = if (keep) {
            DownloadVideoSpec(mode = "copy")
        } else {
            val target = preset ?: VIDEO_PRESETS.first()
            DownloadVideoSpec(mode = "encode", codec = "h264", maxHeight = target.height, bitrate = target.bitrate)
        }
        val audio = audioFor(source)?.let { track ->
            if (track.codec in COPY_AUDIO && Capabilities.decodesAudio(track.codec)) {
                DownloadAudioSpec(index = track.index, mode = "copy")
            } else {
                val opus = "opus" in source.options.audioCodecs && Capabilities.decodesAudio("opus")
                DownloadAudioSpec(
                    index = track.index,
                    mode = "encode",
                    codec = if (opus) "opus" else "aac",
                    channels = minOf(track.channels ?: 2, 2),
                )
            }
        }
        return DownloadSpec(videoSpec, listOfNotNull(audio))
    }

    /** Whether the file as it is plays here: its container, video, and preferred audio. */
    fun originalPlays(source: DownloadSource): Boolean {
        val item = source.item
        val video = item.probe?.video
        val audio = audioFor(source)
        return Capabilities.playsContainer(item.container) &&
            (video == null || Capabilities.decodesVideo(video)) &&
            (audio == null || Capabilities.decodesAudio(audio.codec))
    }

    /** Text subtitles to save beside the video: in the languages the person reads or hears, all, or none. */
    private fun subtitlesFor(source: DownloadSource): List<SubtitleTrack> {
        val text = source.subtitles.filter(::drawable)
        return when (subtitles) {
            DownloadSubtitles.NONE -> emptyList()
            DownloadSubtitles.ALL -> text.take(32)
            DownloadSubtitles.USED -> {
                val audio = audioFor(source)
                val languages = setOfNotNull(
                    baseLanguage(source.preferences.subtitleLanguage ?: deviceLanguage),
                    baseLanguage(audio?.language),
                )
                text.filter { baseLanguage(it.language) in languages }.take(8)
            }
        }
    }

    private fun subtitleEntries(id: String, tracks: List<SubtitleTrack>) =
        tracks.mapIndexed { i, track -> OfflineSubtitle(track, "$id/subtitles/$i.vtt") }

    fun downloadOriginal(source: DownloadSource) {
        val item = source.item
        val extension = item.relativePath.substringAfterLast('.', "mkv").lowercase().take(5)
        store.put(
            OfflineItem(
                item = item,
                kind = DownloadKind.ORIGINAL,
                file = "${item.id}/video.$extension",
                totalBytes = item.sizeBytes,
                audio = source.audio,
                subtitles = subtitleEntries(item.id, subtitlesFor(source)),
            ),
        )
        schedule(item.id)
    }

    /** A version for this device, with the tracks [plan] says it holds. */
    fun downloadForDevice(source: DownloadSource, spec: DownloadSpec, plan: DownloadPlan) {
        val item = source.item
        val audio = plan.audio.map { planned ->
            val original = source.audio.firstOrNull { it.index == planned.index }
            AudioTrack(
                index = planned.index,
                label = planned.label,
                language = planned.language,
                title = original?.title,
                codec = planned.codec,
                format = planned.codec.uppercase(),
                channels = planned.channels,
                layout = original?.layout,
                primary = planned == plan.audio.first(),
            )
        }
        store.put(
            OfflineItem(
                item = item,
                kind = DownloadKind.DEVICE,
                file = "${item.id}/video.mp4",
                spec = spec,
                totalBytes = plan.estimatedBytes,
                audio = audio,
                subtitles = subtitleEntries(item.id, subtitlesFor(source)),
            ),
        )
        schedule(item.id)
    }

    private fun schedule(id: String, replace: Boolean = false) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(if (unmeteredOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .setRequiresStorageNotLow(true)
            .build()
        val request = OneTimeWorkRequestBuilder<DownloadWorker>()
            .setInputData(workDataOf(DownloadWorker.KEY_ITEM to id))
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(TAG)
            .build()
        work.enqueueUniqueWork(workName(id), if (replace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP, request)
    }

    fun pause(id: String) {
        store.update(id) { it.copy(state = DownloadState.PAUSED) }
        work.cancelUniqueWork(workName(id))
    }

    fun resume(id: String) {
        store.update(id) { it.copy(state = DownloadState.QUEUED, error = null) }
        schedule(id, replace = true)
    }

    /** Stop a download and delete its files, and what the server still has of it. */
    fun remove(id: String, api: MatineeApi?) {
        val serverId = store[id]?.serverId
        work.cancelUniqueWork(workName(id))
        store.remove(id)
        if (serverId != null && api != null) scope.launch { runCatching { api.removeDownload(serverId) } }
    }

    /** Every download, finished or not. */
    fun removeAll(api: MatineeApi?) {
        store.items.value.keys.toList().forEach { remove(it, api) }
    }

    /** Queue again what was waiting when the app last ran, in case its jobs went. */
    fun restore() {
        store.items.value.values
            .filter { it.state == DownloadState.QUEUED || it.state == DownloadState.RUNNING }
            .forEach { schedule(it.id) }
    }

    companion object {
        const val TAG = "download"

        fun workName(id: String) = "download-$id"
    }
}
