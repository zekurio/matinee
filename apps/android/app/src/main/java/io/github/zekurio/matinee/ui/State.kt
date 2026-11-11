package io.github.zekurio.matinee.ui

import android.content.res.Resources
import android.os.SystemClock
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.Explicit
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

/**
 * Watched and favorite marks the person changed in this run of the app, over
 * what the server sent with each screen, so a mark made on one screen shows
 * on every other at once. [version] moves when something changed that the
 * marks can't say, like a whole show marked watched or a video played, and
 * screens fetch again then.
 */
class ViewerState {
    private val titleFavorites = Marks(mutableStateMapOf(), ::changed)
    private val itemFavorites = Marks(mutableStateMapOf(), ::changed)
    private val itemWatched = Marks(mutableStateMapOf(), ::changed)
    private val titleWatched = Marks(mutableStateMapOf(), ::changed)

    /** The title and season of each file marked here, for a mark over a whole title or season. */
    private val itemPlaces = HashMap<String, Pair<String, Int?>>()

    var version by mutableIntStateOf(0)
        private set

    /**
     * The account's `playback.options` as the server last sent them in this
     * sign-in: what it may stream, and whether it may download. Null until
     * it answered.
     */
    var options by mutableStateOf<PlaybackOptions?>(null)

    /** The account may download. False until the server said so, so nothing offers a download it would refuse. */
    val mayDownload: Boolean get() = options?.downloads == true

    fun changed() {
        version++
    }

    fun isFavorite(title: TitleSummary) = titleFavorites[title.id] ?: title.favorite

    /** A movie is a favorite through its title, an episode by itself. */
    fun isFavorite(item: MediaItem): Boolean {
        val title = item.title
        return if (title?.kind == TitleKind.MOVIE) isFavorite(title) else itemFavorites[item.id] ?: item.favorite
    }

    fun isWatched(title: TitleSummary) = titleWatched[title.id] ?: title.watched

    fun isWatched(item: MediaItem) = itemWatched[item.id] ?: item.progress?.completed ?: false

    suspend fun setFavorite(api: MatineeApi, title: TitleSummary, favorite: Boolean) =
        titleFavorites.send(title.id, favorite) { api.favorites.set(title.id, favorite) }

    suspend fun setFavorite(api: MatineeApi, item: MediaItem, favorite: Boolean) {
        val title = item.title
        if (title?.kind == TitleKind.MOVIE) return setFavorite(api, title, favorite)
        itemFavorites.send(item.id, favorite) { api.favorites.setItem(item.id, favorite) }
    }

    /** [watchedAt] is when, for watched, as the contract's `WatchedAt`: [WatchedAt.RELEASED], [WatchedAt.UNKNOWN], or an ISO time; null is now. */
    suspend fun setWatched(api: MatineeApi, item: MediaItem, watched: Boolean, watchedAt: String? = null) {
        val title = item.title
        if (title != null) itemPlaces[item.id] = title.id to item.seasonNumber
        itemWatched.send(item.id, watched) { api.playback.setWatched(item.id, watched, watchedAt.takeIf { watched }) }
        when {
            title == null -> Unit
            // A movie is watched with its one file.
            title.kind == TitleKind.MOVIE -> titleWatched.confirm(title.id, watched)
            // Whether the whole show is watched now is the server's to say.
            else -> titleWatched.forget(title.id)
        }
        changed()
    }

    /**
     * Every file of a title, or of one of its seasons. Only the whole title
     * shows as marked before the server answers; a season's files show once
     * it did.
     */
    suspend fun setWatched(api: MatineeApi, title: TitleSummary, watched: Boolean, season: Int? = null, watchedAt: String? = null) {
        val send: suspend () -> Unit = { api.playback.setTitleWatched(title.id, watched, season = season?.let { Explicit(it) }, watchedAt = watchedAt.takeIf { watched }) }
        if (season == null) titleWatched.send(title.id, watched, send) else send()
        if (season != null) titleWatched.forget(title.id)
        // The files marked one by one before now are this answer too.
        for ((itemId, place) in itemPlaces) {
            if (place.first == title.id && (season == null || place.second == season)) itemWatched.confirm(itemId, watched)
        }
        changed()
    }
}

