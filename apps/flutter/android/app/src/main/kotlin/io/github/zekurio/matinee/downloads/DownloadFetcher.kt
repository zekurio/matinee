package io.github.zekurio.matinee.downloads

import java.io.Closeable
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONException
import org.json.JSONObject

/** One answer from the server, its body read as it comes. */
class HttpAnswer(
    val code: Int,
    private val headers: Map<String, String>,
    val body: InputStream,
    /** The body's length, or -1 when the server didn't say. */
    val length: Long,
    private val onClose: () -> Unit = {},
) : Closeable {
    val ok get() = code in 200..299

    /** A header by its name, any case. */
    fun header(name: String): String? = headers[name.lowercase()]

    override fun close() {
        runCatching { body.close() }
        onClose()
    }
}

/** What the fetches ask of the network; the worker's goes through OkHttp. */
interface DownloadHttp {
    /** [from] asks for the bytes from there on. [slow] waits minutes for an answer, as a subtitle taken out of a large file can take. */
    suspend fun get(url: String, from: Long = 0, slow: Boolean = false): HttpAnswer

    suspend fun post(url: String, json: String): HttpAnswer

    suspend fun delete(url: String): HttpAnswer
}

/** The server answered with [status], and maybe said why in [message]. */
class DownloadHttpException(val status: Int, message: String?) : IOException(message)

/** Why a download stopped, as [OfflineEntry] keeps it: its [kind], and for a refusal the server's own words. */
sealed interface DownloadFailure {
    val kind: String

    /** The server answered, and said why, in its own words when it sent some. */
    data class Server(val message: String?) : DownloadFailure {
        override val kind: String get() = DownloadError.SERVER
    }

    /** The server couldn't be reached at all. */
    data object Unreachable : DownloadFailure {
        override val kind: String get() = DownloadError.UNREACHABLE
    }

    /** It was reached, then the connection broke off. */
    data object BrokeOff : DownloadFailure {
        override val kind: String get() = DownloadError.BROKE_OFF
    }

    /** Downloads are off for the account, which trying again won't change. */
    data object Forbidden : DownloadFailure {
        override val kind: String get() = DownloadError.FORBIDDEN
    }
}

fun downloadFailure(e: IOException): DownloadFailure = when (e) {
    is DownloadHttpException -> if (e.status == 403) DownloadFailure.Forbidden else DownloadFailure.Server(e.message)
    is UnknownHostException, is ConnectException, is SocketTimeoutException, is NoRouteToHostException, is SSLException ->
        DownloadFailure.Unreachable
    else -> DownloadFailure.BrokeOff
}

/** The server wants the download started over: the file or its settings changed. */
class StartOver : IOException("start over")

/**
 * Fetches one download: its picture and subtitles, then the file as it is
 * with byte ranges, or a device version's init segment and segments in
 * order. Every step is written down, so a later run picks up from there.
 * The Kotlin app's `DownloadWorker` apart from WorkManager, so the JVM
 * tests run it.
 */
