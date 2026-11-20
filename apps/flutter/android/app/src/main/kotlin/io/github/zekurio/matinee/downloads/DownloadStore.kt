package io.github.zekurio.matinee.downloads

import java.io.File
import java.io.FileOutputStream
import org.json.JSONArray
import org.json.JSONException

/**
 * The downloads, kept as one JSON file, and their files in a folder per
 * item. Every change writes the list again, synced to the disk, so a
 * download picks up where it was after the app or the phone restarts, even
 * one that didn't shut down cleanly. Every server's downloads are
 * here; Dart shows only those of the server in use.
 *
 * The folder isn't the Kotlin app's `downloads`, which the first launch
 * deletes: this app starts fresh.
 */
class DownloadStore(filesDir: File) {
    val root = File(filesDir, FOLDER).apply { mkdirs() }
    private val index = File(root, "index.json")
    private val listeners = mutableListOf<(List<OfflineEntry>) -> Unit>()

    @Volatile private var entries: Map<String, OfflineEntry> = read()

    /** Every download, oldest first. */
    val all: List<OfflineEntry> get() = entries.values.sortedBy { it.addedAt }

    operator fun get(id: String): OfflineEntry? = entries[id]

    fun file(entry: OfflineEntry) = File(root, entry.file)

    fun folder(id: String) = File(root, id)

    /** Each entry on its own, so one this app can't read any more doesn't lose the others. */
    private fun read(): Map<String, OfflineEntry> {
        val text = try {
            if (index.exists()) index.readText() else return emptyMap()
        } catch (_: java.io.IOException) {
            return emptyMap()
        }
        val array = try {
            JSONArray(text)
        } catch (_: JSONException) {
            return emptyMap()
        }
        return (0 until array.length())
            .mapNotNull { array.optJSONObject(it)?.let(OfflineEntry::fromJson) }
            .associateBy { it.id }
    }

    private fun write(next: Map<String, OfflineEntry>) {
        val tmp = File(root, "index.json.tmp")
        val array = JSONArray()
        next.values.sortedBy { it.addedAt }.forEach { array.put(it.toJson()) }
        // On the disk before it takes the list's place, so a download that
        // shows as running is still listed after the power goes, not lost
        // with an empty list.
        FileOutputStream(tmp).use { out ->
            out.write(array.toString().toByteArray(Charsets.UTF_8))
            out.fd.sync()
        }
        if (!tmp.renameTo(index)) {
            index.delete()
            tmp.renameTo(index)
        }
    }

    private fun set(next: Map<String, OfflineEntry>) {
        write(next)
        entries = next
        val shown = all
        synchronized(listeners) { listeners.toList() }.forEach { it(shown) }
    }

    /** Hears every change, with every download after it. */
    fun listen(listener: (List<OfflineEntry>) -> Unit): () -> Unit {
        synchronized(listeners) { listeners += listener }
        return { synchronized(listeners) { listeners -= listener } }
    }

    @Synchronized
    fun put(entry: OfflineEntry) = set(entries + (entry.id to entry))

    /** Change an entry, if it's still there. Returns what it became. */
    @Synchronized
    fun update(id: String, change: (OfflineEntry) -> OfflineEntry): OfflineEntry? {
        val current = entries[id] ?: return null
        val changed = change(current)
        if (changed != current) set(entries + (id to changed))
        return changed
    }

    @Synchronized
    fun remove(id: String) {
        folder(id).deleteRecursively()
        if (id in entries) set(entries - id)
    }

    companion object {
        const val FOLDER = "offline"
    }
}