/**
 * Values shown ahead of the server's answer, by id. A request that fails or
 * is cancelled puts back what the server last answered here, or the
 * screen's own value, but only while it's still the newest request for
 * that id, so answers that come back out of order don't undo a later tap.
 * [reconcile] runs when the outcome is unsure: cancelled, or overtaken by a
 * newer request, so screens fetch the truth again.
 */
internal class Marks(
    private val values: MutableMap<String, Boolean>,
    private val reconcile: () -> Unit,
) {
    private val confirmed = HashMap<String, Boolean>()
    private val newest = HashMap<String, Long>()
    private var tickets = 0L

    operator fun get(id: String): Boolean? = values[id]

    suspend fun send(id: String, value: Boolean, request: suspend () -> Unit) {
        val ticket = take(id)
        values[id] = value
        try {
            request()
        } catch (e: Throwable) {
            val current = newest[id] == ticket
            if (current) restore(id)
            if (!current || e is CancellationException) reconcile()
            throw e
        }
        if (newest[id] == ticket) confirmed[id] = value else reconcile()
    }

    /** The server holds [value] for [id] now, by an answer to another request. */
    fun confirm(id: String, value: Boolean) {
        take(id)
        values[id] = value
        confirmed[id] = value
    }

    /** Show the screen's own value for [id] again; requests still out for it no longer change it. */
    fun forget(id: String) {
        take(id)
        values.remove(id)
        confirmed.remove(id)
    }

    private fun take(id: String): Long = (++tickets).also { newest[id] = it }

    private fun restore(id: String) {
        val known = confirmed[id]
        if (known == null) values.remove(id) else values[id] = known
    }
}

sealed interface Load<out T> {
    data object Loading : Load<Nothing>

    data class Ready<T>(val value: T) : Load<T>

    /** [disconnected]: the server couldn't be reached, or the connection broke off, rather than it answering with an error. */
    data class Failed(val message: String, val disconnected: Boolean = false) : Load<Nothing>
}

/**
 * What went wrong reaching the server, in words for the person: the
 * server's own message when it sent one, else whether it couldn't be
 * reached, the connection broke off, or the answer made no sense to this
 * app. The exception's own text is the HTTP client's or the JSON
 * parser's, in English, and names sockets, addresses, and offsets.
 */
fun describeFailure(resources: Resources, e: Exception): String = when (e) {
    is ApiException -> e.message
    is UnknownHostException, is ConnectException, is SocketTimeoutException, is NoRouteToHostException, is SSLException ->
        resources.getString(R.string.error_unreachable)
    is SerializationException -> resources.getString(R.string.error_unreadable)
    else -> resources.getString(R.string.error_connection_lost)
}

/** Whether [e] means the server couldn't be reached or the connection broke off, not that it answered with an error. */
fun isDisconnect(e: Exception): Boolean = e is IOException && e !is ApiException

/** Fetch again on return after this long, when nothing asked for it sooner. */
const val REFRESH_AFTER_MS = 30_000L

/** Where a load stands after an answer or a failure. */
internal data class Settled<out T>(val state: Load<T>, val refreshError: String?, val refreshDisconnected: Boolean = false)

/**
 * A fetch that failed with [message], over what showed before it: an
 * earlier answer stays on screen, marked stale, so a refresh that fails
 * doesn't blank what the person saw. With nothing on screen yet and the
 * server out of reach, the answer [kept] from an earlier run shows the
 * same way.
 */
internal fun <T> Load<T>.failedWith(message: String, disconnected: Boolean = false, kept: (() -> T?)? = null): Settled<T> {
    if (this is Load.Ready) return Settled(this, message, disconnected)
    val saved = if (disconnected) kept?.invoke() else null
    return if (saved != null) Settled(Load.Ready(saved), message, true) else Settled(Load.Failed(message, disconnected), null)
}

