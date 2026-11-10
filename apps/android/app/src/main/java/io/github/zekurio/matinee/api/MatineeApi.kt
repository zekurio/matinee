package io.github.zekurio.matinee.api

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.transformWhile
import okhttp3.HttpUrl
import okhttp3.OkHttpClient

/**
 * The server's API: the contract's procedures from the generated
 * [ContractApi], under the same names as on the web (`api.titles.get(id)`
 * is `orpc.titles.get`), and the plain routes in [paths]. [client] adds
 * the session token.
 */
class MatineeApi(val base: HttpUrl, client: OkHttpClient) : ContractApi(ApiTransport(base, client)) {
    val paths = Paths(base)

    /** A title's files in episode order, of one season or all of them. */
    suspend fun titleItems(id: String, season: Int? = null): List<MediaItem> =
        titles.items(id, season = season?.let { Explicit(it) })

    /** The files without a season number, which [titleItems] can't ask for alone. */
    suspend fun looseItems(id: String): List<MediaItem> = titles.items(id, season = Explicit(null))

    /**
     * A file's trickplay images, until they're `ready` or `unavailable`.
     * The server ends a stream after a while to check the session again, so
     * this reconnects while they're still pending.
     */
    fun trickplayUntilSettled(id: String): Flow<TrickplayStatus> = flow {
        while (true) {
            var last: TrickplayStatus? = null
            media.trickplay(id)
                .transformWhile {
                    emit(it)
                    it is TrickplayStatus.Pending
                }
                .collect {
                    last = it
                    emit(it)
                }
            if (last !is TrickplayStatus.Pending) return@flow
        }
    }
}
