package io.github.zekurio.matinee

import android.app.Application
import android.content.Context
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.downloads.Downloads
import io.github.zekurio.matinee.ui.ViewerState
import io.github.zekurio.matinee.ui.player.PlayerPrefs
import io.github.zekurio.matinee.ui.theme.ThemeStore
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch

class MatineeApp : Application(), SingletonImageLoader.Factory {
    lateinit var session: Session
        private set

    /** Watched and favorite overrides last only for the active sign-in. */
    val viewer: ViewerState
        get() {
            if (viewerVersion != session.version) {
                viewerVersion = session.version
                currentViewer = ViewerState()
            }
            return currentViewer
        }
    private var viewerVersion = -1L
    private var currentViewer = ViewerState()

    val downloads by lazy { Downloads(this) }

    /** How this device plays: quality, codecs, decoders, subtitles. */
    val player by lazy { PlayerPrefs(this) }

    /** The color theme, which follows the account and the server's accent. */
    val theme by lazy { ThemeStore(this) }

    private val scope = MainScope()

    override fun onCreate() {
        super.onCreate()
        session = Session(this)
        downloads.restore()
        // Once signed in with the server answering, send where the person got
        // to in downloads they watched offline.
        scope.launch {
            session.state.collect { state ->
                if (state is AuthState.SignedIn) session.api?.let { downloads.pending.flush(it) }
            }
        }
        // The account's theme and the server's accent, whenever a session or
        // the sign-in screen loads them.
        scope.launch {
            session.state.collect { state ->
                when (state) {
                    is AuthState.SignedIn -> session.api?.let { theme.pull(it) }
                    is AuthState.SignedOut -> theme.setAccents(state.config.themeAccents)
                    else -> Unit
                }
            }
        }
    }

    // Artwork comes through the session's client, which sends the token.
    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .components { add(OkHttpNetworkFetcherFactory(callFactory = { session.artworkHttp })) }
        .memoryCache { MemoryCache.Builder().maxSizePercent(context, 0.25).build() }
        .diskCache {
            DiskCache.Builder()
                .directory(context.cacheDir.resolve("artwork"))
                .maxSizeBytes(256L * 1024 * 1024)
                .build()
        }
        .crossfade(true)
        .build()
}

val Context.app: MatineeApp
    get() = applicationContext as MatineeApp
