package io.github.zekurio.matinee.downloads

import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import io.github.zekurio.matinee.R
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/**
 * Runs [DownloadFetcher] for one download as a WorkManager job, which
 * WorkManager starts again after a break, with the app closed, and after a
 * reboot. It shows its progress as a notification and keeps running as a
 * foreground job while the app is away. A failure tries again up to
 * [MAX_ATTEMPTS] times, backing off from 30 seconds, except a refusal for
 * the account, which stops at once.
 */
class DownloadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val downloads = Downloads.of(context)
    private val store = downloads.store
    private val notificationId = (inputData.getString(KEY_ITEM) ?: "").hashCode()

    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ITEM) ?: return Result.failure()
        val entry = store[id] ?: return Result.success()
        if (entry.state == DownloadState.DONE || entry.state == DownloadState.PAUSED) return Result.success()
        // The server it came from, with that server's sign-in, whichever server is in use.
        val signIn = downloads.credentials.of(entry.server) ?: return Result.retry()
        val http = OkDownloadHttp(entry.server, signIn)
        store.update(id) { it.copy(state = DownloadState.RUNNING, errorKind = null, error = null) }
        foreground(id)
        val fetcher = DownloadFetcher(store, http, wait = { delay(it) }, onProgress = { foreground(it.id) })
        return try {
            withContext(Dispatchers.IO) { fetcher.fetch(id) }
            store.update(id) { it.copy(state = DownloadState.DONE, serverId = null, totalBytes = it.bytes, errorKind = null, error = null) }
            Result.success()
        } catch (e: CancellationException) {
            store.update(id) { if (it.state == DownloadState.RUNNING) it.copy(state = DownloadState.QUEUED) else it }
            throw e
        } catch (e: IOException) {
            val failure = downloadFailure(e)
            // The app log's only word on why, as the list shows the kind alone.
            val status = (e as? DownloadHttpException)?.status?.let { " ($it)" }.orEmpty()
            Log.w(TAG, "A download stopped: ${failure.kind}$status, try ${runAttemptCount + 1}")
            // Only a refusal keeps the server's words; the rest are shown in the app's language.
            val words = (failure as? DownloadFailure.Server)?.message
            // Downloads off for the account fail at once, rather than wait out every retry.
            if (failure == DownloadFailure.Forbidden || runAttemptCount >= MAX_ATTEMPTS) {
                store.update(id) { it.copy(state = DownloadState.FAILED, errorKind = failure.kind, error = words) }
                Result.failure()
            } else {
                store.update(id) {
                    if (it.state == DownloadState.RUNNING) it.copy(state = DownloadState.QUEUED, errorKind = failure.kind, error = words) else it
                }
                Result.retry()
            }
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
        val progress = entry.progress
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_download)
            .setContentTitle(entry.name)
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

    companion object {
        const val KEY_ITEM = "item"
        private const val TAG = "MatineeDownloads"
        private const val CHANNEL = "downloads"
        private const val MAX_ATTEMPTS = 8
    }
}
