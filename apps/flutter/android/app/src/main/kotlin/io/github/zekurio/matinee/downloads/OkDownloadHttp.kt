package io.github.zekurio.matinee.downloads

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * The fetches' network: the server's sign-in on requests to that server
 * only, and the app's user agent on every one.
 */
class OkDownloadHttp(base: OkHttpClient, server: String, signIn: ServerSignIn) : DownloadHttp {
    private val client = base.newBuilder()
        .addInterceptor(
            Interceptor { chain ->
                val request = chain.request()
                val builder = request.newBuilder()
                if (signIn.userAgent.isNotEmpty()) builder.header("User-Agent", signIn.userAgent)
                val token = signIn.token
                if (token != null && Credentials.sameOrigin(request.url.toString(), server)) {
                    builder.header("Authorization", "Bearer $token")
                }
                chain.proceed(builder.build())
            },
        )
        .build()

    // Subtitles taken out of a large file can keep the server busy for minutes.
    private val slowClient = client.newBuilder().readTimeout(5, TimeUnit.MINUTES).build()

    override suspend fun get(url: String, from: Long, slow: Boolean): HttpAnswer {
        val request = Request.Builder().url(url).apply { if (from > 0) header("Range", "bytes=$from-") }.build()
        return (if (slow) slowClient else client).newCall(request).answer()
    }

    override suspend fun post(url: String, json: String): HttpAnswer =
        client.newCall(Request.Builder().url(url).post(json.toRequestBody(JSON)).build()).answer()

    override suspend fun delete(url: String): HttpAnswer =
        client.newCall(Request.Builder().url(url).delete().build()).answer()

    private suspend fun Call.answer(): HttpAnswer {
        val response = await()
        val headers = response.headers.associate { (name, value) -> name.lowercase() to value }
        val body = response.body
        return HttpAnswer(
            response.code,
            headers,
            body?.byteStream() ?: java.io.ByteArrayInputStream(ByteArray(0)),
            body?.contentLength() ?: 0,
            response::close,
        )
    }

    private companion object {
        val JSON = "application/json".toMediaType()

        /** Http's own failures as [IOException]s; cancelling the coroutine cancels the call. */
        suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { runCatching { cancel() } }
            enqueue(
                object : Callback {
                    override fun onResponse(call: Call, response: Response) = continuation.resume(response)

                    override fun onFailure(call: Call, e: IOException) {
                        if (continuation.isActive) continuation.resumeWithException(e)
                    }
                },
            )
        }

        /** One client for every fetch, so they share connections. */
        val shared: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .build()
        }
    }

    constructor(server: String, signIn: ServerSignIn) : this(shared, server, signIn)
}
