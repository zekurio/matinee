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
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.ViewerState

class MatineeApp : Application(), SingletonImageLoader.Factory {
    lateinit var session: Session
        private set

    /** Watched and favorite marks changed here, so every screen shows them at once. */
    val viewer = ViewerState()

    override fun onCreate() {
        super.onCreate()
        session = Session(this)
    }

    // Artwork comes through the session's client, which sends the token.
    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .components { add(OkHttpNetworkFetcherFactory(callFactory = { session.http })) }
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
