package io.github.zekurio.matinee.ui.profile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import io.github.zekurio.matinee.api.Profile
import io.github.zekurio.matinee.api.WatchStats
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.rememberLoader
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/* What the profile loads and says, apart from its layout, for the phone's profile and the TV's. */

/** "November 2026", the month the person joined, or null when the server didn't say. */
fun joinedMonth(profile: Profile): String? = profile.user.createdAt.let { at ->
    runCatching {
        DateTimeFormatter.ofPattern(android.text.format.DateFormat.getBestDateTimePattern(Locale.getDefault(), "MMMMyyyy"), Locale.getDefault())
            .format(Instant.parse(at).atZone(ZoneId.systemDefault()))
    }.getOrNull()
}

/**
 * The statistics for a range, all time to start. The last range's figures
 * stay up while the next one loads, so the page doesn't jump. [loader] is
 * null offline, where they're only what was saved.
 */
class ProfileStats internal constructor(
    val range: String,
    val onRange: (String) -> Unit,
    val state: Load<WatchStats?>,
    /** The figures shown: the range's, or the last range's while it loads. */
    val stats: WatchStats?,
    val loader: Loader<WatchStats?>?,
) {
    /** With nothing ever watched, picking a period changes nothing. */
    val neverWatched get() = stats != null && range == "all" && stats.totals.plays == 0
}

/** The statistics from the server. With [snapshot], each range's answer is kept for when it can't be reached. */
@Composable
fun rememberProfileStats(username: String, snapshot: ProfileSnapshot? = null): ProfileStats {
    var range by rememberSaveable { mutableStateOf("all") }
    val zone = remember { ZoneId.systemDefault().id }
    val loader = rememberLoader("profile-stats-$username-$range", snapshot?.stats(range)) { profiles.stats(username, range, zone) }
    RefreshOnResume(loader)
    var last by remember { mutableStateOf<WatchStats?>(null) }
    val state = loader.state
    LaunchedEffect(state) { if (state is Load.Ready) last = state.value }
    return ProfileStats(range, { range = it }, state, (state as? Load.Ready)?.value ?: last, loader)
}

/** Offline, each range's statistics as the server last sent them; one never opened online can't show. */
@Composable
fun rememberSavedStats(snapshot: ProfileSnapshot): ProfileStats {
    var range by rememberSaveable { mutableStateOf("all") }
    val saved = remember(snapshot, range) { snapshot.stats(range).read() }
    val state = if (saved != null) Load.Ready(saved) else Load.Failed("", disconnected = true)
    return ProfileStats(range, { range = it }, state, saved, null)
}
