package io.github.zekurio.matinee.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import android.content.res.Resources
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
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
        titleFavorites.send(title.id, favorite) { api.setFavorite(title.id, favorite) }

    suspend fun setFavorite(api: MatineeApi, item: MediaItem, favorite: Boolean) {
        val title = item.title
        if (title?.kind == TitleKind.MOVIE) return setFavorite(api, title, favorite)
        itemFavorites.send(item.id, favorite) { api.setItemFavorite(item.id, favorite) }
    }

    /** [watchedAt] is when, for watched: see [MatineeApi.setWatched]. */
    suspend fun setWatched(api: MatineeApi, item: MediaItem, watched: Boolean, watchedAt: String? = null) {
        val title = item.title
        if (title != null) itemPlaces[item.id] = title.id to item.seasonNumber
        itemWatched.send(item.id, watched) { api.setWatched(item.id, watched, watchedAt.takeIf { watched }) }
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
        val send: suspend () -> Unit = { api.setTitleWatched(title.id, watched, season, watchedAt.takeIf { watched }) }
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

    data class Failed(val message: String) : Load<Nothing>
}

/**
 * What went wrong reaching the server, in words for the person: the
 * server's own message when it sent one, else whether it couldn't be
 * reached or the connection broke off. The exception's own text is the
 * HTTP client's, in English, and names sockets and addresses.
 */
fun describeFailure(resources: Resources, e: IOException): String = when (e) {
    is ApiException -> e.message
    is UnknownHostException, is ConnectException, is SocketTimeoutException, is NoRouteToHostException, is SSLException ->
        resources.getString(R.string.error_unreachable)
    else -> resources.getString(R.string.error_connection_lost)
}

/** What a screen loads from the server, kept while the screen is on the back stack. */
class Loader<T>(private val describe: (IOException) -> String, private val fetch: suspend () -> T) : ViewModel() {
    var state by mutableStateOf<Load<T>>(Load.Loading)
        private set
    private var job: Job? = null
    internal var seenVersion = -1

    init {
        reload()
    }

    /** Show what a save answered with, without fetching it again. */
    fun show(value: T) {
        job?.cancel()
        state = Load.Ready(value)
    }

    /** Fetch again. What showed stays until the answer comes, unless it failed. */
    fun reload() {
        job?.cancel()
        if (state is Load.Failed) state = Load.Loading
        job = viewModelScope.launch {
            state = try {
                Load.Ready(fetch())
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                if (state is Load.Ready) state else Load.Failed(describe(e))
            } catch (e: SerializationException) {
                Load.Failed(e.message ?: "The server sent something this app can't read.")
            }
        }
    }
}

/**
 * Load [fetch] for this screen. [key] names what it loads, so two loads on
 * one screen stay apart. Fetches again when the viewer's marks change.
 */
@Composable
fun <T> rememberLoader(key: String, fetch: suspend MatineeApi.() -> T): Loader<T> {
    val context = LocalContext.current
    val app = context.app
    val loader: Loader<T> = viewModel(key = key) {
        val api = app.session.requireApi()
        Loader({ describeFailure(app.resources, it) }) { api.fetch() }
    }
    val version = app.viewer.version
    LaunchedEffect(loader, version) {
        if (loader.seenVersion != -1 && loader.seenVersion != version) loader.reload()
        loader.seenVersion = version
    }
    return loader
}
