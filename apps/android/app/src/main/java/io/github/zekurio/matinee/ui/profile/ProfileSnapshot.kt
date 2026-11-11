package io.github.zekurio.matinee.ui.profile

import android.content.Context
import androidx.core.content.edit
import io.github.zekurio.matinee.api.MatineeJson
import io.github.zekurio.matinee.api.Profile
import io.github.zekurio.matinee.api.WatchStats
import io.github.zekurio.matinee.api.decodeSaved
import io.github.zekurio.matinee.ui.Kept
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.nullable

/**
 * The profile and its statistics as the server last sent them, kept
 * across restarts, as Home keeps its rows: the profile shows them while
 * the server can't be reached, and in offline mode. One account's are
 * kept apart from another's by [username].
 */
class ProfileSnapshot(context: Context, private val username: String) {
    private val prefs = context.getSharedPreferences("profile_snapshot", Context.MODE_PRIVATE)

    val profile: Kept<Profile> = Entry("profile", Profile.serializer())

    /** The statistics for one range, like `all` or `month`. */
    fun stats(range: String): Kept<WatchStats?> = Entry("stats-$range", WatchStats.serializer().nullable)

    /** Saved as JSON under [name]; a save an older app wrote reads with what it lacks filled in. */
    private inner class Entry<T>(name: String, private val serializer: KSerializer<T>) : Kept<T> {
        private val key = "$username/$name"

        override fun read(): T? = prefs.getString(key, null)?.let { runCatching { decodeSaved(serializer, it) }.getOrNull() }

        override fun write(value: T) = prefs.edit { putString(key, MatineeJson.encodeToString(serializer, value)) }
    }
}
