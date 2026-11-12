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
import androidx.core.content.FileProvider
import io.github.zekurio.matinee.MatineeApp
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.ui.itemLabel
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.Request

/** Owns only this package's Watch Next rows. Created on TVs only. */
class WatchNext(private val app: MatineeApp) {
    private val scope = MainScope()
    private val syncLock = Mutex()
    private val rowsLock = Mutex()
    private val prefs = app.getSharedPreferences("watch-next", Context.MODE_PRIVATE)
    private val resolver = app.contentResolver
    private val artRoot = File(app.filesDir, "watch-next-art")
    private val authority = "${app.packageName}.watch-next-art"

    init {
        app.packageManager.setComponentEnabledSetting(
            ComponentName(app, WatchNextArtwork::class.java),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )
        scope.launch {
            app.session.state.collect { state ->
                val identity = identity()
                try {
                    withContext(Dispatchers.IO) {
                        rowsLock.withLock {
                            if (prefs.getString("identity", null) != identity) clear(identity)
                        }
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "Couldn't clear Watch Next", e)
                }
                when (state) {
                    is AuthState.SignedIn -> {
                        WatchNextWorker.schedule(app)
                        requestSync()
                    }
                    is AuthState.NoServer, is AuthState.SignedOut -> WatchNextWorker.cancel(app)
                    else -> Unit
                }
            }
        }
    }

    /**
     * Cached account identity also works while the session is being checked,
     * and stays while another server is being added.
     */
    internal fun identity(): String? = app.session.identity()?.let(::digest)

    fun requestSync() {
        scope.launch { sync() }
    }

    /** Failed fetches leave the previous rows intact. All publishing is serialized. */
    suspend fun sync(): Boolean = syncLock.withLock {
        if (app.session.state.value !is AuthState.SignedIn) return@withLock false
        val version = app.session.version
        val identity = identity() ?: return@withLock false
        val api = app.session.api ?: return@withLock false
        val http = app.session.http
        try {
            val programs = watchNextPrograms(api.home.continueWatching(), api.home.nextUp()) { itemLabel(it, app.resources) }
            // Fetch before granting access. Neither tokens nor server URLs enter the TV provider.
            val artwork = withContext(Dispatchers.IO) {
                programs.mapNotNull { it.artworkId }.distinct().associateWith { id ->
                    val directory = File(artRoot, identity).apply { mkdirs() }
                    val file = File(directory, "${digest(id)}.img")
                    if (!file.exists()) {
                        try {
                            http.newCall(Request.Builder().url(api.paths.artwork(id, ArtworkSize.Large)).build()).execute().use { response ->
                                if (!response.isSuccessful) throw IOException("Artwork HTTP ${response.code}")
                                val temporary = File.createTempFile("art", ".tmp", directory)
                                try {
                                    response.body.byteStream().use { input -> temporary.outputStream().use { input.copyTo(it) } }
                                    if (!temporary.renameTo(file)) throw IOException("Couldn't save launcher artwork")
                                } finally {
                                    temporary.delete()
                                }
                            }
                        } catch (e: IOException) {
                            Log.w(TAG, "Couldn't cache launcher artwork", e)
                        }
                    }
                    file.takeIf { it.exists() }?.let { FileProvider.getUriForFile(app, authority, it) }
                }
            }
            withContext(Dispatchers.IO) {
                rowsLock.withLock {
                    if (version != app.session.version) return@withLock
                    if (prefs.getString("identity", null) != identity) clear(identity)
                    reconcile(programs, artwork, identity, version)
                }
            }
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // A launcher can revoke provider access. Playback must still work.
            Log.w(TAG, "Couldn't sync Watch Next", e)
            false
        }
    }

