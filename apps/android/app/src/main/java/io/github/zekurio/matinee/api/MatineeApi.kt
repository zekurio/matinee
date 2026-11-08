package io.github.zekurio.matinee.api

import java.io.IOException
import java.net.URLEncoder
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.serializer
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/** A request the server answered with an error, with its message to show. */
class ApiException(val status: Int, val code: String?, override val message: String) : IOException(message)

/** How the app reads the server's JSON: newer servers may add fields. */
val MatineeJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
}

/**
 * The REST API under /api/v1, the contract's procedures with the methods and
 * paths from packages/contracts. [client] adds the session token.
 */
class MatineeApi(val base: HttpUrl, private val client: OkHttpClient) {
    val paths = Paths(base)
    private val json = MatineeJson
    private val jsonType = "application/json".toMediaType()

    /** [path] is made of `/`-separated segments; put values that may hold a `/` through [seg]. */
    private fun url(path: String, query: Map<String, Any?> = emptyMap()): HttpUrl =
        base.newBuilder().apply {
            addPathSegments("api/v1")
            path.trim('/').split('/').forEach { addEncodedPathSegment(it) }
            for ((key, value) in query) if (value != null) addQueryParameter(key, value.toString())
        }.build()

    private fun seg(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    private suspend fun <T> send(request: Request, serializer: KSerializer<T>?): T? =
        withContext(Dispatchers.IO) {
            client.newCall(request).await().use {
                val body = it.body.string()
                if (!it.isSuccessful) throw errorOf(it, body)
                if (serializer == null || body.isEmpty()) null else json.decodeFromString(serializer, body)
            }
        }

    private fun errorOf(response: Response, body: String): ApiException {
        val parsed = runCatching { json.decodeFromString(ApiErrorBody.serializer(), body) }.getOrNull()
        return ApiException(
            status = response.code,
            code = parsed?.code,
            message = parsed?.message ?: "The server answered ${response.code}.",
        )
    }

    private suspend inline fun <reified T> get(path: String, query: Map<String, Any?> = emptyMap()): T =
        send(Request.Builder().url(url(path, query)).get().build(), serializer<T>()) as T

    private suspend inline fun <reified T> post(path: String, body: RequestBody = EMPTY): T =
        send(Request.Builder().url(url(path)).post(body).build(), serializer<T>()) as T

    private suspend fun call(method: String, path: String, body: RequestBody? = EMPTY) {
        send<Unit>(Request.Builder().url(url(path)).method(method, body).build(), null)
    }

    private inline fun <reified T> body(value: T): RequestBody =
        json.encodeToString(serializer<T>(), value).toRequestBody(jsonType)

    // Auth

    suspend fun authConfig(): AuthConfig = get("auth/config")
    suspend fun session(): User? = get<SessionUser>("auth/session").user
    suspend fun signOut() = call("POST", "auth/sign-out")

    suspend fun appToken(code: String, verifier: String): AppSession =
        post("auth/app/token", body(AppTokenBody(code, verifier)))

    suspend fun deviceStart(name: String?): DeviceCode =
        post("auth/device", body(AppDeviceBody(name, "android")))

    suspend fun devicePoll(deviceCode: String): DeviceSignIn =
        post("auth/device/token", body(DeviceCodeBody(deviceCode)))

    // Account

    suspend fun sessions(): List<AccountSession> = get("account/sessions")
    suspend fun revokeSession(id: String) = call("DELETE", "account/sessions/$id", null)

    suspend fun setPlaybackPreferences(preferences: PlaybackPreferences): User = send(
        Request.Builder().url(url("account/playback")).put(body(preferences)).build(),
        User.serializer(),
    )!!

    // Libraries and titles

    suspend fun libraries(): List<Library> = get("libraries")

    suspend fun titles(
        libraryId: String,
        sort: String = TitleSort.NAME,
        query: String? = null,
        genre: String? = null,
        limit: Int = 60,
        offset: Int = 0,
    ): TitleList = get(
        "libraries/$libraryId/titles",
        mapOf("sort" to sort, "query" to query, "genre" to genre, "limit" to limit, "offset" to offset),
    )

    suspend fun browse(
        genre: String? = null,
        studio: String? = null,
        kind: String? = null,
        sort: String = TitleSort.NAME,
        limit: Int = 60,
        offset: Int = 0,
    ): BrowsedTitles = get(
        "titles",
        mapOf("genre" to genre, "studio" to studio, "kind" to kind, "sort" to sort, "limit" to limit, "offset" to offset),
    )

    suspend fun genres(libraryId: String): List<Facet> =
        get<FacetsResponse>("titles/facets", mapOf("libraryId" to libraryId)).genres

    suspend fun title(id: String): Title = get("titles/$id")

    /** A title's files in episode order, of one season or all of them. */
    suspend fun titleItems(id: String, season: Int? = null): List<MediaItem> {
        val payload = buildJsonObject { if (season != null) put("season", season) }
        return send(
            Request.Builder().url(url("titles/$id/items"))
                .post(payload.toString().toRequestBody(jsonType)).build(),
            ListSerializer(MediaItem.serializer()),
        )!!
    }

    /** The files without a season number, which [titleItems] can't ask for alone. */
    suspend fun looseItems(id: String): List<MediaItem> {
        val payload = buildJsonObject { put("season", JsonNull) }
        return send(
            Request.Builder().url(url("titles/$id/items"))
                .post(payload.toString().toRequestBody(jsonType)).build(),
            ListSerializer(MediaItem.serializer()),
        )!!
    }

    suspend fun person(name: String): Person = get("people/${seg(name)}")
    suspend fun search(query: String, limit: Int = 20): SearchResults =
        get("search", mapOf("query" to query, "limit" to limit))

    suspend fun media(id: String): MediaItem = get("media/$id")
    suspend fun subtitles(id: String): Subtitles = get("media/$id/subtitles")
    suspend fun audio(id: String): List<AudioTrack> = get("media/$id/audio")
    suspend fun keyframes(id: String, seconds: Double): Keyframes =
        get("media/$id/keyframes", mapOf("seconds" to "%.3f".format(java.util.Locale.ROOT, seconds)))

    suspend fun shelf(libraryId: String, limit: Int = 12): List<ShelfEntry> =
        get("libraries/$libraryId/shelf", mapOf("limit" to limit))

    /**
     * A file's trickplay images. The server keeps the stream open while it
     * makes them; this waits for `ready` or `unavailable`, reconnecting while
     * they're pending.
     */
    fun trickplay(id: String): Flow<TrickplayStatus> = flow {
        while (true) {
            var last: TrickplayStatus? = null
            val request = Request.Builder().url(url("media/$id/trickplay"))
                .header("Accept", "text/event-stream").build()
            client.newCall(request).await().use { response ->
                if (!response.isSuccessful) throw errorOf(response, response.body.string())
                val source = response.body.source()
                var event = "message"
                while (!source.exhausted()) {
                    val line = source.readUtf8Line() ?: break
                    when {
                        line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                        line.startsWith("data:") && event == "message" -> {
                            val status = json.decodeFromString(
                                TrickplayStatus.serializer(),
                                line.removePrefix("data:").trim(),
                            )
                            last = status
                            emit(status)
                            if (status.status != "pending") return@flow
                        }
                    }
                }
            }
            if (last == null) return@flow
        }
    }.flowOn(Dispatchers.IO)

    // Downloads

    /** What a download with [spec] would hold, and about how big it is. Starts nothing. */
    suspend fun downloadPlan(itemId: String, spec: DownloadSpec): DownloadPlan =
        post("media/$itemId/download-plan", body(DownloadSpecBody(spec)))

    suspend fun startDownload(itemId: String, spec: DownloadSpec): ServerDownload =
        post("media/$itemId/downloads", body(DownloadSpecBody(spec)))

    /** Stop a download and delete what the server still has of it. */
    suspend fun removeDownload(downloadId: String) = call("DELETE", "downloads/$downloadId", null)

    // Home

    suspend fun continueWatching(limit: Int = 20): List<MediaItem> =
        get("home/continue-watching", mapOf("limit" to limit))

    suspend fun nextUp(limit: Int = 20): List<MediaItem> = get("home/next-up", mapOf("limit" to limit))
    suspend fun featured(limit: Int = 6): List<FeaturedTitle> = get("home/featured", mapOf("limit" to limit))
    suspend fun favorites(limit: Int = 60): List<TitleSummary> = get("favorites", mapOf("limit" to limit))
    suspend fun favoriteItems(limit: Int = 60): List<MediaItem> =
        get("favorites/items", mapOf("limit" to limit))

    // Watching

    suspend fun playbackOptions(): PlaybackOptions = get("playback/options")

    suspend fun report(
        itemId: String,
        positionSeconds: Double,
        durationSeconds: Double?,
        sessionId: String,
        playedSeconds: Double,
        paused: Boolean,
        closed: Boolean = false,
    ) = call(
        "POST",
        "media/$itemId/progress",
        body(
            ProgressBody(
                positionSeconds = positionSeconds.coerceAtLeast(0.0),
                durationSeconds = durationSeconds?.takeIf { it > 0 },
                sessionId = sessionId,
                playedSeconds = playedSeconds.coerceAtLeast(0.0),
                paused = paused,
                closed = closed.takeIf { it },
            ),
        ),
    )

    /** Where the person got to while offline, without a playback session. */
    suspend fun syncProgress(itemId: String, positionSeconds: Double, durationSeconds: Double?) = call(
        "POST",
        "media/$itemId/progress",
        body(
            ProgressBody(
                positionSeconds = positionSeconds.coerceAtLeast(0.0),
                durationSeconds = durationSeconds?.takeIf { it > 0 },
                closed = true,
            ),
        ),
    )

    suspend fun setWatched(itemId: String, watched: Boolean) =
        call("PUT", "media/$itemId/watched", body(WatchedBody(watched)))

    suspend fun setTitleWatched(titleId: String, watched: Boolean, season: Int? = null) =
        call("PUT", "titles/$titleId/watched", body(TitleWatchedBody(watched, season)))

    suspend fun setFavorite(titleId: String, favorite: Boolean) =
        call("PUT", "titles/$titleId/favorite", body(FavoriteBody(favorite)))

    suspend fun setItemFavorite(itemId: String, favorite: Boolean) =
        call("PUT", "media/$itemId/favorite", body(FavoriteBody(favorite)))

    companion object {
        private val EMPTY = ByteArray(0).toRequestBody(null)
    }
}

@kotlinx.serialization.Serializable
private data class FacetsResponse(val genres: List<Facet> = emptyList(), val studios: List<Facet> = emptyList())

/** Runs the call on OkHttp's threads and cancels it with the coroutine. */
suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    enqueue(ContinuationCallback(this, continuation))
    continuation.invokeOnCancellation { cancel() }
}

private class ContinuationCallback(
    private val call: Call,
    private val continuation: CancellableContinuation<Response>,
) : Callback {
    override fun onResponse(call: Call, response: Response) {
        continuation.resume(response) { _, _, _ -> response.close() }
    }

    override fun onFailure(call: Call, e: IOException) {
        if (!this.call.isCanceled()) continuation.resumeWithException(e)
    }
}
