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
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import java.io.IOException
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
    private val titleFavorites = mutableStateMapOf<String, Boolean>()
    private val itemFavorites = mutableStateMapOf<String, Boolean>()
    private val itemWatched = mutableStateMapOf<String, Boolean>()
    private val titleWatched = mutableStateMapOf<String, Boolean>()

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
        mark(titleFavorites, title.id, favorite) { api.setFavorite(title.id, favorite) }

    suspend fun setFavorite(api: MatineeApi, item: MediaItem, favorite: Boolean) {
        val title = item.title
        if (title?.kind == TitleKind.MOVIE) return setFavorite(api, title, favorite)
        mark(itemFavorites, item.id, favorite) { api.setItemFavorite(item.id, favorite) }
    }

    suspend fun setWatched(api: MatineeApi, item: MediaItem, watched: Boolean) {
        mark(itemWatched, item.id, watched) { api.setWatched(item.id, watched) }
        val title = item.title
        if (title?.kind == TitleKind.MOVIE) titleWatched[title.id] = watched
        changed()
    }

    /** Every file of a title, or of one of its seasons. */
    suspend fun setWatched(api: MatineeApi, title: TitleSummary, watched: Boolean, season: Int? = null) {
        if (season == null) titleWatched[title.id] = watched
        api.setTitleWatched(title.id, watched, season)
        changed()
    }

    private suspend fun mark(
        marks: MutableMap<String, Boolean>,
        id: String,
        value: Boolean,
        send: suspend () -> Unit,
    ) {
        val before = marks[id]
        marks[id] = value
        try {
            send()
        } catch (e: IOException) {
            if (before == null) marks.remove(id) else marks[id] = before
            throw e
        }
    }
}

sealed interface Load<out T> {
    data object Loading : Load<Nothing>

    data class Ready<T>(val value: T) : Load<T>

    data class Failed(val message: String) : Load<Nothing>
}

/** What a screen loads from the server, kept while the screen is on the back stack. */
class Loader<T>(private val fetch: suspend () -> T) : ViewModel() {
    var state by mutableStateOf<Load<T>>(Load.Loading)
        private set
    private var job: Job? = null
    internal var seenVersion = -1

    init {
        reload()
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
                if (state is Load.Ready) state else Load.Failed(e.message ?: e.javaClass.simpleName)
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
        Loader { api.fetch() }
    }
    val version = app.viewer.version
    LaunchedEffect(loader, version) {
        if (loader.seenVersion != -1 && loader.seenVersion != version) loader.reload()
        loader.seenVersion = version
    }
    return loader
}
