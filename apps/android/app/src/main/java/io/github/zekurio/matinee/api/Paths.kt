package io.github.zekurio.matinee.api

import okhttp3.HttpUrl

/**
 * The plain HTTP routes from packages/contracts/src/paths.ts: the file,
 * subtitles, artwork, and the sign-in page. The player's streams come as
 * paths from `playback.start`, which [server] turns into addresses. Every
 * one of them wants the session token, which the shared OkHttp client adds
 * for the server's origin.
 */
class Paths(private val base: HttpUrl) {
    private fun url(vararg segments: String) = base.newBuilder().apply {
        segments.forEach { addPathSegment(it) }
    }

    /** Artwork at most as wide as [size]: thumb 240, small 480, medium 960, large 1920. */
    fun artwork(id: String, size: ArtworkSize = ArtworkSize.Small): String =
        url("api", "artwork", id).addQueryParameter("size", size.query).build().toString()

    fun avatar(id: String): String = url("api", "avatars", id).build().toString()

    /** A frame from the file, for cards (small) and banners (large). */
    fun thumbnail(itemId: String, large: Boolean = false): String =
        url("api", "media", itemId, "thumbnail")
            .addQueryParameter("size", if (large) "large" else "small").build().toString()

    /** The file as it is, with byte ranges. */
    fun stream(itemId: String): String = url("api", "media", itemId, "stream").build().toString()

    /**
     * A path the server answered with, like the source `playback.start`
     * gives, as an address on it.
     */
    fun server(path: String): String = base.resolve(path)?.toString() ?: path

    /** A subtitle track: WebVTT for `webvtt` tracks, a PGS `.sup` file for `pgs` ones. */
    fun subtitle(itemId: String, trackId: String): String =
        url("api", "media", itemId, "subtitles", trackId).build().toString()

    /** A download's init segment, the MP4 header its segments follow. */
    fun downloadInit(downloadId: String): String = url("api", "downloads", downloadId, "init.mp4").build().toString()

    /** One segment of a download, from 0 on. 204 past the end. */
    fun downloadSegment(downloadId: String, segment: Int): String =
        url("api", "downloads", downloadId, "$segment.m4s").build().toString()

    fun trickplayTile(itemId: String, key: String, tile: Int): String =
        url("api", "media", itemId, "trickplay", key, "$tile.jpg").build().toString()

    /** The page an app opens in the browser to be signed in. */
    fun authorize(
        redirectUri: String,
        state: String,
        codeChallenge: String,
        deviceName: String?,
        platform: String,
    ): String = url("authorize").apply {
        addQueryParameter("redirect_uri", redirectUri)
        addQueryParameter("state", state)
        addQueryParameter("code_challenge", codeChallenge)
        addQueryParameter("code_challenge_method", "S256")
        addQueryParameter("platform", platform)
        if (!deviceName.isNullOrBlank()) addQueryParameter("device_name", deviceName)
    }.build().toString()
}

enum class ArtworkSize(val query: String) {
    Thumb("thumb"),
    Small("small"),
    Medium("medium"),
    Large("large"),
}