/** A load's last answer, kept on the phone for when the server can't be reached. */
interface Kept<T> {
    /** The answer saved last, or null with none. */
    fun read(): T?

    fun write(value: T)
}

/**
 * What a screen loads from the server, kept while the screen is on the
 * back stack. [state] is Ready from the first answer on; a fetch after
 * that which fails leaves it and sets [refreshError] instead.
 */
class Loader<T>(
    private val describe: (Exception) -> String,
    private val kept: Kept<T>? = null,
    private val fetch: suspend () -> T,
) : ViewModel() {
    var state by mutableStateOf<Load<T>>(Load.Loading)
        private set

    /** Why the newest fetch failed while [state] still shows an earlier answer; null once one comes. */
    var refreshError by mutableStateOf<String?>(null)
        private set

    /** [refreshError] came from not reaching the server, rather than from its answer. */
    var refreshDisconnected by mutableStateOf(false)
        private set

    /** A fetch is out. */
    var refreshing by mutableStateOf(false)
        private set

    private var job: Job? = null
    private var generation = 0
    private var settledAt = 0L
    internal var seenVersion = -1

    init {
        reload()
    }

    /** Show what a save answered with, without fetching it again. */
    fun show(value: T) {
        job?.cancel()
        generation++
        settle(Settled(Load.Ready(value), null))
    }

    /** Fetch again. What showed stays until the answer comes, unless it failed. */
    fun reload() {
        job?.cancel()
        val mine = ++generation
        if (state is Load.Failed) state = Load.Loading
        refreshing = true
        job = viewModelScope.launch {
            // A newer fetch or a save took over while this one was out.
            fun current() = mine == generation
            try {
                val value = fetch()
                if (current()) {
                    settle(Settled(Load.Ready(value), null))
                    kept?.write(value)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                if (current()) settle(state.failedWith(describe(e), isDisconnect(e), kept?.let { it::read }))
            } catch (e: SerializationException) {
                Log.w(TAG, "The server's answer didn't parse", e)
                if (current()) settle(state.failedWith(describe(e)))
            }
        }
    }

    private fun settle(next: Settled<T>) {
        state = next.state
        refreshError = next.refreshError
        refreshDisconnected = next.refreshDisconnected
        refreshing = false
        settledAt = SystemClock.elapsedRealtime()
    }

    /** Fetch again if none is out and the last ended at least [maxAgeMs] ago. */
    fun refreshIfStale(maxAgeMs: Long = REFRESH_AFTER_MS) {
        if (!refreshing && SystemClock.elapsedRealtime() - settledAt >= maxAgeMs) reload()
    }

    private companion object {
        const val TAG = "Loader"
    }
}

/**
 * Load [fetch] for this screen. [key] names what it loads, so two loads on
 * one screen stay apart. Fetches again when the viewer's marks change.
 * With [kept], each answer is saved, and the saved one shows while the
 * server can't be reached.
 */
@Composable
fun <T> rememberLoader(key: String, kept: Kept<T>? = null, fetch: suspend MatineeApi.() -> T): Loader<T> {
    val context = LocalContext.current
    val app = context.app
    val loader: Loader<T> = viewModel(key = key) {
        val api = app.session.requireApi()
        Loader({ describeFailure(app.resources, it) }, kept) { api.fetch() }
    }
    val version = app.viewer.version
    LaunchedEffect(loader, version) {
        if (loader.seenVersion != -1 && loader.seenVersion != version) loader.reload()
        loader.seenVersion = version
    }
    return loader
}

/**
 * Refresh [loaders] each time the screen resumes: back from a screen on
 * top of it, from the player, or from another app. Its first showing
 * counts too, so a loader kept on the back stack catches up when its
 * screen comes back. One fetching already, or that answered under
 * [maxAgeMs] ago, is left alone; what shows stays while it fetches.
 */
@Composable
fun RefreshOnResume(vararg loaders: Loader<*>, maxAgeMs: Long = REFRESH_AFTER_MS) {
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        loaders.forEach { it.refreshIfStale(maxAgeMs) }
    }
}
