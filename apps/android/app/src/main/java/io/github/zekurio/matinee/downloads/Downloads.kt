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
import io.github.zekurio.matinee.api.DownloadAudio
import io.github.zekurio.matinee.api.DownloadPlan
import io.github.zekurio.matinee.api.DownloadSpec
import io.github.zekurio.matinee.api.DownloadVideo
import io.github.zekurio.matinee.api.DownloadVideoPreset
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.player.Capabilities
import io.github.zekurio.matinee.ui.player.audioChoice
import io.github.zekurio.matinee.ui.player.baseLanguage
import io.github.zekurio.matinee.ui.player.deviceLanguage
import io.github.zekurio.matinee.ui.player.drawable
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

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

    /** The audio track the preferences would play. */
    private fun audioFor(source: DownloadSource): AudioTrack? =
        audioChoice(source.audio, source.preferences.audioLanguage, source.item.title?.originalLanguage).wanted

    /** The audio tracks a download starts with: the one the preferences would play. */
    fun defaultAudio(source: DownloadSource): List<AudioTrack> = listOfNotNull(audioFor(source))

    /** The subtitles a download can save: text, which the player draws. */
    fun textSubtitles(source: DownloadSource): List<SubtitleTrack> = source.subtitles.filter(::drawable)

    /** Whether a version for this device keeps the file's video: only at no set size, when it plays here and MP4 holds it. */
    private fun keepsVideo(item: MediaItem, preset: DownloadVideoPreset?): Boolean {
        val video = item.probe?.video
        return preset == null && video != null && video.codec in COPY_VIDEO && Capabilities.decodesVideo(video)
    }

    /** The codecs a download can be encoded in: the server makes them and this device plays them. */
    fun codecChoices(options: PlaybackOptions): List<String> = Capabilities.encodeVideoChoices(options.videoCodecs).ifEmpty { listOf("h264") }

    /** The codec a download starts on: the one the playback settings ask encodes for. */
    fun defaultCodec(options: PlaybackOptions): String = Capabilities.encodeVideoCodecs(options.videoCodecs, context.app.player).first()

    /**
     * The version for this device: the video kept when the device decodes it
     * and MP4 holds it, else encoded at [preset] in [codec], the playback
     * settings' by default; each of [audio] kept when it plays here, else
     * converted to stereo.
     */
    fun deviceSpec(
        source: DownloadSource,
        preset: DownloadVideoPreset?,
        audio: List<AudioTrack> = defaultAudio(source),
        codec: String? = null,
    ): DownloadSpec {
        val videoSpec = if (keepsVideo(source.item, preset)) {
            DownloadVideo.Copy
        } else {
            val target = preset ?: source.options.downloadVideoPresets.first()
            DownloadVideo.Encode(codec = codec ?: defaultCodec(source.options), maxHeight = target.height, bitrate = target.bitrate)
        }
        val tracks = audio.map { track ->
            if (track.codec in COPY_AUDIO && Capabilities.decodesAudio(track.codec)) {
                DownloadAudio.Copy(index = track.index)
            } else {
                val opus = "opus" in source.options.audioCodecs && Capabilities.decodesAudio("opus")
                DownloadAudio.Encode(
                    index = track.index,
                    codec = if (opus) "opus" else "aac",
                    channels = minOf(track.channels ?: 2, 2),
                )
            }
        }
        return DownloadSpec(video = videoSpec, audio = tracks)
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

    /**
     * The subtitles a download starts with, as Settings say: in the languages
     * the person reads or hears, all, or none.
     */
    fun defaultSubtitles(source: DownloadSource): List<SubtitleTrack> {
        val text = textSubtitles(source)
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

    /** The file as it is, with [subtitles] saved beside it. */
    fun downloadOriginal(source: DownloadSource, subtitles: List<SubtitleTrack> = defaultSubtitles(source)) {
        val item = source.item
        val extension = item.relativePath.substringAfterLast('.', "mkv").lowercase().take(5)
        store.put(
            OfflineItem(
                item = item,
                kind = DownloadKind.ORIGINAL,
                file = "${item.id}/video.$extension",
                totalBytes = item.sizeBytes,
                audio = source.audio,
                subtitles = subtitleEntries(item.id, subtitles),
            ),
        )
        schedule(item.id)
    }

    /** A version for this device, with the tracks [plan] says it holds and [subtitles] saved beside it. */
    fun downloadForDevice(
        source: DownloadSource,
        spec: DownloadSpec,
        plan: DownloadPlan,
        subtitles: List<SubtitleTrack> = defaultSubtitles(source),
    ) {
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
                subtitles = subtitleEntries(item.id, subtitles),
            ),
        )
        schedule(item.id)
    }

    /**
     * About how big a version for this device at [preset]'s size comes out,
     * before the server plans it: the file's size when its video is kept,
     * else its length at the preset's rate. For many files at once, where a
     * plan for each would be a request for each.
     */
    fun estimateBytes(item: MediaItem, preset: DownloadVideoPreset?, options: PlaybackOptions): Long? {
        if (keepsVideo(item, preset)) return item.sizeBytes
        val seconds = item.durationSeconds ?: return null
        val target = preset ?: options.downloadVideoPresets.firstOrNull() ?: return null
        return ((target.bitrate + ESTIMATED_AUDIO_BITRATE) * seconds / 8).toLong()
    }

    /**
     * Queue each of [items] not downloaded yet, all the same way: the file
     * as it is when [original], else made for this device at [preset]'s
     * size. A file the server can't make at that size, as one smaller than
     * it, gets the version for this device instead. Each file needs its own
     * tracks, and a version its own plan, so a few are asked for at a time.
     * Runs in this class's scope, so it carries on when the page that
     * started it closes. Returns how many couldn't be queued.
     */
    suspend fun downloadAll(
        api: MatineeApi,
        items: List<MediaItem>,
        original: Boolean,
        preset: DownloadVideoPreset?,
        preferences: PlaybackPreferences,
        codec: String? = null,
    ): Int = scope.async {
        val options = try {
            api.playback.options()
        } catch (e: IOException) {
            return@async items.count { store[it.id] == null }
        }
        val gate = Semaphore(BATCH_REQUESTS)
        val failed = AtomicInteger()
        coroutineScope {
            for (item in items.filter { store[it.id] == null }) {
                launch {
                    gate.withPermit {
                        try {
                            val source = DownloadSource(item, api.media.audio(item.id), api.media.subtitles(item.id).tracks, options, preferences)
                            if (original) {
                                downloadOriginal(source)
                            } else {
                                val spec = deviceSpec(source, preset, codec = codec)
                                val plan = try {
                                    api.downloads.plan(item.id, spec)
                                } catch (e: IOException) {
                                    if (preset == null) throw e
                                    null
                                }
                                if (plan != null) {
                                    downloadForDevice(source, spec, plan)
                                } else {
                                    val fallback = deviceSpec(source, null, codec = codec)
                                    downloadForDevice(source, fallback, api.downloads.plan(item.id, fallback))
                                }
                            }
                        } catch (e: IOException) {
                            failed.incrementAndGet()
                        }
                    }
                }
            }
        }
        failed.get()
    }.await()

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
        if (serverId != null && api != null) scope.launch { runCatching { api.downloads.remove(serverId) } }
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

        /** How many files of a batch ask the server for their tracks and plans at once. */
        private const val BATCH_REQUESTS = 3

        /** What an estimate counts for audio: stereo, as a version for this device converts it. */
        private const val ESTIMATED_AUDIO_BITRATE = 160_000

        fun workName(id: String) = "download-$id"
    }
}
