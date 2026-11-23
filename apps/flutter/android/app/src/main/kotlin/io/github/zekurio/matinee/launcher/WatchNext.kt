package io.github.zekurio.matinee.launcher

import android.content.ComponentName
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.tv.TvContract
import android.media.tv.TvContract.WatchNextPrograms as Programs
import android.net.Uri
import android.util.Log
import io.flutter.plugin.common.BinaryMessenger
import io.github.zekurio.matinee.MainActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

private const val TAG = "MatineeWatchNext"

/**
 * This app's cards in the TV launcher's Watch Next row, through the
 * framework's `TvContract.WatchNextPrograms`, there since API 26. Dart says
 * whose row it is and what goes in; this writes the rows, keeps their
 * pictures where the launcher can read them, and hands over the card the
 * person opened. Made on a TV only.
 */
class WatchNext(context: Context, messenger: BinaryMessenger) : WatchNextApi {
    private val app = context.applicationContext
    private val resolver = app.contentResolver
    private val prefs = app.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val art = WatchNextArt(app)
    private val events = WatchNextEventsApi(messenger)
    private val scope = MainScope()

    /** One write at a time: the table, the pictures, and what's remembered change together. */
    private val writing = Mutex()
    private var link: WatchNextLinkMessage? = null

    init {
        // Off in the manifest, so a phone has neither.
        for (component in listOf(WatchNextArtwork::class.java, WatchNextBoot::class.java)) {
            app.packageManager.setComponentEnabledSetting(
                ComponentName(app, component),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP,
            )
        }
    }

    fun release() = scope.cancel()

    /**
     * The intent the activity started with, or got while running ([running]).
     * A card's goes to Dart, at once or when it asks; true when it was one.
     */
    fun opened(intent: Intent?, running: Boolean): Boolean {
        val found = WatchNextLink.parse(intent) ?: return false
        if (!running) {
            link = found
            return true
        }
        scope.launch {
            try {
                events.opened(found)
            } catch (_: FlutterError) {
                // Dart isn't listening yet; it asks when it starts.
                link = found
            }
        }
        return true
    }

    override fun takeLink(): WatchNextLinkMessage? = link.also { link = null }

    override suspend fun setIdentity(identity: String?) = write {
        require(identity == null || WatchNextLink.isIdentity(identity)) { "Not an identity" }
        if (prefs.getString(IDENTITY, null) != identity) clear(identity)
    }

    override suspend fun missingArtwork(identity: String, artworkIds: List<String>): List<String> = write {
        artworkIds.filter { !art.file(identity, it).exists() }
    }

    override suspend fun saveArtwork(identity: String, artworkId: String, bytes: ByteArray) = write {
        // Another account's by now: its pictures are gone and stay gone.
        if (prefs.getString(IDENTITY, null) == identity) art.save(identity, artworkId, bytes)
    }

    override suspend fun publish(identity: String, programs: List<WatchNextProgramMessage>) = write {
        if (prefs.getString(IDENTITY, null) != identity) return@write
        // Granted again each time: grants don't outlive a restart, and a launcher can be installed later.
        val readers = art.readers()
        val pictures = programs.mapNotNull { it.artworkId }.distinct().associateWith { id ->
            art.file(identity, id).takeIf { it.exists() }?.let { file -> art.share(file, readers) }
        }
        val plan = planWatchNext(rows(), memory(), programs) { program ->
            columns(program, program.artworkId?.let(pictures::get), identity)
        }
        for (id in plan.delete) resolver.delete(TvContract.buildWatchNextProgramUri(id), null, null)
        for (values in plan.insert) {
            checkNotNull(resolver.insert(Programs.CONTENT_URI, content(values))) { "The launcher took no row" }
        }
        for ((id, values) in plan.update) {
            resolver.update(TvContract.buildWatchNextProgramUri(id), content(values), null, null)
        }
        remember(plan.memory)
        art.keepOnly(identity, programs.mapNotNull { it.artworkId }.toSet())
        Log.d(TAG, "Watch Next has ${programs.size} programs: ${plan.insert.size} new, ${plan.update.size} changed, ${plan.delete.size} gone")
    }

    private suspend fun <T> write(block: () -> T): T = withContext(Dispatchers.IO) { writing.withLock { block() } }

    private fun clear(identity: String?) {
        // The pictures first: they go even if the launcher took the table away.
        art.clear()
        resolver.delete(Programs.CONTENT_URI, null, null)
        // Last, so a clear that failed is tried again the next time.
        prefs.edit().clear().apply { if (identity != null) putString(IDENTITY, identity) }.commit()
    }

    private fun rows(): Map<String, WatchNextRow> {
        val rows = mutableMapOf<String, WatchNextRow>()
        resolver.query(Programs.CONTENT_URI, PROJECTION, null, null, null)?.use { cursor ->
            while (cursor.moveToNext()) {
                val values = cursor.columnNames.associateWith { name -> cursor.getString(cursor.getColumnIndexOrThrow(name)) }
                val itemId = values[Programs.COLUMN_INTERNAL_PROVIDER_ID] ?: continue
                val id = values[Programs._ID]?.toLongOrNull() ?: continue
                rows[itemId] = WatchNextRow(
                    id = id,
                    browsable = values[Programs.COLUMN_BROWSABLE] != "0",
                    engagementMillis = values[Programs.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS]?.toLongOrNull(),
                    values = values,
                )
            }
        }
        return rows
    }

