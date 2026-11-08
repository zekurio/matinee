package io.github.zekurio.matinee.downloads

import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.MatineeJson
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.SubtitleTrack
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

object DownloadState {
    /** Waiting for its turn or for a connection that fits the settings. */
    const val QUEUED = "queued"
    const val RUNNING = "running"
    const val PAUSED = "paused"
    const val DONE = "done"
    const val FAILED = "failed"
}

object DownloadKind {
    /** The file as it is, from the stream route with byte ranges. */
    const val ORIGINAL = "original"

    /** A version the server makes for this device, fetched in segments. */
    const val DEVICE = "device"
}

/** A subtitle track saved beside a download as WebVTT. */
@Serializable
data class OfflineSubtitle(val track: SubtitleTrack, val file: String)

/**
 * A file downloaded, or on its way, with what the app needs to show and
 * play it without the server: the item as the server sent it, the audio
 * tracks the file holds, and the subtitles saved beside it.
 */
@Serializable
data class OfflineItem(
    val item: MediaItem,
    val kind: String,
    /** The video file, relative to the app's download folder. */
    val file: String,
    val state: String = DownloadState.QUEUED,
    /** Of a device download, the version's spec, so a restart asks for the same one. */
    val spec: io.github.zekurio.matinee.api.DownloadSpec? = null,
    /** The server's id of a device download while it's being fetched. */
    val serverId: String? = null,
    /** The next segment to fetch of a device download. */
    val segment: Int = 0,
    val bytes: Long = 0,
    /** The file's size, or the server's estimate for a device download. */
    val totalBytes: Long? = null,
    val audio: List<AudioTrack> = emptyList(),
    val subtitles: List<OfflineSubtitle> = emptyList(),
    /** A still or backdrop saved for the list, relative to the download folder. */
    val image: String? = null,
    val error: String? = null,
    val addedAt: Long = System.currentTimeMillis(),
) {
    val id get() = item.id

    val progress: Float?
        get() = totalBytes?.takeIf { it > 0 }?.let { (bytes.toFloat() / it).coerceIn(0f, 1f) }
}

/**
 * The downloads, kept as one JSON file in the app's files, and their files
 * in a folder per item. Every change writes the list again, so a download
 * picks up where it was after the app or the phone restarts.
 */
class DownloadStore(filesDir: File) {
    val root = File(filesDir, "downloads").apply { mkdirs() }
    private val index = File(root, "index.json")
    private val serializer = ListSerializer(OfflineItem.serializer())
    private val json = Json(MatineeJson) { encodeDefaults = true }
    private val _items = MutableStateFlow(read())
    val items: StateFlow<Map<String, OfflineItem>> = _items.asStateFlow()

    private fun read(): Map<String, OfflineItem> = runCatching {
        json.decodeFromString(serializer, index.readText()).associateBy { it.id }
    }.getOrDefault(emptyMap())

    private fun write(items: Map<String, OfflineItem>) {
        val tmp = File(root, "index.json.tmp")
        tmp.writeText(json.encodeToString(serializer, items.values.sortedBy { it.addedAt }))
        tmp.renameTo(index)
    }

    operator fun get(id: String): OfflineItem? = _items.value[id]

    /** The finished download of [id], if there is one. */
    fun done(id: String): OfflineItem? = _items.value[id]?.takeIf { it.state == DownloadState.DONE }

    fun folder(id: String) = File(root, id)

    fun file(entry: OfflineItem) = File(root, entry.file)

    @Synchronized
    fun put(entry: OfflineItem) {
        val next = _items.value + (entry.id to entry)
        write(next)
        _items.value = next
    }

    /** Change an entry, if it's still there. Returns what it became. */
    @Synchronized
    fun update(id: String, change: (OfflineItem) -> OfflineItem): OfflineItem? {
        val current = _items.value[id] ?: return null
        val changed = change(current)
        val next = _items.value + (id to changed)
        write(next)
        _items.value = next
        return changed
    }

    @Synchronized
    fun remove(id: String) {
        folder(id).deleteRecursively()
        val next = _items.value - id
        write(next)
        _items.value = next
    }
}
