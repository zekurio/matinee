package io.github.zekurio.matinee.api

import java.io.IOException
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/** A request the server answered with an error, with its message to show. */
class ApiException(val status: Int, val code: String?, override val message: String) : IOException(message)

/** What the server sends with a failed request. */
@Serializable
data class ApiErrorBody(
    val code: String? = null,
    val status: Int? = null,
    val message: String? = null,
)

/** How the app reads the server's JSON: newer servers may add fields. */
val MatineeJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
}

/**
 * How request bodies go out. A null the contract requires is written, and
 * an optional field left at null is left out, so `Explicit` can tell the
 * two apart.
 */
private val BodyJson = Json(MatineeJson) {
    explicitNulls = true
    encodeDefaults = false
}

/** A file to send in a form, like an image upload. */
class FilePart(val bytes: ByteArray, val type: String, val name: String)

/**
 * A field that may be left out, set, or null. As an optional argument,
 * null leaves it out, `Explicit(null)` sends null, and `Explicit(value)`
 * sends the value.
 */
@Serializable(with = ExplicitSerializer::class)
data class Explicit<T : Any>(val value: T?)

class ExplicitSerializer<T : Any>(private val inner: KSerializer<T>) : KSerializer<Explicit<T>> {
    override val descriptor: SerialDescriptor = inner.nullable.descriptor

    override fun serialize(encoder: Encoder, value: Explicit<T>) =
        encoder.encodeSerializableValue(inner.nullable, value.value)

    override fun deserialize(decoder: Decoder): Explicit<T> =
        Explicit(decoder.decodeSerializableValue(inner.nullable))
}

/**
 * Sends the requests of the generated [ContractApi] to the REST API under
 * /api/v1. [client] adds the session token.
 */
class ApiTransport internal constructor(private val base: HttpUrl, private val client: OkHttpClient) {
    private val jsonType = "application/json".toMediaType()

    private fun url(path: List<String>, query: List<Pair<String, String?>>): HttpUrl =
        base.newBuilder().apply {
            addPathSegments("api/v1")
            // addPathSegment encodes a `/` in a value, like a person's name.
            path.forEach(::addPathSegment)
            for ((key, value) in query) if (value != null) addQueryParameter(key, value)
        }.build()

    private fun request(method: String, path: List<String>, query: List<Pair<String, String?>>, body: RequestBody?) =
        Request.Builder().url(url(path, query)).method(
            method,
            // OkHttp wants a body on the methods that carry one.
            body ?: if (method == "GET" || method == "DELETE") null else EMPTY,
        )

    private suspend fun <T> exchange(request: Request, output: KSerializer<T>?): T? =
        withContext(Dispatchers.IO) {
            client.newCall(request).await().use {
                val text = it.body.string()
                if (!it.isSuccessful) throw errorOf(it, text)
                if (output == null || text.isEmpty()) null else MatineeJson.decodeFromString(output, text)
            }
        }

    suspend fun <T> call(
        method: String,
        path: List<String>,
        query: List<Pair<String, String?>>,
        body: RequestBody?,
        output: KSerializer<T>,
    ): T {
        val answer = exchange(request(method, path, query, body).build(), output)
        // An empty answer can only be a nullable output's null.
        return answer ?: MatineeJson.decodeFromString(output, "null")
    }

    /** A call that answers with nothing. */
    suspend fun send(method: String, path: List<String>, query: List<Pair<String, String?>>, body: RequestBody?) {
        exchange<Unit>(request(method, path, query, body).build(), null)
    }

    /**
     * An event stream's messages, until the server ends it. The stream ends
     * on its own too, at the server's cap on a stream's length; reconnect
     * when the last message says there's more to come.
     */
    fun <T> events(
        method: String,
        path: List<String>,
        query: List<Pair<String, String?>>,
        body: RequestBody?,
        output: KSerializer<T>,
    ): Flow<T> = flow {
        val request = request(method, path, query, body).header("Accept", "text/event-stream").build()
        client.newCall(request).await().use { response ->
            if (!response.isSuccessful) throw errorOf(response, response.body.string())
            val source = response.body.source()
            var event = "message"
            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                when {
                    line.isEmpty() -> event = "message"
                    line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                    line.startsWith("data:") && event == "message" ->
                        emit(MatineeJson.decodeFromString(output, line.removePrefix("data:").trim()))
                }
            }
        }
    }.flowOn(Dispatchers.IO)

    fun <T> json(serializer: KSerializer<T>, value: T): RequestBody =
        BodyJson.encodeToString(serializer, value).toRequestBody(jsonType)

    fun form(fields: List<Pair<String, String?>>, files: List<Pair<String, FilePart>>): RequestBody =
        MultipartBody.Builder().setType(MultipartBody.FORM).apply {
            for ((key, value) in fields) if (value != null) addFormDataPart(key, value)
            for ((key, file) in files) addFormDataPart(key, file.name, file.bytes.toRequestBody(file.type.toMediaType()))
        }.build()

    private fun errorOf(response: Response, body: String): ApiException {
        val parsed = runCatching { MatineeJson.decodeFromString(ApiErrorBody.serializer(), body) }.getOrNull()
        return ApiException(
            status = response.code,
            code = parsed?.code,
            message = parsed?.message ?: "The server answered ${response.code}.",
        )
    }

    private companion object {
        val EMPTY = ByteArray(0).toRequestBody(null)
    }
}

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
