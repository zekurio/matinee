package io.github.zekurio.matinee.downloads

import android.content.Context
import androidx.core.content.edit
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MatineeJson
import io.github.zekurio.matinee.api.OfflinePlay
import io.github.zekurio.matinee.api.decodeSaved
import java.io.IOException
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

@Serializable
data class PendingReport(val positionSeconds: Double, val durationSeconds: Double?)

/**
 * What happened while [server] was out of reach, sent once it answers
 * again: where the person got to in each file, the last place per file, so
 * Continue watching and watched marks catch up; and each sitting, for the
 * statistics' watch time. Each saved server has its own, so one server's
 * progress never goes to another.
 */
class PendingProgress(context: Context, private val server: String) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val playsKey = "$KEY_PLAYS:$server"
    private val reportsKey = "$KEY_REPORTS:$server"
    private val serializer = MapSerializer(String.serializer(), PendingReport.serializer())
    private val playsSerializer = MapSerializer(String.serializer(), OfflinePlay.serializer())

    private fun readPlays(): Map<String, OfflinePlay> = runCatching {
        decodeSaved(playsSerializer, prefs.getString(playsKey, null) ?: "{}")
    }.getOrDefault(emptyMap())

    private fun writePlays(plays: Map<String, OfflinePlay>) =
        prefs.edit { putString(playsKey, MatineeJson.encodeToString(playsSerializer, plays)) }

    /** A sitting that didn't reach the server, kept as far as it got, by its session. */
    @Synchronized
    fun putPlay(play: OfflinePlay) = writePlays(readPlays() + (play.sessionId to play))

    /** The server heard the session itself, so its sitting needn't wait. */
    @Synchronized
    fun dropPlay(sessionId: String) {
        val plays = readPlays()
        if (sessionId in plays) writePlays(plays - sessionId)
    }

    private fun read(): Map<String, PendingReport> = runCatching {
        MatineeJson.decodeFromString(serializer, prefs.getString(reportsKey, null) ?: "{}")
    }.getOrDefault(emptyMap())

    @Synchronized
    fun put(itemId: String, report: PendingReport) {
        val next = read() + (itemId to report)
        prefs.edit { putString(reportsKey, MatineeJson.encodeToString(serializer, next)) }
    }

    /** Where the person got to in [itemId] while offline, if that hasn't reached the server yet. */
    @Synchronized
    fun report(itemId: String): PendingReport? = read()[itemId]

    /** A report went through, so what waited for this file is out of date. */
    @Synchronized
    fun drop(itemId: String) {
        val next = read() - itemId
        prefs.edit { putString(reportsKey, MatineeJson.encodeToString(serializer, next)) }
    }

    /** Everything waiting, as the server it was for is removed. */
    @Synchronized
    fun clear() = prefs.edit {
        remove(playsKey)
        remove(reportsKey)
    }

    /** Send what's waiting, the sittings first. What still fails waits for the next time. */
    suspend fun flush(api: MatineeApi) {
        for (batch in readPlays().values.chunked(PLAYS_PER_REQUEST)) {
            try {
                api.playback.offline(batch)
                synchronized(this) { writePlays(readPlays() - batch.map { it.sessionId }.toSet()) }
            } catch (e: ApiException) {
                // Not plays this server takes; they'd fail again.
                if (e.status in 400..499) synchronized(this) { writePlays(readPlays() - batch.map { it.sessionId }.toSet()) } else return
            } catch (_: IOException) {
                return
            }
        }
        for ((itemId, report) in read()) {
            try {
                // Where the person got to, without a playback session.
                api.playback.report(
                    itemId,
                    positionSeconds = report.positionSeconds.coerceAtLeast(0.0),
                    durationSeconds = report.durationSeconds?.takeIf { it > 0 },
                    closed = true,
                )
                drop(itemId)
            } catch (e: ApiException) {
                // The file is gone from the server, or the report doesn't fit it any more.
                if (e.status in 400..499) drop(itemId) else return
            } catch (_: IOException) {
                return
            }
        }
    }

    companion object {
        /** The most `playback.offline` takes at once. */
        private const val PLAYS_PER_REQUEST = 200
        private const val PREFS = "pending_progress"
        private const val KEY_PLAYS = "plays"
        private const val KEY_REPORTS = "reports"

        /**
         * What an app before saved servers kept waiting, under keys of no
         * server, was for [server]. It joins what [server] already has, and
         * the old keys go only once that's written. Returns whether nothing
         * is left to move.
         */
        fun adopt(context: Context, server: String): Boolean {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val edit = prefs.edit()
            for (key in listOf(KEY_PLAYS, KEY_REPORTS)) {
                val old = prefs.getString(key, null) ?: continue
                val target = "$key:$server"
                val merged = when (val current = prefs.getString(target, null)) {
                    null -> old
                    // Unreadable as maps: keep both as they are rather than lose either.
                    else -> mergeMaps(old, current) ?: return false
                }
                edit.putString(target, merged).remove(key)
            }
            return edit.commit()
        }

        /** Two JSON objects as one, [newer]'s entries winning. */
        private fun mergeMaps(older: String, newer: String): String? = runCatching {
            val a = MatineeJson.parseToJsonElement(older).jsonObject
            val b = MatineeJson.parseToJsonElement(newer).jsonObject
            JsonObject(a + b).toString()
        }.getOrNull()
    }
}
