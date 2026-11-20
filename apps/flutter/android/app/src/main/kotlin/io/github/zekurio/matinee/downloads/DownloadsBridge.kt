package io.github.zekurio.matinee.downloads

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.BinaryMessenger
import kotlin.coroutines.resume
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * [DownloadsHostApi] over this process's [Downloads], and the changes sent
 * back to Dart as they happen, at most one batch per frame or so.
 */
class DownloadsBridge(private val activity: Activity, messenger: BinaryMessenger) : DownloadsHostApi {
    private val downloads = Downloads.of(activity)
    private val events = DownloadsEventsApi(messenger)
    private val main = Handler(Looper.getMainLooper())
    private val scope = MainScope()
    private val waiting = mutableListOf<(Boolean) -> Unit>()
    @Volatile private var closed = false
    @Volatile private var posted = false

    private val stopListening = downloads.store.listen { changed() }

    private fun changed() {
        if (closed || posted) return
        posted = true
        main.postDelayed({
            posted = false
            if (closed) return@postDelayed
            val entries = downloads.store.all.map(::message)
            scope.launch {
                try {
                    events.changed(entries)
                } catch (_: FlutterError) {
                    // Dart isn't listening yet; it reads the list when it starts.
                }
            }
        }, 100)
    }

    fun release() {
        closed = true
        stopListening()
        main.removeCallbacksAndMessages(null)
        scope.cancel()
    }

    override fun folder(): String = downloads.store.root.absolutePath

    override fun entries(): List<DownloadEntryMessage> = downloads.store.all.map(::message)

    override fun enqueue(request: DownloadRequestMessage) = downloads.enqueue(entry(request))

    override fun pause(id: String) = downloads.pause(id)

    override fun resume(id: String) = downloads.resume(id)

    override fun remove(id: String) = downloads.remove(id)

    override fun forgetServer(server: String) = downloads.forgetServer(server)

    override fun setUnmeteredOnly(on: Boolean) {
        downloads.unmeteredOnly = on
    }

    override fun setCredentials(server: String, token: String?, userAgent: String) =
        downloads.credentials.set(server, token, userAgent)

    override fun restore() = downloads.restore()

    override fun freeBytes(): Long = downloads.store.root.usableSpace

    private fun mayNotify(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    override suspend fun askToNotify(): Boolean {
        if (mayNotify()) return true
        return suspendCancellableCoroutine { continuation ->
            waiting += { granted -> if (continuation.isActive) continuation.resume(granted) }
            if (waiting.size == 1 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFY_REQUEST)
            }
        }
    }

    /** The answer to [askToNotify]'s prompt. */
    fun notifyAnswered() {
        val granted = mayNotify()
        val callbacks = waiting.toList()
        waiting.clear()
        callbacks.forEach { it(granted) }
    }

    companion object {
        const val NOTIFY_REQUEST = 7424

        fun entry(request: DownloadRequestMessage) = OfflineEntry(
            id = request.id,
            server = request.server,
            apiBase = request.apiBase,
            kind = when (request.kind) {
                DownloadKindMessage.ORIGINAL -> DownloadKind.ORIGINAL
                DownloadKindMessage.DEVICE -> DownloadKind.DEVICE
            },
            file = request.file,
            name = request.name,
            meta = request.meta,
            streamUrl = request.streamUrl,
            imageUrl = request.imageUrl,
            spec = request.spec,
            totalBytes = request.totalBytes,
            subtitles = request.subtitles.map { SavedSubtitle(it.trackId, it.file, it.url) },
        )

        fun message(entry: OfflineEntry) = DownloadEntryMessage(
            id = entry.id,
            server = entry.server,
            kind = if (entry.kind == DownloadKind.DEVICE) DownloadKindMessage.DEVICE else DownloadKindMessage.ORIGINAL,
            file = entry.file,
            name = entry.name,
            meta = entry.meta,
            state = when (entry.state) {
                DownloadState.RUNNING -> DownloadStateMessage.RUNNING
                DownloadState.PAUSED -> DownloadStateMessage.PAUSED
                DownloadState.DONE -> DownloadStateMessage.DONE
                DownloadState.FAILED -> DownloadStateMessage.FAILED
                else -> DownloadStateMessage.QUEUED
            },
            bytes = entry.bytes,
            segment = entry.segment.toLong(),
            subtitles = entry.subtitles.map { SavedSubtitleMessage(it.trackId, it.file, it.url) },
            addedAt = entry.addedAt,
            totalBytes = entry.totalBytes,
            serverId = entry.serverId,
            image = entry.image,
            error = when (entry.errorKind) {
                DownloadError.UNREACHABLE -> DownloadErrorMessage.UNREACHABLE
                DownloadError.BROKE_OFF -> DownloadErrorMessage.BROKE_OFF
                DownloadError.FORBIDDEN -> DownloadErrorMessage.FORBIDDEN
                DownloadError.SERVER -> DownloadErrorMessage.SERVER
                else -> null
            },
            errorMessage = entry.error,
        )
    }
}
