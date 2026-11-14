package io.github.zekurio.matinee.ui.requests

import android.content.res.Resources
import android.util.Log
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.AdminRequestItem
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.Availability
import io.github.zekurio.matinee.api.CatalogInput
import io.github.zekurio.matinee.api.CatalogRef
import io.github.zekurio.matinee.api.CatalogSeason
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.RequestId
import io.github.zekurio.matinee.api.RequestQueue
import io.github.zekurio.matinee.api.RequestsLiveEvent
import io.github.zekurio.matinee.api.SeasonAvailability
import io.github.zekurio.matinee.api.ShowScope
import io.github.zekurio.matinee.ui.components.LocalApi
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerializationException

/*
 * What the phone's request screens share while signed in: the last word
 * the server streamed about each title on screen, asking and taking an
 * ask back with the snackbar's Undo, and for an admin, the live queue.
 *
 * How the screens stay current: each one follows its titles through
 * `requests.live`, the server-sent events the web follows too, while it's
 * on screen, and lets go when another covers it or the app goes away. A
 * stream starts with the current state, so reconnecting loses nothing.
 * What one screen hears, every screen shows, since a title's state is the
 * same wherever it sits. An admin's queue streams once for the whole app,
 * for the dot on the profile tab, the queue, and the strip on a title.
 */

/** A title's live answer: the title and each of its seasons. */
data class LiveEntry(val availability: Availability, val seasons: List<SeasonAvailability>)

/** How long the snackbar offers Undo. The server holds an ask that needs no approval for ten seconds. */
private const val UNDO_MS = 6_000L

/** Titles one stream follows at most, as the contract takes. */
private const val MOST_FOLLOWED = 100

