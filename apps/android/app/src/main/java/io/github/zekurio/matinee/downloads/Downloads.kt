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
import io.github.zekurio.matinee.api.DownloadResolution
import io.github.zekurio.matinee.api.DownloadResolveInput
import io.github.zekurio.matinee.api.DownloadSpec
import io.github.zekurio.matinee.api.DownloadVideoPreset
import io.github.zekurio.matinee.api.DownloadWishes
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.api.downloadDevice
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.player.AUTOMATIC
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** Which subtitle languages to save beside the video. */
enum class DownloadSubtitles { USED, ALL, NONE }
const val DEFAULT_DEVICE = "device"
const val DEFAULT_ORIGINAL = "original"

data class DownloadSource(val item: MediaItem, val resolved: DownloadResolution.Ready) {
    val audio get() = resolved.choices.audio.map { it.track }
    val subtitles get() = resolved.choices.subtitles
}

/**
 * Offline files fetched by one resumable WorkManager job per file. Each
 * download, and what's waiting to reach a server from watching one, belongs
 * to the server it came from: the app shows and plays only those of the
 * server in use, and sends progress only to the server it was made on.
 */
class Downloads(private val context: Context) {
    private val session get() = context.app.session
    val store = DownloadStore(context.filesDir)
    private val prefs = context.getSharedPreferences("downloads", Context.MODE_PRIVATE)
    private val work get() = WorkManager.getInstance(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val pendings = HashMap<String, PendingProgress>()

    /** What's waiting to reach the server in use, from downloads watched while it was away. */
    val pending: PendingProgress get() = pendingFor(session.activeServer.value.orEmpty())

    /** What's waiting to reach [server]. */
    fun pendingFor(server: String): PendingProgress = synchronized(pendings) {
        pendings.getOrPut(server) { PendingProgress(context, server) }
    }

    init {
        follow(session.activeServer.value)
        CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate).launch {
            session.activeServer.collect(::follow)
        }
    }

    /**
     * Show [server]'s downloads, after giving it those from before saved
     * servers. Both steps only fill in what has no server yet, so running
     * again changes nothing; one that fails leaves everything as it was and
     * is tried again on the next start.
     */
    private fun follow(server: String?) {
        if (!prefs.getBoolean(KEY_KEYED, false)) {
            session.formerServer?.let { former ->
                val adopted = runCatching { store.adopt(former) }.isSuccess &&
                    runCatching { PendingProgress.adopt(context, former) }.getOrDefault(false)
                if (adopted) prefs.edit { putBoolean(KEY_KEYED, true) }
            }
        }
        store.server = server
    }

    var unmeteredOnly: Boolean
        get() = prefs.getBoolean("unmetered_only", true)
        set(value) {
            prefs.edit { putBoolean("unmetered_only", value) }
            store.all.value.values.filter { it.state == DownloadState.QUEUED }.forEach { schedule(it.id, true) }
        }
    var defaultVersion: String
        get() = prefs.getString("default_version", null) ?: DEFAULT_DEVICE
        set(value) = prefs.edit { putString("default_version", value) }
    /** The codec a download comes in when its video is encoded, or [AUTOMATIC] for the server's first. */
    var videoCodec: String
        get() = prefs.getString("video_codec", null) ?: AUTOMATIC
        set(value) = prefs.edit { putString("video_codec", value) }
    var subtitles: DownloadSubtitles
        get() = prefs.getString("subtitles", null)?.let { saved -> DownloadSubtitles.entries.firstOrNull { it.name == saved } } ?: DownloadSubtitles.USED
        set(value) = prefs.edit { putString("subtitles", value.name) }

    fun wishes(preset: DownloadVideoPreset? = null, codec: String? = null, audio: List<Int>? = null) = DownloadWishes(
        preset = preset?.let { DownloadWishes.Preset(it.height, it.bitrate) },
        codec = codec ?: videoCodec.takeIf { it != AUTOMATIC },
        audio = if (audio == null) "preferred" else "selected", audioIndices = audio,
        subtitles = subtitles.name.lowercase(),
    )

    suspend fun resolve(api: MatineeApi, items: List<MediaItem>, wishes: DownloadWishes): List<DownloadResolution> =
        items.chunked(100).flatMap { batch ->
            api.downloads.resolve(DownloadResolveInput(batch.map { it.id }, downloadDevice(context.app.player), wishes))
        }

    fun defaultAudio(source: DownloadSource) = source.audio.filter { track ->
        source.resolved.spec.audio.any { audio ->
            when (audio) {
                is DownloadAudio.Copy -> audio.index
                is DownloadAudio.Encode -> audio.index
            } == track.index
        }
    }
    fun defaultSubtitles(source: DownloadSource) = source.subtitles.filter { it.id in source.resolved.spec.subtitles.orEmpty() }
    fun textSubtitles(source: DownloadSource) = source.subtitles
    fun originalPlays(source: DownloadSource) = source.resolved.originalPlays

