package io.github.zekurio.matinee.launcher

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.lifecycle.lifecycleScope
import io.github.zekurio.matinee.MainActivity
import io.github.zekurio.matinee.PlayerActivity
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.AuthState
import java.io.IOException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** MainActivity remains below the player, so Back always has a page to return to. */
class WatchNextLink(private val activity: MainActivity) {
    private var opening: Job? = null

    fun open(intent: Intent?): Boolean {
        val uri = intent?.data ?: return false
        if (uri.scheme != "matinee" || uri.host != "watch-next") return false
        val publisher = activity.app.watchNext ?: return true
        opening?.cancel()
        val parts = uri.pathSegments
        if (parts.size != 2 || !parts[0].matches(Regex("[0-9a-f]{64}")) || !parts[1].matches(Regex("[A-Za-z0-9-]{1,128}"))) return true
        opening = activity.lifecycleScope.launch {
            val session = activity.app.session
            val state = withTimeoutOrNull(30_000) { session.state.first { it !is AuthState.Connecting } }
            if (state !is AuthState.SignedIn || parts[0] != publisher.identity()) return@launch
            val version = session.version
            try {
                // A file can disappear between publication and the launcher opening it.
                session.requireApi().media.get(parts[1])
                if (version == session.version) PlayerActivity.start(activity, parts[1], null)
            } catch (e: IOException) {
                Log.w("WatchNext", "Couldn't open launcher item", e)
                publisher.requestSync()
            }
        }
        return true
    }

    companion object {
        fun intent(context: Context, identity: String, itemId: String): Intent =
            Intent(Intent.ACTION_VIEW, Uri.Builder().scheme("matinee").authority("watch-next").appendPath(identity).appendPath(itemId).build(), context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
}