class RequestsHub(
    private val api: MatineeApi,
    private val scope: CoroutineScope,
    private val snackbar: SnackbarHostState,
    private val notices: RequestNotices,
) {
    /** Kept current by the composition, for the words in snackbars. */
    var resources: Resources? = null

    /** The last word on each title, by [CatalogRef.key]: from a stream, or from an answer to an ask. */
    val live = mutableStateMapOf<String, LiveEntry>()

    /** Moves on each ask, cancel, and follow, so lists and pages that hold asks fetch again. */
    var version by mutableIntStateOf(0)
        private set

    /** Titles with an ask on its way to the server. */
    val busy = mutableStateMapOf<String, Boolean>()

    /** The admin's queue as the server streams it; null for everyone else and until it answers. */
    var queue by mutableStateOf<RequestQueue?>(null)
        internal set

    /** Requests an admin answered that wait out the Undo before the answer goes. */
    val held = mutableStateMapOf<String, Boolean>()

    /** The [version] each loader last fetched for, so one on a covered screen catches up when it shows again. */
    internal val seen = java.util.WeakHashMap<io.github.zekurio.matinee.ui.Loader<*>, Int>()

    /** Set after an ask, for the notification permission to be asked for then. */
    var wantsPermission by mutableStateOf(false)

    /** How many requests wait for the admin or need them, less the ones held for Undo. */
    val needsYou: Int
        get() = queue?.let { queue -> queue.waiting.count { it.id !in held } + queue.needsAttention.size } ?: 0

    fun availability(ref: CatalogRef, loaded: Availability): Availability = live[ref.key]?.availability ?: loaded

    fun season(ref: CatalogRef, season: CatalogSeason): CatalogSeason =
        live[ref.key]?.seasons?.firstOrNull { it.number == season.number }?.let { season.copy(availability = it) } ?: season

    fun seasons(ref: CatalogRef, seasons: List<CatalogSeason>): List<CatalogSeason> = seasons.map { season(ref, it) }

    internal fun take(entries: List<RequestsLiveEvent>) {
        for (entry in entries) live[entry.ref.key] = LiveEntry(entry.availability, entry.seasons)
    }

    /** What the server answered for a title, shown everywhere at once, ahead of the stream. */
    fun apply(ref: CatalogRef, availability: Availability) {
        live[ref.key] = LiveEntry(availability, live[ref.key]?.seasons.orEmpty())
    }

    /** Something about asks changed that the server knows of: lists and pages fetch again. */
    fun bump() {
        version++
    }

    private fun text(id: Int, vararg args: Any): String = resources?.getString(id, *args).orEmpty()

    private suspend fun fail(message: Int, name: String?, cause: Exception) {
        val head = if (name != null) text(message, name) else text(message)
        val detail = (cause as? ApiException)?.message
        snackbar.showSnackbar(if (detail != null) "$head\n$detail" else head, withDismissAction = true)
    }

    /**
     * Asks for a title: the whole film, or a show's seasons in [showScope],
     * the server's default when it's null. Everything showing the title
     * changes at once, and the snackbar offers Undo while the ask can be
     * taken back, but only with [undo]: not for more seasons of a show the
     * viewer already asked for, where it would take those back too.
     */
    fun ask(
        ref: CatalogRef,
        name: String,
        libraryId: String? = null,
        showScope: ShowScope? = null,
        undo: Boolean = true,
        onDone: () -> Unit = {},
    ) {
        if (busy[ref.key] == true) return
        busy[ref.key] = true
        scope.launch {
            try {
                val item = api.requests.ask(ref, libraryId, showScope)
                apply(item.title.ref, item.availability)
                bump()
                onDone()
                if (!notices.askedPermission) wantsPermission = true
                val canUndo = undo && (item.availability.action == AvailabilityAction.CANCEL || item.season?.action == AvailabilityAction.CANCEL)
                busy.remove(ref.key)
                val message = text(R.string.web_ask_toast_asked, name)
                val result = withTimeoutOrNull(UNDO_MS) {
                    snackbar.showSnackbar(
                        message,
                        actionLabel = if (canUndo) text(R.string.web_ask_toast_undo) else null,
                        duration = SnackbarDuration.Indefinite,
                    )
                }
                if (result == SnackbarResult.ActionPerformed) cancel(item.id, name)
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                fail(R.string.web_ask_toast_failed, name, e)
            } catch (e: SerializationException) {
                Log.w(TAG, "The ask's answer didn't parse", e)
                fail(R.string.web_ask_toast_failed, name, e)
            } finally {
                busy.remove(ref.key)
            }
        }
    }

    /** Takes an ask back, from Undo or the state's sheet. */
    fun cancel(id: String, name: String, onDone: () -> Unit = {}) {
        scope.launch {
            try {
                api.requests.cancel(RequestId(id))
                bump()
                onDone()
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                fail(R.string.web_ask_toast_cancelFailed, name, e)
            }
        }
    }

    /** "Notify me" on a title someone else asked for, and taking it back. */
    fun follow(id: String, on: Boolean, name: String, onDone: () -> Unit = {}) {
        scope.launch {
            try {
                if (on) api.requests.follow(RequestId(id)) else api.requests.unfollow(RequestId(id))
                bump()
                onDone()
                // The button says the new state; a snackbar would only repeat it.
                if (on && !notices.askedPermission) wantsPermission = true
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                fail(R.string.web_ask_toast_followFailed, null, e)
            }
        }
    }

    /**
     * An admin's answer to one request: Add or Decline a waiting one, Give
     * up on an accepted one, or Allow requests again or Add after all for
     * a declined one. The request leaves the lists at once, and the answer
     * goes once the snackbar's Undo has passed, as the web's queue holds it.
     */
    fun answer(item: AdminRequestItem, answer: QueueAnswer) {
        held[item.id] = true
        scope.launch {
            val message = text(
                when (answer) {
                    QueueAnswer.Add -> R.string.web_requests_toast_added
                    is QueueAnswer.Decline -> R.string.web_requests_toast_declined
                    is QueueAnswer.GiveUp -> R.string.web_requests_toast_gaveUp
                    QueueAnswer.AllowAgain -> R.string.web_requests_toast_allowedAgain
                    QueueAnswer.AddAfterAll -> R.string.web_requests_toast_addedAfterAll
                },
                item.title.name,
            )
            val result = withTimeoutOrNull(UNDO_MS) {
                snackbar.showSnackbar(message, actionLabel = text(R.string.web_requests_toast_undo), duration = SnackbarDuration.Indefinite)
            }
            if (result == SnackbarResult.ActionPerformed) {
                held.remove(item.id)
                return@launch
            }
            try {
                when (answer) {
                    QueueAnswer.Add -> api.admin.requests.approve(item.id)
                    is QueueAnswer.Decline -> api.admin.requests.decline(item.id, answer.reason, answer.note)
                    is QueueAnswer.GiveUp -> api.admin.requests.giveUp(item.id, answer.note)
                    QueueAnswer.AllowAgain -> api.admin.requests.allowAgain(RequestId(item.id))
                    QueueAnswer.AddAfterAll -> api.admin.requests.addAfterAll(RequestId(item.id))
                }
                bump()
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                when (answer) {
                    QueueAnswer.Add -> fail(R.string.web_requests_toast_addFailed, null, e)
                    is QueueAnswer.Decline -> fail(R.string.web_requests_toast_declineFailed, item.title.name, e)
                    is QueueAnswer.GiveUp -> fail(R.string.web_requests_toast_giveUpFailed, item.title.name, e)
                    QueueAnswer.AllowAgain -> fail(R.string.web_requests_toast_allowAgainFailed, item.title.name, e)
                    QueueAnswer.AddAfterAll -> fail(R.string.web_requests_toast_addAfterAllFailed, item.title.name, e)
                }
            } finally {
                // The stream has the answer by now, or the row comes back after a failure.
                delay(1_000)
                held.remove(item.id)
            }
        }
    }

    /** Add for every request that waits, held for Undo as one. */
    fun answerAll(items: List<AdminRequestItem>) {
        if (items.isEmpty()) return
        items.forEach { held[it.id] = true }
        scope.launch {
            val message = resources?.getQuantityString(R.plurals.web_requests_toast_addedMany, items.size, items.size).orEmpty()
            val result = withTimeoutOrNull(UNDO_MS) {
                snackbar.showSnackbar(message, actionLabel = text(R.string.web_requests_toast_undo), duration = SnackbarDuration.Indefinite)
            }
            try {
                if (result != SnackbarResult.ActionPerformed) {
                    api.admin.requests.approveAll(items.map { it.id })
                    bump()
                    delay(1_000)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                fail(R.string.web_requests_toast_addFailed, null, e)
            } finally {
                items.forEach { held.remove(it.id) }
            }
        }
    }

    /** Sends a request that needs attention again. */
    fun retry(item: AdminRequestItem) {
        scope.launch {
            try {
                api.admin.requests.retry(RequestId(item.id))
                snackbar.showSnackbar(text(R.string.web_requests_retried, item.title.name))
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                fail(R.string.web_requests_retryFailed, item.title.name, e)
            }
        }
    }

    private companion object {
        const val TAG = "Requests"
    }
}

/** What an admin answers a request with, from the queue or a title's strip. */
sealed interface QueueAnswer {
    /** Accept a waiting request. */
    data object Add : QueueAnswer

    /** Decline a waiting request, with the reason's code and a note. */
    data class Decline(val reason: String, val note: String?) : QueueAnswer

    /** Give up on an accepted request: declined with "Can't find a copy". */
    data class GiveUp(val note: String?) : QueueAnswer

    /** Remove a declined request, so anyone may request the title afresh. */
    data object AllowAgain : QueueAnswer

    /** Accept a declined request as it stands, and send it. */
    data object AddAfterAll : QueueAnswer
}

val LocalRequests = staticCompositionLocalOf<RequestsHub> { error("no requests") }

/**
 * Follows a stream while the screen it's on shows, and again after it
 * ends or breaks, waiting longer each time it fails in a row.
 */
@Composable
internal fun <T> FollowStream(key: Any?, enabled: Boolean = true, open: () -> Flow<T>, onEach: (T) -> Unit) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(key, enabled, lifecycle) {
        if (!enabled) return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            var wait = 1_000L
            while (true) {
                try {
                    // The server ends a stream after a while, to check the session again.
                    open().collect {
                        onEach(it)
                        wait = 1_000L
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (_: IOException) {
                    wait = minOf(wait * 2, 30_000L)
                } catch (e: SerializationException) {
                    Log.w("Requests", "A stream's event didn't parse", e)
                    wait = minOf(wait * 2, 30_000L)
                }
                delay(wait)
            }
        }
    }
}

/** Follows what the server says of [titles] while the screen shows, into [LocalRequests]. */
@Composable
fun FollowTitles(titles: List<CatalogInput>) {
    val api = LocalApi.current
    val hub = LocalRequests.current
    val inputs = titles.distinctBy { it.ref.key }.take(MOST_FOLLOWED)
    FollowStream(inputs, enabled = inputs.isNotEmpty(), open = { api.requests.live(inputs) }, onEach = hub::take)
}
