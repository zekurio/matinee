package io.github.zekurio.matinee.api.admin

import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.ThemeAccents
import io.github.zekurio.matinee.api.CompleteJson
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/*
 * The admin's calls, from the contract's admin, libraries, and metadata
 * procedures, for the admin pages under ui/settings/admin.
 */

private suspend fun <T> MatineeApi.write(method: String, path: String, payload: JsonElement, answer: KSerializer<T>): T =
    send(
        Request.Builder().url(url(path)).method(method, payload.toString().toRequestBody(jsonType)).build(),
        answer,
    )!!

private inline fun <reified T> encode(value: T): JsonElement = CompleteJson.encodeToJsonElement(kotlinx.serialization.serializer<T>(), value)

// Server appearance

suspend fun MatineeApi.themeAccents(): ThemeAccents = get("admin/appearance")

suspend fun MatineeApi.setThemeAccents(accents: ThemeAccents): ThemeAccents =
    write("PUT", "admin/appearance", encode(accents), ThemeAccents.serializer())

// Trickplay

@Serializable
data class TrickplaySettings(
    val enabled: Boolean,
    val intervalSeconds: Int,
    val width: Int,
    val keyframesOnly: Boolean,
    val hardwareDecoding: Boolean,
)

@Serializable
data class AdminTrickplay(
    val settings: TrickplaySettings,
    /** The transcoding GPU hardware decoding would use; null without one. */
    val hardwareAcceleration: String? = null,
    val videos: Int = 0,
    val ready: Int = 0,
)

/** Seconds between thumbnails and widths in pixels admins can pick, as the contract has them. */
val TRICKPLAY_INTERVALS = listOf(2, 5, 10, 15, 30)
val TRICKPLAY_WIDTHS = listOf(240, 320, 480)

suspend fun MatineeApi.trickplaySettings(): AdminTrickplay = get("admin/trickplay")

suspend fun MatineeApi.setTrickplaySettings(settings: TrickplaySettings): AdminTrickplay =
    write("PUT", "admin/trickplay", encode(settings), AdminTrickplay.serializer())

// Users

@Serializable
data class AdminUser(
    val id: String,
    val username: String,
    val displayName: String? = null,
    val role: String,
    val avatarId: String? = null,
    val createdAt: String,
    val lastSeenAt: String? = null,
    val passkeys: Int = 0,
    val oidcLinked: Boolean = false,
    val sessions: Int = 0,
) {
    val name get() = displayName?.takeIf { it.isNotBlank() } ?: username
    val isAdmin get() = role == "admin"
}

@Serializable
private data class Ended(val ended: Int)

suspend fun MatineeApi.adminUsers(): List<AdminUser> = get("admin/users")

suspend fun MatineeApi.setUserRole(id: String, role: String): AdminUser =
    write("PUT", "admin/users/$id/role", buildJsonObject { put("role", role) }, AdminUser.serializer())

suspend fun MatineeApi.removeUser(id: String) = call("DELETE", "admin/users/$id", null)

/** Ends the user's sessions, all but the one asking for the caller's own; returns how many. */
suspend fun MatineeApi.signOutUser(id: String): Int = post<Ended>("admin/users/$id/sign-out").ended

// Authentication

@Serializable
data class OidcSettings(
    val enabled: Boolean = false,
    val displayName: String = "",
    val issuerUrl: String = "",
    val clientId: String = "",
    val scopes: String = "",
    val usernameClaim: String = "",
    val roleClaim: String = "",
    val allowSignUp: Boolean = false,
)

@Serializable
data class PasskeySettings(val enabled: Boolean = true)

@Serializable
data class ClientSecret(
    /** `saved` or `environment`; null when there is none. */
    val source: String? = null,
    val environment: Boolean = false,
)

@Serializable
data class AdminAuth(
    val passkeys: PasskeySettings,
    val oidc: OidcSettings,
    val defaults: OidcSettings,
    val clientSecret: ClientSecret,
    val callbackUrl: String,
    val active: Boolean,
    val ssoOnlyUsers: Int = 0,
    val unlinkedUsers: Int = 0,
)

/** A new client secret to save, the saved one dropped, or the saved one kept. */
sealed interface SecretChange {
    data class Set(val secret: String) : SecretChange

    data object Drop : SecretChange

    data object Keep : SecretChange
}

suspend fun MatineeApi.authSettings(): AdminAuth = get("admin/auth")

suspend fun MatineeApi.setAuthSettings(passkeys: PasskeySettings, oidc: OidcSettings, secret: SecretChange): AdminAuth {
    val oidcJson = buildJsonObject {
        encode(oidc).let { it as JsonObject }.forEach { (key, value) -> put(key, value) }
        when (secret) {
            is SecretChange.Set -> put("clientSecret", secret.secret)
            SecretChange.Drop -> put("clientSecret", kotlinx.serialization.json.JsonNull)
            SecretChange.Keep -> Unit
        }
    }
    val payload = buildJsonObject {
        put("passkeys", encode(passkeys))
        put("oidc", oidcJson)
    }
    return write("PUT", "admin/auth", payload, AdminAuth.serializer())
}