    private fun clear(identity: String?) {
        // Clear private artwork first, even if a launcher has revoked provider access.
        if (artRoot.exists()) {
            artRoot.walkTopDown().filter { it.isFile && it.extension == "img" }.forEach { file ->
                app.revokeUriPermission(FileProvider.getUriForFile(app, authority, file), Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            artRoot.deleteRecursively()
        }
        resolver.delete(Programs.CONTENT_URI, null, null)
        prefs.edit().clear().putString("identity", identity).commit()
    }

    private data class Row(val id: Long, val browsable: Boolean, val values: Map<String, String?>)

    private fun reconcile(programs: List<WatchNextProgram>, artwork: Map<String, Uri?>, identity: String, version: Long) {
        val rows = mutableMapOf<String, Row>()
        resolver.query(Programs.CONTENT_URI, PROJECTION, null, null, null)?.use { cursor ->
            while (cursor.moveToNext()) {
                val values = cursor.columnNames.associateWith { name -> cursor.getString(cursor.getColumnIndexOrThrow(name)) }
                val itemId = values[Programs.COLUMN_INTERNAL_PROVIDER_ID] ?: continue
                val row = Row(values.getValue(Programs._ID)!!.toLong(), values[Programs.COLUMN_BROWSABLE] != "0", values)
                if (!row.browsable) {
                    val key = "dismissed.$itemId"
                    if (!prefs.contains(key)) prefs.edit().putLong(key, values[Programs.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS]?.toLongOrNull() ?: -1).commit()
                }
                rows[itemId] = row
            }
        }
        val wanted = programs.map { it.itemId }.toSet()
        val published = prefs.all.keys.filter { it.startsWith("published.") }
        for (key in published) {
            val itemId = key.removePrefix("published.")
            if (itemId !in rows && !prefs.contains("dismissed.$itemId")) {
                // Some launchers delete a removed row instead of leaving it hidden.
                prefs.edit().putLong("dismissed.$itemId", prefs.getLong(key, -1)).commit()
            }
        }
        val current = rows.filterKeys { it in wanted }.mapValues { (_, row) ->
            row.values[Programs.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS]?.toLongOrNull() ?: -1
        }.toMutableMap()
        rows.filterKeys { it !in wanted }.values.forEach { resolver.delete(TvContract.buildWatchNextProgramUri(it.id), null, null) }
        for (program in programs) {
            if (version != app.session.version) return
            var row = rows[program.itemId]
            val dismissed = "dismissed.${program.itemId}"
            if (prefs.contains(dismissed)) {
                if (!program.watchedAfter(prefs.getLong(dismissed, -1))) continue
                // Browsable is read-only. A new watch may replace the dismissed row.
                row?.let { resolver.delete(TvContract.buildWatchNextProgramUri(it.id), null, null) }
                row = null
                prefs.edit().remove(dismissed).commit()
            }
            val art = artwork[program.artworkId]
            art?.let(::grantArtwork)
            val values = values(program, art, identity)
            if (row == null) {
                checkNotNull(resolver.insert(Programs.CONTENT_URI, values)) { "Watch Next insert returned no row" }
            } else if (values.keySet().any { key -> values.getAsString(key) != row.values[key] }) {
                resolver.update(TvContract.buildWatchNextProgramUri(row.id), values, null, null)
            }
            current[program.itemId] = program.engagementMillis ?: -1
        }
        prefs.edit().apply {
            published.forEach(::remove)
            current.forEach { (itemId, engagement) -> putLong("published.$itemId", engagement) }
        }.commit()
        val retained = programs.mapNotNull { it.artworkId }.map { "${digest(it)}.img" }.toSet()
        File(artRoot, identity).listFiles()?.filter { it.name !in retained }?.forEach { file ->
            app.revokeUriPermission(FileProvider.getUriForFile(app, authority, file), Intent.FLAG_GRANT_READ_URI_PERMISSION)
            file.delete()
        }
        Log.d(TAG, "Synced ${programs.size} server programs")
    }

    private fun grantArtwork(uri: Uri) {
        val launchers = app.packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)
        for (pkg in launchers.map { it.activityInfo.packageName }.distinct() + "com.android.providers.tv") {
            app.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    private fun values(program: WatchNextProgram, art: Uri?, identity: String) = ContentValues().apply {
        put(Programs.COLUMN_INTERNAL_PROVIDER_ID, program.itemId)
        put(Programs.COLUMN_CONTENT_ID, "$identity/${program.itemId}")
        put(Programs.COLUMN_TYPE, if (program.episode) Programs.TYPE_TV_EPISODE else Programs.TYPE_MOVIE)
        put(Programs.COLUMN_WATCH_NEXT_TYPE, if (program.kind == WatchNextKind.Continue) Programs.WATCH_NEXT_TYPE_CONTINUE else Programs.WATCH_NEXT_TYPE_NEXT)
        put(Programs.COLUMN_TITLE, program.title)
        put(Programs.COLUMN_EPISODE_TITLE, program.episodeTitle)
        put(Programs.COLUMN_SHORT_DESCRIPTION, program.description)
        put(Programs.COLUMN_SEASON_DISPLAY_NUMBER, program.seasonNumber?.toString())
        put(Programs.COLUMN_EPISODE_DISPLAY_NUMBER, program.episodeNumber?.toString())
        put(Programs.COLUMN_DURATION_MILLIS, program.durationMillis)
        put(Programs.COLUMN_LAST_PLAYBACK_POSITION_MILLIS, program.positionMillis)
        put(Programs.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS, program.engagementMillis)
        put(Programs.COLUMN_POSTER_ART_URI, art?.toString())
        put(Programs.COLUMN_POSTER_ART_ASPECT_RATIO, if (program.poster) Programs.ASPECT_RATIO_2_3 else Programs.ASPECT_RATIO_16_9)
        put(Programs.COLUMN_INTENT_URI, WatchNextLink.intent(app, identity, program.itemId).toUri(Intent.URI_INTENT_SCHEME))
    }

    companion object {
        private const val TAG = "WatchNext"
        private val PROJECTION = arrayOf(
            Programs._ID, Programs.COLUMN_BROWSABLE, Programs.COLUMN_INTERNAL_PROVIDER_ID,
            Programs.COLUMN_CONTENT_ID, Programs.COLUMN_TYPE, Programs.COLUMN_WATCH_NEXT_TYPE,
            Programs.COLUMN_TITLE, Programs.COLUMN_EPISODE_TITLE, Programs.COLUMN_SHORT_DESCRIPTION,
            Programs.COLUMN_SEASON_DISPLAY_NUMBER, Programs.COLUMN_EPISODE_DISPLAY_NUMBER,
            Programs.COLUMN_DURATION_MILLIS, Programs.COLUMN_LAST_PLAYBACK_POSITION_MILLIS,
            Programs.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS, Programs.COLUMN_POSTER_ART_URI,
            Programs.COLUMN_POSTER_ART_ASPECT_RATIO, Programs.COLUMN_INTENT_URI,
        )
        private fun digest(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
    }
}

/** FileProvider exposes only the cached images, through individual read grants. */
class WatchNextArtwork : FileProvider()
