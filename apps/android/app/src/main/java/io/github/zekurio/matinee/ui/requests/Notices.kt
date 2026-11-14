package io.github.zekurio.matinee.ui.requests

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import io.github.zekurio.matinee.MainActivity
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.Notification
import io.github.zekurio.matinee.api.NotificationKind
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.ui.seasonName
import java.io.IOException
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerializationException

/*
 * The stored notifications, which the app reads since it has no push
 * service: while it's open, the snackbar shows each new one
 * (RequestSnackbars.kt); while it isn't, a WorkManager job looks about
 * every 15 minutes, on any network, and posts them on a channel of their
 * own. WorkManager keeps the job through a reboot. Either way each is
 * marked read once shown, which is all "read" means while there's no
 * inbox. Phones only: a TV shows nothing of requests yet.
 */

/** Older ones are marked read without being shown: news from last week isn't news. */
internal const val FRESH_MS = 3 * 86_400_000L

/** What the app keeps about notifications on this device. */
class RequestNotices(context: Context) {
    private val prefs = context.getSharedPreferences("request-notices", Context.MODE_PRIVATE)

    /** Look for notifications while the app is closed. On until turned off. */
    var background: Boolean
        get() = prefs.getBoolean("background", true)
        set(value) = prefs.edit { putBoolean("background", value) }

    /** Android was asked for the notification permission once, after an ask. */
    var askedPermission: Boolean
        get() = prefs.getBoolean("askedPermission", false)
        set(value) = prefs.edit { putBoolean("askedPermission", value) }
}

/** Whether Android lets the app post notifications at all. */
fun notificationsAllowed(context: Context): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) return false
    return NotificationManagerCompat.from(context).areNotificationsEnabled()
}

/** Where a notification leads, handed to [MainActivity] in its intent. */
sealed interface OpenTarget {
    val server: String

    data class Title(override val server: String, val titleId: String) : OpenTarget

    data class Catalog(override val server: String, val kind: String, val provider: String, val providerId: String) : OpenTarget

    data class Queue(override val server: String, val list: String) : OpenTarget