    private fun memory(): WatchNextMemory {
        val dismissed = mutableMapOf<String, Long>()
        val published = mutableMapOf<String, Long>()
        for ((key, value) in prefs.all) {
            if (value !is Long) continue
            when {
                key.startsWith(DISMISSED) -> dismissed[key.removePrefix(DISMISSED)] = value
                key.startsWith(PUBLISHED) -> published[key.removePrefix(PUBLISHED)] = value
            }
        }
        return WatchNextMemory(dismissed, published)
    }

    private fun remember(memory: WatchNextMemory) {
        prefs.edit().apply {
            prefs.all.keys.filter { it.startsWith(DISMISSED) || it.startsWith(PUBLISHED) }.forEach(::remove)
            memory.dismissed.forEach { (itemId, at) -> putLong(DISMISSED + itemId, at) }
            memory.published.forEach { (itemId, at) -> putLong(PUBLISHED + itemId, at) }
        }.commit()
    }

    /** No token and no server address goes in: the picture is a file of ours, and the link names only the file to play. */
    private fun columns(program: WatchNextProgramMessage, picture: Uri?, identity: String): WatchNextColumns = mapOf(
        Programs.COLUMN_INTERNAL_PROVIDER_ID to program.itemId,
        Programs.COLUMN_CONTENT_ID to "$identity/${program.itemId}",
        Programs.COLUMN_TYPE to if (program.episode) Programs.TYPE_TV_EPISODE else Programs.TYPE_MOVIE,
        Programs.COLUMN_WATCH_NEXT_TYPE to when (program.kind) {
            WatchNextKindMessage.RESUME -> Programs.WATCH_NEXT_TYPE_CONTINUE
            WatchNextKindMessage.NEXT -> Programs.WATCH_NEXT_TYPE_NEXT
        },
        Programs.COLUMN_TITLE to program.title,
        Programs.COLUMN_EPISODE_TITLE to program.episodeTitle,
        Programs.COLUMN_SHORT_DESCRIPTION to program.description,
        Programs.COLUMN_SEASON_DISPLAY_NUMBER to program.seasonNumber?.toString(),
        Programs.COLUMN_EPISODE_DISPLAY_NUMBER to program.episodeNumber?.toString(),
        Programs.COLUMN_DURATION_MILLIS to program.durationMillis,
        Programs.COLUMN_LAST_PLAYBACK_POSITION_MILLIS to program.positionMillis,
        Programs.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS to program.engagementMillis,
        Programs.COLUMN_POSTER_ART_URI to picture?.toString(),
        Programs.COLUMN_POSTER_ART_ASPECT_RATIO to if (program.poster) Programs.ASPECT_RATIO_2_3 else Programs.ASPECT_RATIO_16_9,
        Programs.COLUMN_INTENT_URI to WatchNextLink.intent(app, identity, program.itemId).toUri(Intent.URI_INTENT_SCHEME),
    )

    private fun content(values: WatchNextColumns) = ContentValues().apply {
        for ((name, value) in values) {
            when (value) {
                null -> putNull(name)
                is String -> put(name, value)
                is Int -> put(name, value)
                is Long -> put(name, value)
                else -> error("A ${value::class.simpleName} in $name")
            }
        }
    }

    private companion object {
        const val PREFERENCES = "launcher"
        const val IDENTITY = "identity"
        const val DISMISSED = "dismissed."
        const val PUBLISHED = "published."

        /** What a row is compared by: every column [columns] writes, and the two only the launcher does. */
        val PROJECTION = arrayOf(
            Programs._ID, Programs.COLUMN_BROWSABLE, Programs.COLUMN_INTERNAL_PROVIDER_ID,
            Programs.COLUMN_CONTENT_ID, Programs.COLUMN_TYPE, Programs.COLUMN_WATCH_NEXT_TYPE,
            Programs.COLUMN_TITLE, Programs.COLUMN_EPISODE_TITLE, Programs.COLUMN_SHORT_DESCRIPTION,
            Programs.COLUMN_SEASON_DISPLAY_NUMBER, Programs.COLUMN_EPISODE_DISPLAY_NUMBER,
            Programs.COLUMN_DURATION_MILLIS, Programs.COLUMN_LAST_PLAYBACK_POSITION_MILLIS,
            Programs.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS, Programs.COLUMN_POSTER_ART_URI,
            Programs.COLUMN_POSTER_ART_ASPECT_RATIO, Programs.COLUMN_INTENT_URI,
        )
    }
}

/**
 * A card's link, `matinee://watch-next/<identity>/<file>`, which opens
 * [MainActivity]. Dart checks who is signed in before it plays anything.
 */
internal object WatchNextLink {
    private val IDENTITY = Regex("[0-9a-f]{64}")
    private val ITEM = Regex("[A-Za-z0-9-]{1,128}")

    fun isIdentity(value: String) = IDENTITY.matches(value)

    fun intent(context: Context, identity: String, itemId: String): Intent =
        Intent(
            Intent.ACTION_VIEW,
            Uri.Builder().scheme("matinee").authority("watch-next").appendPath(identity).appendPath(itemId).build(),
            context,
            MainActivity::class.java,
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    /** The card [intent] opens, or null when it's another intent, or one brought back from the recent apps. */
    fun parse(intent: Intent?): WatchNextLinkMessage? {
        val uri = intent?.data ?: return null
        if (uri.scheme != "matinee" || uri.host != "watch-next") return null
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return null
        val parts = uri.pathSegments
        if (parts.size != 2 || !IDENTITY.matches(parts[0]) || !ITEM.matches(parts[1])) return null
        return WatchNextLinkMessage(identity = parts[0], itemId = parts[1])
    }
}
