package io.github.zekurio.matinee.downloads

import android.content.Context
import androidx.core.content.edit
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MatineeJson
import java.io.IOException
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer

@Serializable
data class PendingReport(val positionSeconds: Double, val durationSeconds: Double?)

/**
 * Where the person got to in files they watched while the server was out of
 * reach, the last place per file, sent once it answers again so Continue
 * watching and watched marks catch up.
 */
class PendingProgress(context: Context) {
    private val prefs = context.getSharedPreferences("pending_progress", Context.MODE_PRIVATE)
    private val serializer = MapSerializer(String.serializer(), PendingReport.serializer())

    private fun read(): Map<String, PendingReport> = runCatching {
        MatineeJson.decodeFromString(serializer, prefs.getString("reports", null) ?: "{}")
    }.getOrDefault(emptyMap())

    @Synchronized
    fun put(itemId: String, report: PendingReport) {
        val next = read() + (itemId to report)
        prefs.edit { putString("reports", MatineeJson.encodeToString(serializer, next)) }
    }

    /** A report went through, so what waited for this file is out of date. */
    @Synchronized
    fun drop(itemId: String) {
        val next = read() - itemId
        prefs.edit { putString("reports", MatineeJson.encodeToString(serializer, next)) }
    }

    /** Send what's waiting. What still fails waits for the next time. */
    suspend fun flush(api: MatineeApi) {
        for ((itemId, report) in read()) {
            try {
                api.syncProgress(itemId, report.positionSeconds, report.durationSeconds)
                drop(itemId)
            } catch (e: ApiException) {
                // The file is gone from the server, or the report doesn't fit it any more.
                if (e.status in 400..499) drop(itemId) else return
            } catch (_: IOException) {
                return
            }
        }
    }
}