class DownloadFetcher(
    private val store: DownloadStore,
    private val http: DownloadHttp,
    private val wait: suspend (Long) -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
    /** Hears the progress, at most once a second, as it's written down. */
    private val onProgress: suspend (OfflineEntry) -> Unit = {},
) {
    private var lastSaved = 0L

    /** Everything of [id] that isn't here yet. Throws on what should stop it. */
    suspend fun fetch(id: String) {
        val entry = store[id] ?: return
        saveImage(id)
        saveSubtitles(id)
        var tries = 0
        while (true) {
            try {
                when (entry.kind) {
                    DownloadKind.DEVICE -> fetchVersion(id)
                    else -> fetchOriginal(id)
                }
                return
            } catch (e: StartOver) {
                if (++tries > 2) throw IOException(e)
                startOver(id)
            }
        }
    }

    private suspend fun progress(id: String, bytes: Long, force: Boolean = false) {
        val time = now()
        if (!force && time - lastSaved < 1000) return
        lastSaved = time
        store.update(id) { it.copy(bytes = bytes) }?.let { onProgress(it) }
    }

    private suspend fun copy(input: InputStream, out: OutputStream, onBytes: suspend (Long) -> Unit) {
        val buffer = ByteArray(64 * 1024)
        while (true) {
            coroutineContext.ensureActive()
            val read = input.read(buffer)
            if (read < 0) break
            out.write(buffer, 0, read)
            onBytes(read.toLong())
        }
    }

    /** A still or backdrop for the list, which shows without the server. A picture that doesn't come is left out. */
    private suspend fun saveImage(id: String) {
        val entry = store[id] ?: return
        if (entry.image != null) return
        val url = entry.imageUrl ?: return
        val name = "$id/image.jpg"
        val file = File(store.root, name).apply { parentFile?.mkdirs() }
        try {
            http.get(url).use { response ->
                if (!response.ok) return
                FileOutputStream(file).use { out -> copy(response.body, out) {} }
            }
            store.update(id) { it.copy(image = name) }
        } catch (_: IOException) {
            // The list shows the title's tone instead.
        }
    }

    private suspend fun saveSubtitles(id: String) {
        val entry = store[id] ?: return
        for (subtitle in entry.subtitles) {
            val file = File(store.root, subtitle.file)
            if (file.exists()) continue
            file.parentFile?.mkdirs()
            val partial = File(file.path + ".part")
            http.get(subtitle.url, slow = true).use { response ->
                // A track the server can't convert is left out rather than holding up the video.
                if (!response.ok) return@use
                FileOutputStream(partial).use { out -> copy(response.body, out) {} }
                partial.renameTo(file)
            }
        }
        // Leave out what didn't come, so the player doesn't offer it.
        store.update(id) { current -> current.copy(subtitles = current.subtitles.filter { File(store.root, it.file).exists() }) }
    }

    /** The file as it is, resumed with a byte range after a break. */
    private suspend fun fetchOriginal(id: String) {
        val entry = store[id] ?: return
        val file = store.file(entry).apply { parentFile?.mkdirs() }
        var have = if (file.exists()) file.length() else 0L
        http.get(entry.streamUrl, have).use { response ->
            if (response.code == 416 && have > 0) return
            if (!response.ok) throw DownloadHttpException(response.code, null)
            val resumed = response.code == 206
            if (!resumed) have = 0
            val total = response.header("Content-Range")?.substringAfterLast('/')?.toLongOrNull()
                ?: response.length.takeIf { it >= 0 }?.let { it + have }
            store.update(id) { it.copy(bytes = have, totalBytes = total ?: it.totalBytes) }
            FileOutputStream(file, resumed).use { out ->
                copy(response.body, out) { read ->
                    have += read
                    progress(id, have)
                }
            }
            progress(id, have, force = true)
            if (total != null && have < total) throw IOException("The download broke off.")
        }
    }

    /**
     * A version the server makes for this device: set up once, then the
     * init segment and every segment in order until the server answers 204.
     */
    private suspend fun fetchVersion(id: String) {
        var entry = store[id] ?: return
        val file = store.file(entry).apply { parentFile?.mkdirs() }
        val serverId = entry.serverId ?: run {
            val spec = entry.spec ?: throw IOException("This download has no version to ask for.")
            val started = start(entry, spec)
            file.delete()
            entry = store.update(id) {
                it.copy(serverId = started.first, segment = 0, bytes = 0, totalBytes = started.second ?: it.totalBytes)
            } ?: return
            started.first
        }
        // The file holds the init segment and the segments before `segment`;
        // a segment cut off by a break goes. A file shorter than that lost
        // what was written down, as when the power went, and a segment
        // after the gap would spoil it, so the version starts over.
        if (entry.bytes > 0 && (!file.exists() || file.length() < entry.bytes)) throw StartOver()
        if (file.exists() && file.length() > entry.bytes) RandomAccessFile(file, "rw").use { it.setLength(entry.bytes) }
        // A version still waiting its turn on the server answers 503, as a
        // segment being made does: wait as it says, then ask again. Many
        // downloads started together wait so, and none of them is a failure.
        while (entry.bytes == 0L) {
            coroutineContext.ensureActive()
            val here = http.get(route(entry.apiBase, "downloads", serverId, "init.mp4")).use { response ->
                when {
                    response.code == 404 || response.code == 409 -> throw StartOver()
                    response.code == 503 -> {
                        wait(retryAfter(response))
                        false
                    }
                    !response.ok -> throw DownloadHttpException(response.code, null)
                    else -> {
                        FileOutputStream(file, false).use { out ->
                            copy(response.body, out) {}
                            out.fd.sync()
                        }
                        true
                    }
                }
            }
            if (here) entry = store.update(id) { it.copy(bytes = file.length(), segment = 0) } ?: return
        }
        var segment = entry.segment
        var bytes = entry.bytes
        while (true) {
            coroutineContext.ensureActive()
            val last = http.get(route(entry.apiBase, "downloads", serverId, "$segment.m4s")).use { response ->
                when (response.code) {
                    200 -> {
                        // On the disk before it's written down as here.
                        FileOutputStream(file, true).use { out ->
                            copy(response.body, out) { read -> bytes += read }
                            out.fd.sync()
                        }
                        segment++
                        store.update(id) { it.copy(segment = segment, bytes = bytes) }
                        // Written down above; the notification hears at most once a
                        // second, as small segments come many to a second.
                        progress(id, bytes)
                        response.header("X-Matinee-Last-Segment") == "1"
                    }
                    204 -> true
                    503 -> {
                        wait(retryAfter(response))
                        false
                    }
                    404, 409 -> throw StartOver()
                    else -> throw DownloadHttpException(response.code, null)
                }
            }
            if (last) break
        }
        // The server can let go of the version; the file is here.
        try {
            http.delete(route(entry.apiBase, "v1", "downloads", serverId)).close()
        } catch (_: IOException) {
            // It cleans up after itself in time.
        }
    }

    /** How long a 503 asks to wait, in milliseconds: its Retry-After, kept between a second and a minute. */
    private fun retryAfter(response: HttpAnswer): Long =
        (response.header("Retry-After")?.toLongOrNull() ?: 5L).coerceIn(1, 60) * 1000

    /** `downloads.start`: the server's id for the version, and its estimate of the size. */
    private suspend fun start(entry: OfflineEntry, spec: String): Pair<String, Long?> {
        val body = try {
            JSONObject().put("spec", JSONObject(spec)).toString()
        } catch (e: JSONException) {
            throw IOException(e)
        }
        http.post(route(entry.apiBase, "v1", "media", entry.id, "downloads"), body).use { response ->
            val text = response.body.readBytes().toString(Charsets.UTF_8)
            if (!response.ok) throw DownloadHttpException(response.code, serverMessage(text))
            return try {
                val json = JSONObject(text)
                val plan = json.optJSONObject("plan")
                json.getString("id") to plan?.takeIf { it.has("estimatedBytes") }?.optLong("estimatedBytes")
            } catch (e: JSONException) {
                throw IOException(e)
            }
        }
    }

    private fun startOver(id: String) {
        val entry = store[id] ?: return
        store.file(entry).delete()
        store.update(id) { it.copy(serverId = null, segment = 0, bytes = 0) }
    }

    companion object {
        /** [base] and [segments] as one address, each segment escaped. */
        fun route(base: String, vararg segments: String): String =
            base.trimEnd('/') + segments.joinToString("") { "/" + escape(it) }

        private fun escape(segment: String): String = buildString {
            for (byte in segment.toByteArray(Charsets.UTF_8)) {
                val char = byte.toInt().toChar()
                if (char.isLetterOrDigit() && byte >= 0 || char in "-._~") append(char) else append("%%%02X".format(byte.toInt() and 0xff))
            }
        }

        /** The server's words in an error answer, as the API clients read them. */
        fun serverMessage(body: String): String? = try {
            JSONObject(body).optString("message").trim().ifEmpty { null }
        } catch (_: JSONException) {
            null
        }
    }
}