    fun intent(context: Context): Intent = Intent(context, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra(EXTRA_SERVER, server)
        .apply {
            when (this@OpenTarget) {
                is Title -> putExtra(EXTRA_TITLE, titleId)
                is Catalog -> putExtra(EXTRA_CATALOG, arrayOf(kind, provider, providerId))
                is Queue -> putExtra(EXTRA_QUEUE, list)
            }
        }

    companion object {
        private const val EXTRA_SERVER = "matinee.open.server"
        private const val EXTRA_TITLE = "matinee.open.title"
        private const val EXTRA_CATALOG = "matinee.open.catalog"
        private const val EXTRA_QUEUE = "matinee.open.queue"

        /** What [intent] asks to open, if it came from a notification. */
        fun of(intent: Intent?): OpenTarget? {
            val server = intent?.getStringExtra(EXTRA_SERVER) ?: return null
            intent.getStringExtra(EXTRA_TITLE)?.let { return Title(server, it) }
            intent.getStringArrayExtra(EXTRA_CATALOG)?.takeIf { it.size == 3 }?.let { return Catalog(server, it[0], it[1], it[2]) }
            intent.getStringExtra(EXTRA_QUEUE)?.let { return Queue(server, it) }
            return null
        }
    }
}

/** Where a stored notification leads: the title once it's here, its catalog page, or the queue. */
fun openTarget(item: Notification, server: String): OpenTarget? = when (item.kind) {
    NotificationKind.WAITING -> OpenTarget.Queue(server, "waiting")
    NotificationKind.NEEDS_ATTENTION -> OpenTarget.Queue(server, "needsAttention")
    else -> item.title?.let { title ->
        val here = title.availability.libraryTitleId
        if (here != null) OpenTarget.Title(server, here)
        else OpenTarget.Catalog(server, title.ref.kind, title.ref.provider, title.ref.providerId)
    }
}

/** A notification's words: its line, and what follows it. */
fun noticeText(item: Notification, res: android.content.res.Resources): Pair<String, String?>? = when (item.kind) {
    NotificationKind.WAITING ->
        (if (item.count == 1) res.getString(R.string.web_notifications_waitingOne)
        else res.getString(R.string.web_notifications_waiting, item.count.toString())) to null
    NotificationKind.NEEDS_ATTENTION ->
        (if (item.count == 1) res.getString(R.string.web_notifications_attentionOne)
        else res.getString(R.string.web_notifications_attention, item.count.toString())) to null
    NotificationKind.READY -> item.title?.let { title ->
        val season = item.season
        (
            if (season == null) res.getString(R.string.web_notifications_ready, title.name)
            else res.getString(R.string.web_notifications_readySeason, title.name, seasonName(season, res))
            ) to null
    }
    NotificationKind.UNAVAILABLE -> item.title?.let { title ->
        res.getString(R.string.web_notifications_unavailable, title.name) to
            (title.availability.reason?.let { declineText(it, res) } ?: res.getString(R.string.web_notifications_unavailableHint))
    }
    else -> null
}

/** Whether [item] is recent enough to show. */
fun isFresh(item: Notification, now: Long = System.currentTimeMillis()): Boolean =
    runCatching { now - Instant.parse(item.createdAt).toEpochMilli() < FRESH_MS }.getOrDefault(false)

private const val CHANNEL = "requests"

/** The channel requests post on, at default importance, apart from the quiet one downloads use. */
fun requestChannel(context: Context) {
    NotificationManagerCompat.from(context).createNotificationChannel(
        NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_DEFAULT)
            .setName(context.getString(R.string.web_notifications_requests))
            .setDescription(context.getString(R.string.requests_channel_description))
            .build(),
    )
}

/**
 * Looks for new notifications while the app is closed, posts the fresh
 * ones, and marks every unread one read. With the app open it leaves them
 * to the snackbar.
 */
class RequestNoticesWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext.app
        if (!app.notices.background || app.inForeground || !notificationsAllowed(app)) return Result.success()
        val state = withTimeoutOrNull(30_000) { app.session.state.first { it !is AuthState.Connecting } }
        if (state !is AuthState.SignedIn) return Result.success()
        val api = app.session.api ?: return Result.success()
        val server = app.session.activeServer.value ?: return Result.success()
        return try {
            post(api, server)
            Result.success()
        } catch (e: CancellationException) {
            throw e
        } catch (_: IOException) {
            // The next run looks again.
            Result.success()
        } catch (_: SerializationException) {
            Result.success()
        }
    }

    private suspend fun post(api: MatineeApi, server: String) {
        val context = applicationContext
        val unread = api.notifications.list(limit = 40).items.filter { it.readAt == null }
        if (unread.isEmpty()) return
        requestChannel(context)
        val manager = NotificationManagerCompat.from(context)
        for (item in unread.filter { isFresh(it) }.take(MOST_POSTED)) {
            val (line, detail) = noticeText(item, context.resources) ?: continue
            val target = openTarget(item, server) ?: continue
            val open = PendingIntent.getActivity(
                context,
                item.id.hashCode(),
                target.intent(context),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val notification = NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.lucide_bell)
                .setContentTitle(line)
                .apply { if (detail != null) setContentText(detail) }
                .setContentIntent(open)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .build()
            try {
                manager.notify(item.id, 0, notification)
            } catch (_: SecurityException) {
                // The permission went between the check and now; the app shows it when opened.
                return
            }
        }
        api.notifications.markRead(unread.map { it.id }, all = false)
    }

    companion object {
        private const val NAME = "request-notices"
        private const val MOST_POSTED = 5

        fun schedule(context: Context) {
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<RequestNoticesWorker>(15, TimeUnit.MINUTES)
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build(),
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}
