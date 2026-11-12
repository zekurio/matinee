package io.github.zekurio.matinee.downloads

import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.MatineeJson
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.api.decodeSaved
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray

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
    /**
     * The server it came from, by its saved origin, as
     * `https://media.example.com/`. It shows, plays, and syncs only with
     * that server. Null only in a list from before saved servers, until
     * [DownloadStore.adopt] gives it the server that app used.
     */
    val server: String? = null,
) {
    val id get() = item.id

    val progress: Float?
        get() = totalBytes?.takeIf { it > 0 }?.let { (bytes.toFloat() / it).coerceIn(0f, 1f) }
}

/**
 * The downloads, kept as one JSON file in the app's files, and their files
 * in a folder per item. Every change writes the list again, so a download
 * picks up where it was after the app or the phone restarts.
 *
 * Every server's downloads are in [all], for the work that fetches them;
 * [items] and [done] hold only those of [server], the one in use, for
 * everything that shows or plays them.
 */
class DownloadStore(filesDir: File) {
    val root = File(filesDir, "downloads").apply { mkdirs() }
    private val index = File(root, "index.json")
    private val serializer = ListSerializer(OfflineItem.serializer())
    private val json = Json(MatineeJson) { encodeDefaults = true }
    private val _all = MutableStateFlow(read())
    val all: StateFlow<Map<String, OfflineItem>> = _all.asStateFlow()

    /** The server in use, whose downloads [items] holds. */
    @Volatile var server: String? = null
        set(value) {
            synchronized(this) {
                field = value
                _items.value = shown(_all.value)
            }
        }

    private val _items = MutableStateFlow(shown(_all.value))
    val items: StateFlow<Map<String, OfflineItem>> = _items.asStateFlow()

    private fun shown(all: Map<String, OfflineItem>): Map<String, OfflineItem> {
        val current = server ?: return emptyMap()
        return all.filterValues { it.server == current }
    }

    /** Each entry on its own, so one this app can't read any more doesn't lose the others. */
    private fun read(): Map<String, OfflineItem> {
        val entries = runCatching { MatineeJson.parseToJsonElement(index.readText()) as? JsonArray }.getOrNull()
        return entries.orEmpty()
            .mapNotNull { runCatching { decodeSaved(OfflineItem.serializer(), it) }.getOrNull() }
            .associateBy { it.id }
    }

    private fun write(items: Map<String, OfflineItem>) {
        val tmp = File(root, "index.json.tmp")
        tmp.writeText(json.encodeToString(serializer, items.values.sortedBy { it.addedAt }))
        tmp.renameTo(index)
    }

    private fun set(next: Map<String, OfflineItem>) {
        write(next)
        _all.value = next
        _items.value = shown(next)
    }

    /** Any server's download of [id], for the work that fetches it. */
    operator fun get(id: String): OfflineItem? = _all.value[id]

    /** The finished download of [id] from the server in use, if there is one. */
    fun done(id: String): OfflineItem? = _items.value[id]?.takeIf { it.state == DownloadState.DONE }

    fun folder(id: String) = File(root, id)

    fun file(entry: OfflineItem) = File(root, entry.file)

    @Synchronized
    fun put(entry: OfflineItem) = set(_all.value + (entry.id to entry))

    /** Change an entry, if it's still there. Returns what it became. */
    @Synchronized
    fun update(id: String, change: (OfflineItem) -> OfflineItem): OfflineItem? {
        val current = _all.value[id] ?: return null
        val changed = change(current)
        set(_all.value + (id to changed))
        return changed
    }

    @Synchronized
    fun remove(id: String) {
        folder(id).deleteRecursively()
        set(_all.value - id)
    }

    /** The downloads from before saved servers came from [server], the one that app used. */
    @Synchronized
    fun adopt(server: String) {
        if (_all.value.values.none { it.server == null }) return
        set(_all.value.mapValues { (_, entry) -> if (entry.server == null) entry.copy(server = server) else entry })
    }
}
