package io.github.zekurio.matinee.downloads

import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.await
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.itemLabel
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
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

/** Why a download stopped, before it's put in words. */
internal sealed interface DownloadFailure {
    /** The server answered, and said why. */
    data class Server(val message: String) : DownloadFailure

    /** The server couldn't be reached at all. */
    data object Unreachable : DownloadFailure

    /** It was reached, then the connection broke off. */
    data object BrokeOff : DownloadFailure
}

internal fun downloadFailure(e: IOException): DownloadFailure = when (e) {
    is ApiException -> DownloadFailure.Server(e.message)
    is UnknownHostException, is ConnectException, is SocketTimeoutException, is NoRouteToHostException, is SSLException ->
        DownloadFailure.Unreachable
    else -> DownloadFailure.BrokeOff
}

/** The server wants the download started over: the file or its settings changed. */
private class StartOver : IOException("start over")

/**
 * Fetches one download: its picture and subtitles, then the file as it is
 * with byte ranges, or a device version's init segment and segments in
 * order. Every step is written down, so a later run picks up from there.
 */
class DownloadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val downloads = context.app.downloads
    private val store = downloads.store
    private val notificationId = (inputData.getString(KEY_ITEM) ?: "").hashCode()
    private var lastSaved = 0L

    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ITEM) ?: return Result.failure()
        val entry = store[id] ?: return Result.success()
        if (entry.state == DownloadState.DONE || entry.state == DownloadState.PAUSED) return Result.success()
        val session = applicationContext.app.session
        val api = session.api ?: return Result.retry()
        store.update(id) { it.copy(state = DownloadState.RUNNING, error = null) }
        foreground(id)
        return try {
            withContext(Dispatchers.IO) {
                // Subtitles taken out of a large file can keep the server busy for minutes.
                val slow = session.http.newBuilder().readTimeout(5, TimeUnit.MINUTES).build()
                saveImage(api, session.http, id)
                saveSubtitles(api, slow, id)
                var tries = 0
                while (true) {
                    try {
                        when (entry.kind) {
                            DownloadKind.DEVICE -> fetchVersion(api, session.http, id)
                            else -> fetchOriginal(api, session.http, id)
                        }
                        break
                    } catch (e: StartOver) {
                        if (++tries > 2) throw IOException(e)
                        startOver(id)
                    }
                }
            }
            store.update(id) { it.copy(state = DownloadState.DONE, serverId = null, totalBytes = it.bytes, error = null) }
            Result.success()
        } catch (e: CancellationException) {
            store.update(id) { if (it.state == DownloadState.RUNNING) it.copy(state = DownloadState.QUEUED) else it }
            throw e
        } catch (e: IOException) {
            val message = failureLabel(e)
            if (runAttemptCount >= MAX_ATTEMPTS) {
                store.update(id) { it.copy(state = DownloadState.FAILED, error = message) }
                Result.failure()
            } else {
                store.update(id) { if (it.state == DownloadState.RUNNING) it.copy(state = DownloadState.QUEUED, error = message) else it }
                Result.retry()
            }
        }
    }

    /**
     * What went wrong, short enough for a download's status line, like
     * "Server not reachable", rather than the exception's "timeout".
     */
    private fun failureLabel(e: IOException): String {
        val res = applicationContext.resources
        return when (val failure = downloadFailure(e)) {
            is DownloadFailure.Server -> failure.message
            DownloadFailure.Unreachable -> res.getString(R.string.downloads_error_unreachable)
            DownloadFailure.BrokeOff -> res.getString(R.string.downloads_error_broke_off)
        }
    }

    /** Shows the download's progress, and keeps it running while the app is away. */
    private suspend fun foreground(id: String) {
        val entry = store[id] ?: return
        val context = applicationContext
        NotificationManagerCompat.from(context).createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_LOW)
                .setName(context.getString(R.string.downloads_channel))
                .build(),
        )
        val label = itemLabel(entry.item, context.resources)
        val name = if (entry.item.title?.kind == TitleKind.SHOW && label.code != null) "${label.showName} · ${label.code}" else label.title
        val progress = entry.progress
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.lucide_download)
            .setContentTitle(name)
            .setContentText(context.getString(R.string.downloads_state_running))
            .setProgress(100, ((progress ?: 0f) * 100).toInt(), progress == null)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .build()
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(notificationId, notification)
        }
        try {
            setForeground(info)
        } catch (_: IllegalStateException) {
            // Android doesn't let a job in the background show itself; it runs on unseen.
        }
    }

    /** Write the progress down, at most once a second, and show it. */
    private suspend fun progress(id: String, bytes: Long, force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - lastSaved < 1000) return
        lastSaved = now
        store.update(id) { it.copy(bytes = bytes) }
        foreground(id)
    }

    private suspend fun get(http: OkHttpClient, url: String, range: Long = 0): Response {
        val request = Request.Builder().url(url).apply { if (range > 0) header("Range", "bytes=$range-") }.build()
        return http.newCall(request).await()
    }

    private fun failure(response: Response): IOException =
        ApiException(response.code, null, "The server answered ${response.code}.")

    private suspend fun copy(input: InputStream, out: OutputStream, onBytes: suspend (Long) -> Unit) {
        val buffer = ByteArray(64 * 1024)
        while (true) {
            currentCoroutineContext().ensureActive()
            val read = input.read(buffer)
            if (read < 0) break
            out.write(buffer, 0, read)
            onBytes(read.toLong())
        }
    }

    /** A still or backdrop for the downloads list, which shows without the server. */
    private suspend fun saveImage(api: MatineeApi, http: OkHttpClient, id: String) {
        val entry = store[id] ?: return
        if (entry.image != null) return
        val item = entry.item
        val artwork = item.episode?.still ?: item.title?.images?.backdrop
        val url = artwork?.let { api.paths.artwork(it.id, ArtworkSize.Small) } ?: api.paths.thumbnail(item.id)
        val name = "$id/image.jpg"
        val file = File(store.root, name).apply { parentFile?.mkdirs() }
        runCatching {
            get(http, url).use { response ->
                if (!response.isSuccessful) return
                FileOutputStream(file).use { out -> response.body.byteStream().use { copy(it, out) {} } }
            }
            store.update(id) { it.copy(image = name) }
        }
    }

    private suspend fun saveSubtitles(api: MatineeApi, http: OkHttpClient, id: String) {
        val entry = store[id] ?: return
        for (subtitle in entry.subtitles) {
            val file = File(store.root, subtitle.file)
            if (file.exists()) continue
            file.parentFile?.mkdirs()
            val partial = File(file.path + ".part")
            get(http, api.paths.subtitle(entry.item.id, subtitle.track.id)).use { response ->
                // A track the server can't convert is left out rather than holding up the video.
                if (!response.isSuccessful) return@use
                FileOutputStream(partial).use { out -> response.body.byteStream().use { copy(it, out) {} } }
                partial.renameTo(file)
            }
        }
        // Leave out what didn't come, so the player doesn't offer it.
        store.update(id) { current -> current.copy(subtitles = current.subtitles.filter { File(store.root, it.file).exists() }) }
    }

    /** The file as it is, resumed with a byte range after a break. */
    private suspend fun fetchOriginal(api: MatineeApi, http: OkHttpClient, id: String) {
        val entry = store[id] ?: return
        val file = store.file(entry).apply { parentFile?.mkdirs() }
        var have = if (file.exists()) file.length() else 0L
        get(http, api.paths.stream(id), have).use { response ->
            if (response.code == 416 && have > 0) return
            if (!response.isSuccessful) throw failure(response)
            val resumed = response.code == 206
            if (!resumed) have = 0
            val total = response.header("Content-Range")?.substringAfterLast('/')?.toLongOrNull()
                ?: response.body.contentLength().takeIf { it >= 0 }?.let { it + have }
            store.update(id) { it.copy(bytes = have, totalBytes = total ?: it.totalBytes) }
            FileOutputStream(file, resumed).use { out ->
                response.body.byteStream().use { input ->
                    copy(input, out) { read ->
                        have += read
                        progress(id, have)
                    }
                }
            }
            progress(id, have, force = true)
            if (total != null && have < total) throw IOException("The download broke off.")
        }
    }

    /**
     * A version the server makes for this device: set up once, then the init
     * segment and every segment in order until the server answers 204.
     */
    private suspend fun fetchVersion(api: MatineeApi, http: OkHttpClient, id: String) {
        var entry = store[id] ?: return
        val file = store.file(entry).apply { parentFile?.mkdirs() }
        val serverId = entry.serverId ?: run {
            val spec = entry.spec ?: throw IOException("This download has no version to ask for.")
            val started = api.downloads.start(id, spec)
            file.delete()
            entry = store.update(id) {
                it.copy(serverId = started.id, segment = 0, bytes = 0, totalBytes = started.plan.estimatedBytes)
            } ?: return
            started.id
        }
        // The file holds the init segment and the segments before `segment`; a
        // segment cut off by a break goes.
        if (file.exists() && file.length() > entry.bytes) RandomAccessFile(file, "rw").use { it.setLength(entry.bytes) }
        if (entry.bytes == 0L) {
            get(http, api.paths.downloadInit(serverId)).use { response ->
                if (response.code == 404 || response.code == 409) throw StartOver()
                if (!response.isSuccessful) throw failure(response)
                FileOutputStream(file, false).use { out -> response.body.byteStream().use { copy(it, out) {} } }
            }
            entry = store.update(id) { it.copy(bytes = file.length(), segment = 0) } ?: return
        }
        var segment = entry.segment
        var bytes = entry.bytes
        while (true) {
            currentCoroutineContext().ensureActive()
            val last = get(http, api.paths.downloadSegment(serverId, segment)).use { response ->
                when (response.code) {
                    200 -> {
                        FileOutputStream(file, true).use { out ->
                            response.body.byteStream().use { input -> copy(input, out) { read -> bytes += read } }
                        }
                        segment++
                        store.update(id) { it.copy(segment = segment, bytes = bytes) }
                        progress(id, bytes, force = true)
                        response.header("X-Matinee-Last-Segment") == "1"
                    }
                    204 -> true
                    503 -> {
                        delay((response.header("Retry-After")?.toLongOrNull() ?: 5L).coerceIn(1, 60) * 1000)
                        false
                    }
                    404, 409 -> throw StartOver()
                    else -> throw failure(response)
                }
            }
            if (last) break
        }
        runCatching { api.downloads.remove(serverId) }
    }

    private fun startOver(id: String) {
        val entry = store[id] ?: return
        store.file(entry).delete()
        store.update(id) { it.copy(serverId = null, segment = 0, bytes = 0) }
    }

    companion object {
        const val KEY_ITEM = "item"
        private const val CHANNEL = "downloads"
        private const val MAX_ATTEMPTS = 8
    }
}