// Jobs

@Serializable
data class JobFailure(val label: String, val message: String, val at: String)

@Serializable
data class RunningJob(val label: String, val startedAt: String)

@Serializable
data class JobQueue(
    val id: String,
    val name: String,
    val description: String = "",
    val concurrency: Int = 1,
    val defaultConcurrency: Int = 1,
    val maxConcurrency: Int = 1,
    /** Null when the queue's concurrency can't be changed. */
    val concurrencyNote: String? = null,
    val active: Int = 0,
    val waiting: Int = 0,
    val completed: Int = 0,
    val failed: Int = 0,
    val paused: Boolean = false,
    val running: List<RunningJob> = emptyList(),
    val failures: List<JobFailure> = emptyList(),
)

@Serializable
data class TaskRun(val startedAt: String, val endedAt: String, val result: String, val error: String? = null)

@Serializable
data class ScheduledTask(
    val id: String,
    val name: String,
    val description: String = "",
    /** The queue its runs fill; null for upkeep the task does itself. */
    val queue: String? = null,
    val intervalSeconds: Double? = null,
    /** When the run going on now started; null when it isn't running. */
    val startedAt: String? = null,
    val progress: Double? = null,
    val lastRun: TaskRun? = null,
    val nextRunAt: String? = null,
)

@Serializable
data class JobsOverview(val queues: List<JobQueue> = emptyList(), val tasks: List<ScheduledTask> = emptyList())

suspend fun MatineeApi.jobs(): JobsOverview = get("admin/jobs")

/** `pause`, `resume`, or `clear` a queue. */
suspend fun MatineeApi.queueAction(queue: String, action: String): JobQueue = post("admin/jobs/$queue/$action")

suspend fun MatineeApi.setConcurrency(queue: String, concurrency: Int): JobsOverview = write(
    "PUT",
    "admin/jobs/concurrency",
    buildJsonObject { put("concurrency", buildJsonObject { put(queue, concurrency) }) },
    JobsOverview.serializer(),
)

/** `run` or `cancel` a task. */
suspend fun MatineeApi.taskAction(task: String, action: String): ScheduledTask = post("admin/tasks/$task/$action")

// Libraries

/** A library with everything an admin edits, as `libraries.list` sends it. */
@Serializable
data class AdminLibrary(
    val id: String,
    val name: String,
    val kind: String,
    val paths: List<String> = emptyList(),
    val itemCount: Int = 0,
    val titleCount: Int = 0,
    val metadataProvider: String? = null,
    val metadataLanguage: String = "en",
    val lastScannedAt: String? = null,
    val scanning: Boolean = false,
    val refreshing: Boolean = false,
)

@Serializable
data class LibraryInput(
    val name: String,
    val kind: String,
    val paths: List<String>,
    val metadataProvider: String?,
    val metadataLanguage: String,
)

@Serializable
data class ProviderInfo(
    val id: String,
    val name: String,
    val description: String = "",
    val episodes: Boolean = false,
    val configured: Boolean = false,
    val setup: String? = null,
)

@Serializable
data class Directory(val name: String, val path: String)

@Serializable
data class DirectoryListing(val path: String, val parent: String? = null, val directories: List<Directory> = emptyList())

suspend fun MatineeApi.adminLibraries(): List<AdminLibrary> = get("libraries")

suspend fun MatineeApi.providerInfo(): List<ProviderInfo> = get("metadata/providers")

suspend fun MatineeApi.createLibrary(input: LibraryInput): AdminLibrary =
    write("POST", "libraries", encode(input), AdminLibrary.serializer())

suspend fun MatineeApi.updateLibrary(id: String, input: LibraryInput): AdminLibrary =
    write("PUT", "libraries/$id", encode(input), AdminLibrary.serializer())

suspend fun MatineeApi.removeLibrary(id: String) = call("DELETE", "libraries/$id", null)

suspend fun MatineeApi.scanLibrary(id: String) = call("POST", "libraries/$id/scan")

suspend fun MatineeApi.refreshLibrary(id: String) = call("POST", "libraries/$id/refresh-metadata")

/** The folders on the server under [path], its root without one. */
suspend fun MatineeApi.browseFolders(path: String?): DirectoryListing = get("admin/browse", mapOf("path" to path))

// Transcoding

/**
 * The transcoding settings as the server sends them, kept as JSON: there
 * are some forty, and a save sends them all back, so none the app doesn't
 * know of gets lost.
 */
@Serializable
data class AdminTranscoding(
    val settings: JsonObject,
    val defaults: JsonObject,
    val environment: List<String> = emptyList(),
    val capabilities: JsonObject,
)

suspend fun MatineeApi.transcodingSettings(): AdminTranscoding = get("admin/transcoding")

suspend fun MatineeApi.setTranscodingSettings(settings: JsonObject): AdminTranscoding =
    write("PUT", "admin/transcoding", settings, AdminTranscoding.serializer())

/** Detect ffmpeg and the GPUs again, after a driver or ffmpeg update. */
suspend fun MatineeApi.detectTranscoding(): AdminTranscoding = post("admin/transcoding/detect")
