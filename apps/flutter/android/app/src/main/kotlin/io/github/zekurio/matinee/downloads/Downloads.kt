package io.github.zekurio.matinee.downloads

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/**
 * The downloads of this process, the Kotlin app's `Downloads` without the
 * API: one resumable WorkManager job per file, which WorkManager keeps
 * across the app closing, a network drop, and a reboot. Dart says what to
 * fetch through [DownloadsBridge]; the worker reads the rest from here.
 */
class Downloads private constructor(context: Context) {
    private val app = context.applicationContext
    val store = DownloadStore(app.filesDir)
    val credentials = credentialsOf(app)
    private val prefs = app.getSharedPreferences("matinee_downloads", Context.MODE_PRIVATE)
    private val work get() = WorkManager.getInstance(app)

    /** Fetch only over unmetered networks. On until Dart says otherwise, as the Kotlin app had it. */
    var unmeteredOnly: Boolean
        get() = prefs.getBoolean(KEY_UNMETERED, true)
        set(value) {
            if (value == unmeteredOnly) return
            prefs.edit().putBoolean(KEY_UNMETERED, value).apply()
            store.all.filter { it.state == DownloadState.QUEUED }.forEach { schedule(it.id, replace = true) }
        }

    fun enqueue(entry: OfflineEntry) {
        if (store[entry.id] == null) store.put(entry)
        schedule(entry.id)
    }

    fun pause(id: String) {
        store.update(id) { it.copy(state = DownloadState.PAUSED) }
        work.cancelUniqueWork(workName(id))
    }

    fun resume(id: String) {
        val entry = store.update(id) {
            if (it.state == DownloadState.DONE) it else it.copy(state = DownloadState.QUEUED, errorKind = null, error = null)
        } ?: return
        if (entry.state != DownloadState.DONE) schedule(id, replace = true)
    }

    fun remove(id: String) {
        work.cancelUniqueWork(workName(id))
        store.remove(id)
    }

    fun forgetServer(server: String) {
        store.all.filter { it.server == server }.forEach { remove(it.id) }
        credentials.forget(server)
    }

    /** Start again what was waiting or running; what's scheduled already stays. */
    fun restore() {
        store.all.filter { it.state == DownloadState.QUEUED || it.state == DownloadState.RUNNING }.forEach { schedule(it.id) }
    }

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

    companion object {
        const val TAG = "download"
        private const val KEY_UNMETERED = "unmetered_only"

        fun workName(id: String) = "download-$id"

        @Volatile private var instance: Downloads? = null

        fun of(context: Context): Downloads = instance ?: synchronized(this) {
            instance ?: Downloads(context).also { instance = it }
        }
    }
}
