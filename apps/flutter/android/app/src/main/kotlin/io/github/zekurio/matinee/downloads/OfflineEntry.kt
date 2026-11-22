package io.github.zekurio.matinee.downloads

import org.json.JSONArray
import org.json.JSONObject

/*
 * A download as this side keeps it, without the item: Dart keeps what the
 * server sent about the file in [OfflineEntry.meta] and reads it back as it
 * was, so nothing here needs the API's models.
 */

object DownloadState {
    /** Waiting for its turn or for a connection that fits the settings. */
    const val QUEUED = "queued"
    const val RUNNING = "running"
    const val PAUSED = "paused"
    const val DONE = "done"
    const val FAILED = "failed"
}

/**
 * Why a download stopped or waits to try again. The words are the app's own,
 * shown in its language, so only [SERVER] keeps the server's words.
 */
object DownloadError {
    const val UNREACHABLE = "unreachable"
    const val BROKE_OFF = "broke_off"
    const val FORBIDDEN = "forbidden"
    const val SERVER = "server"
}

object DownloadKind {
    /** The file as it is, from the stream route with byte ranges. */
    const val ORIGINAL = "original"

    /** A version the server makes for this device, fetched in segments. */
    const val DEVICE = "device"
}

/** A subtitle track saved beside a download as WebVTT, and where it comes from. */
data class SavedSubtitle(val trackId: String, val file: String, val url: String)

data class OfflineEntry(
    /** The file's id on the server. */
    val id: String,
    /** The saved server it came from, by its origin key. */
    val server: String,
    /** The server's `/api` address, which the device version's routes go under. */
    val apiBase: String,
    val kind: String,
    /** The video file, relative to the downloads folder. */
    val file: String,
    /** What the notification calls it, in the app's language. */
    val name: String,
    /** Dart's own record of it, kept as it came. */
    val meta: String,
    val streamUrl: String,
    val imageUrl: String? = null,
    val state: String = DownloadState.QUEUED,
    /** Of a device version, the spec `downloads.start` takes, so a restart asks for the same one. */
    val spec: String? = null,
    /** The server's id of a device version while it's being fetched. */
    val serverId: String? = null,
    /** The next segment of a device version to fetch. */
    val segment: Int = 0,
    val bytes: Long = 0,
    /** The file's size, or the server's estimate for a device version. */
    val totalBytes: Long? = null,
    val subtitles: List<SavedSubtitle> = emptyList(),
    /** A still or backdrop saved for the list, relative to the downloads folder. */
    val image: String? = null,
    /** Why it stopped or waits to try again: a [DownloadError] name. */
    val errorKind: String? = null,
    /** The server's own words for a refusal, with [DownloadError.SERVER]. */
    val error: String? = null,
    val addedAt: Long = System.currentTimeMillis(),
) {
    val progress: Float?
        get() = totalBytes?.takeIf { it > 0 }?.let { (bytes.toFloat() / it).coerceIn(0f, 1f) }

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("server", server)
        put("apiBase", apiBase)
        put("kind", kind)
        put("file", file)
        put("name", name)
        put("meta", meta)
        put("streamUrl", streamUrl)
        putOpt("imageUrl", imageUrl)
        put("state", state)
        putOpt("spec", spec)
        putOpt("serverId", serverId)
        put("segment", segment)
        put("bytes", bytes)
        putOpt("totalBytes", totalBytes)
        put(
            "subtitles",
            JSONArray().apply {
                for (subtitle in subtitles) {
                    put(JSONObject().put("trackId", subtitle.trackId).put("file", subtitle.file).put("url", subtitle.url))
                }
            },
        )
        putOpt("image", image)
        putOpt("errorKind", errorKind)
        putOpt("error", error)
        put("addedAt", addedAt)
    }

    companion object {
        /** One entry as it was written, or null when it can't be read; the others stay. */
        fun fromJson(json: JSONObject): OfflineEntry? = try {
            val subtitles = json.optJSONArray("subtitles")
            OfflineEntry(
                id = json.getString("id"),
                server = json.getString("server"),
                apiBase = json.getString("apiBase"),
                kind = json.getString("kind").takeIf { it == DownloadKind.ORIGINAL || it == DownloadKind.DEVICE }
                    ?: return null,
                file = json.getString("file"),
                name = json.optString("name"),
                meta = json.getString("meta"),
                streamUrl = json.getString("streamUrl"),
                imageUrl = json.text("imageUrl"),
                state = json.optString("state", DownloadState.QUEUED),
                spec = json.text("spec"),
                serverId = json.text("serverId"),
                segment = json.optInt("segment", 0),
                bytes = json.optLong("bytes", 0),
                totalBytes = if (json.isNull("totalBytes")) null else json.optLong("totalBytes"),
                subtitles = (0 until (subtitles?.length() ?: 0)).mapNotNull { index ->
                    subtitles?.optJSONObject(index)?.let { item ->
                        SavedSubtitle(
                            item.optString("trackId").ifEmpty { return@let null },
                            item.optString("file").ifEmpty { return@let null },
                            item.optString("url"),
                        )
                    }
                },
                image = json.text("image"),
                errorKind = json.text("errorKind"),
                error = json.text("error"),
                addedAt = json.optLong("addedAt", 0),
            )
        } catch (_: org.json.JSONException) {
            null
        }

        private fun JSONObject.text(key: String): String? = if (isNull(key)) null else optString(key)
    }
}