    private fun subtitleEntries(id: String, tracks: List<SubtitleTrack>) =
        tracks.mapIndexed { i, track -> OfflineSubtitle(track, "$id/subtitles/$i.vtt") }

    fun downloadOriginal(source: DownloadSource, subtitles: List<SubtitleTrack> = defaultSubtitles(source)) {
        val item = source.item
        val extension = item.relativePath.substringAfterLast('.', "mkv").lowercase().take(5)
        store.put(OfflineItem(item = item, kind = DownloadKind.ORIGINAL, file = "${item.id}/video.$extension",
            totalBytes = item.sizeBytes, audio = source.audio, subtitles = subtitleEntries(item.id, subtitles),
            server = session.activeServer.value))
        schedule(item.id)
    }

    fun downloadForDevice(source: DownloadSource, spec: DownloadSpec, plan: DownloadPlan, subtitles: List<SubtitleTrack> = defaultSubtitles(source)) {
        val item = source.item
        val audio = plan.audio.map { planned ->
            val original = source.audio.firstOrNull { it.index == planned.index }
            AudioTrack(index = planned.index, label = planned.label, language = planned.language,
                title = original?.title, codec = planned.codec, format = planned.codec.uppercase(),
                channels = planned.channels, layout = original?.layout, primary = planned == plan.audio.first())
        }
        // The player loads saved WebVTT files, not embedded subtitle streams.
        store.put(OfflineItem(item = item, kind = DownloadKind.DEVICE, file = "${item.id}/video.mp4",
            spec = spec.copy(subtitles = emptyList()), totalBytes = plan.estimatedBytes,
            audio = audio, subtitles = subtitleEntries(item.id, subtitles), server = session.activeServer.value))
        schedule(item.id)
    }

    suspend fun downloadAll(items: List<MediaItem>, results: List<DownloadResolution>, original: Boolean): Int = scope.async {
        var failed = 0
        items.filter { store[it.id] == null }.forEach { item ->
            val ready = results.filterIsInstance<DownloadResolution.Ready>().firstOrNull { it.id == item.id }
            if (ready == null) failed++ else {
                val source = DownloadSource(item, ready)
                if (original) downloadOriginal(source) else downloadForDevice(source, ready.spec, ready.plan)
            }
        }
        failed
    }.await()

    private fun schedule(id: String, replace: Boolean = false) {
        val constraints = Constraints.Builder().setRequiredNetworkType(if (unmeteredOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .setRequiresStorageNotLow(true).build()
        val request = OneTimeWorkRequestBuilder<DownloadWorker>().setInputData(workDataOf(DownloadWorker.KEY_ITEM to id))
            .setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).addTag(TAG).build()
        work.enqueueUniqueWork(workName(id), if (replace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP, request)
    }
    fun pause(id: String) {
        store.update(id) { it.copy(state = DownloadState.PAUSED) }
        work.cancelUniqueWork(workName(id))
    }
    fun resume(id: String) {
        store.update(id) { it.copy(state = DownloadState.QUEUED, error = null) }
        schedule(id, true)
    }
    fun remove(id: String, api: MatineeApi?) {
        val serverId = store[id]?.serverId
        work.cancelUniqueWork(workName(id))
        store.remove(id)
        if (serverId != null && api != null) scope.launch { runCatching { api.downloads.remove(serverId) } }
    }
    /** Every download of the server in use. */
    fun removeAll(api: MatineeApi?) { store.items.value.keys.toList().forEach { remove(it, api) } }

    /**
     * A server is being removed: its downloads go, and what waited to reach
     * it. With [api], still signed in there, what waited is sent first and
     * the server lets go of versions it was making, as far as it answers
     * in a few seconds.
     */
    suspend fun forgetServer(server: String, api: MatineeApi?) = withContext(Dispatchers.IO) {
        val entries = store.all.value.values.filter { it.server == server }
        val pending = pendingFor(server)
        if (api != null) {
            withTimeoutOrNull(FORGET_TIMEOUT_MS) {
                runCatching { pending.flush(api) }
                entries.mapNotNull { it.serverId }.forEach { id -> runCatching { api.downloads.remove(id) } }
            }
        }
        entries.forEach { entry ->
            work.cancelUniqueWork(workName(entry.id))
            store.remove(entry.id)
        }
        pending.clear()
    }

    fun restore() {
        store.all.value.values.filter { it.state == DownloadState.QUEUED || it.state == DownloadState.RUNNING }.forEach { schedule(it.id) }
    }
    companion object {
        const val TAG = "download"
        private const val KEY_KEYED = "keyed_by_server"
        private const val FORGET_TIMEOUT_MS = 8_000L
        fun workName(id: String) = "download-$id"
    }
}
