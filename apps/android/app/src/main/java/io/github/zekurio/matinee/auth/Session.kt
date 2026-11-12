package io.github.zekurio.matinee.auth

import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.provider.Settings
import io.github.zekurio.matinee.BuildConfig
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.AppSession
import io.github.zekurio.matinee.api.AuthConfig
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MatineeJson
import io.github.zekurio.matinee.api.Paths
import io.github.zekurio.matinee.api.User
import io.github.zekurio.matinee.api.decodeSaved
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient

/** Where the app is between picking a server and using it. */
sealed interface AuthState {
    /**
     * Picking a server to add. [canCancel] while another one is saved and in
     * use, which going back returns to as it was.
     */
    data class NoServer(val canCancel: Boolean = false) : AuthState

    data class Connecting(val server: String) : AuthState

    /**
     * A saved server that didn't answer; the app offers to try again, and
     * does on its own when the network comes back. [retrying] while it does.
     */
    data class Unreachable(val server: String, val reason: Unreachability, val retrying: Boolean = false) : AuthState

    /**
     * Signing in to [server]. [adding] while it's a server being added, not
     * saved until the sign-in succeeds; going back returns to the one in use.
     */
    data class SignedOut(val server: String, val config: AuthConfig, val adding: Boolean = false) : AuthState

    data class SignedIn(val server: String, val user: User) : AuthState

    /** The server is away, and the app shows what's downloaded. */
    data class Offline(val server: String, val user: User) : AuthState
}

/** A server saved on this device, as the server list shows it. */
data class SavedServer(
    /** The server's root, as `https://media.example.com/`, which names it across the app. */
    val origin: String,
    /** Its address as the app shows it, `https://media.example.com`. */
    val address: String,
    /** What it calls itself, when it was found on the local network. */
    val name: String?,
    /** The account signed in there, or null while signed out. */
    val user: User?,
    /** The one in use. */
    val active: Boolean,
)

/** A client for one saved server, sending its token, whichever server is in use. */
class ServerClient(val api: MatineeApi, val http: OkHttpClient)

/** A request kept after its sign-in ended must not use a later sign-in's credentials. */
class SessionChanged : IOException("The session ended.")

/** Why the server didn't answer, as far as the app can tell. */
enum class Unreachability {
    /** The phone has no network at all. */
    NoNetwork,
    Refused,
    NotFound,
    Timeout,
    Certificate,
    Other,
}

/**
 * The saved servers, the one in use and the session on it, and the HTTP
 * client every part of the app shares: the API, artwork, and the player.
 * The client adds the session token to requests for the server's origin
 * and nowhere else.
 *
 * Each saved server keeps its own token and account, so switching to one
 * still signed in needs no sign-in. A server being added stays apart from
 * the saved ones until it's signed in: the one in use, its clients, and its
 * session are left as they are, so going back returns to it.
 */
class Session(context: Context) {
    private val res = context.applicationContext.resources
    private val store = SessionStore(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    init {
        normalizeSaved()
    }

    /** The token of each saved server that's signed in, by origin. */
    private val tokens = ConcurrentHashMap<String, String>().apply {
        store.servers.forEach { saved -> store.open(saved.token)?.let { put(saved.origin, it) } }
    }

    @Volatile private var origin: HttpUrl? = store.active?.toHttpUrlOrNull()
    @Volatile private var token: String? = store.active?.let { tokens[it] }

    /** A server the person connected to, to sign in to, before it's saved. */
    private class Candidate(val url: HttpUrl, val name: String?, val api: MatineeApi)

    @Volatile private var candidate: Candidate? = null

    /** What showed when adding a server began, to go back to. */
    private var beforeAdding: AuthState? = null

    /** Moves whenever [origin] or [token] does; clients made before it stop sending their token. */
    @Volatile private var generation = 0L

    /** Changes when the active sign-in or server changes. */
    val version: Long get() = generation

    private val _state = MutableStateFlow<AuthState>(AuthState.NoServer())
    val state: StateFlow<AuthState> = _state.asStateFlow()

    private val _servers = MutableStateFlow(savedServers())

    /** The saved servers, in the order they were added. */
    val servers: StateFlow<List<SavedServer>> = _servers.asStateFlow()

    private val _activeServer = MutableStateFlow(store.active)

    /**
     * The origin of the saved server in use, as [SavedServer.origin]. It
     * stays while another server is being added, and is null only while no
     * server is saved.
     */
    val activeServer: StateFlow<String?> = _activeServer.asStateFlow()

    private val _removing = MutableStateFlow<Set<String>>(emptySet())

    /** The servers being removed, while their sessions end. */
    val removing: StateFlow<Set<String>> = _removing.asStateFlow()

    /**
     * Runs as a server is removed, before its session ends: what's on this
     * device for it goes, sent first where it can be with [api], a client
     * still signed in there, or null when it wasn't.
     */
    var onRemove: (suspend (origin: String, api: MatineeApi?) -> Unit)? = null

    /** What the sessions list on the server calls this device. */
    val deviceName: String = Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
        ?.takeIf { it.isNotBlank() }
        ?: Build.MODEL

    /** Android TV, which signs in with a code and has no browser to sign in with. */
    val isTv: Boolean = context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)

    /** The contract's `DevicePlatform`, so the person approving a TV sees a TV. */
    val platform: String = if (isTv) "androidtv" else "android"

    /** How the app names itself to the server. */
    val userAgent = "Matinee/${BuildConfig.VERSION_NAME} (Android ${Build.VERSION.RELEASE}; ${Build.MODEL})"

    /** The session's token as a header, for a player that doesn't go through [http], like mpv. */
    fun playerHeaders(): Map<String, String> = token?.let { mapOf("Authorization" to "Bearer $it") }.orEmpty()

    private val base: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        // Streams and encodes wait while the server makes the next part.
        .readTimeout(60, TimeUnit.SECONDS)
        .addInterceptor { chain -> chain.proceed(chain.request().newBuilder().header("User-Agent", userAgent).build()) }
        .build()

    /**
     * A client that sends [bearer] to [server] while [generation] still is
     * [made], and refuses once it moved on, rather than send the new token.
     */
    private fun bound(server: HttpUrl?, bearer: String?, made: Long): OkHttpClient = base.newBuilder()
        .addInterceptor { chain ->
            if (bearer != null && generation != made) throw SessionChanged()
            val request = chain.request()
            val builder = request.newBuilder()
            if (server != null && bearer != null && sameOrigin(request.url, server)) {
                builder.header("Authorization", "Bearer $bearer")
            }
            chain.proceed(builder.build())
        }
        .build()

    /** A client that sends whatever token [key]'s saved server has when each request goes. */
    private fun following(server: HttpUrl, key: String): OkHttpClient = base.newBuilder()
        .addInterceptor { chain ->
            val request = chain.request()
            val bearer = tokens[key]
            val builder = request.newBuilder()
            if (bearer != null && sameOrigin(request.url, server)) builder.header("Authorization", "Bearer $bearer")
            chain.proceed(builder.build())
        }
        .build()

    /**
     * The client for the session as it is now. Take it again after a sign-in
     * changes: one kept from before stops working.
     */
    @Volatile var http: OkHttpClient = bound(origin, token, generation)
        private set

    /**
     * Sends each saved server's token to that server, as it is at the time,
     * for a client made once for the whole run, like the image loader's.
     * Only for artwork.
     */
    val artworkHttp: OkHttpClient = base.newBuilder()
        .addInterceptor { chain ->
            val request = chain.request()
            val bearer = tokens[keyOf(request.url)]
            val builder = request.newBuilder()
            if (bearer != null) builder.header("Authorization", "Bearer $bearer")
            chain.proceed(builder.build())
        }
        .build()

    @Volatile var api: MatineeApi? = origin?.let { MatineeApi(it, http) }
        private set

    /** A new server or token: new clients, and the old ones stop. */
    private fun rebind() {
        generation++
        http = bound(origin, token, generation)
        api = origin?.let { MatineeApi(it, http) }
    }

    /** The API while signed in. Screens only show then. */
    fun requireApi(): MatineeApi = checkNotNull(api) { "not connected" }

    /** The API of the server being signed in to: one being added, or the one in use. */
    fun signInApi(): MatineeApi = candidate?.api ?: requireApi()

    /**
     * A client for the saved server [origin], with its token, for work that
     * belongs to that server whichever is in use, like its downloads. Null
     * once it's no longer saved.
     */
    fun serverClient(origin: String): ServerClient? {
        if (store.servers.none { it.origin == origin }) return null
        val url = origin.toHttpUrlOrNull() ?: return null
        val client = following(url, origin)
        return ServerClient(MatineeApi(url, client), client)
    }

    private val connectivity = context.getSystemService(ConnectivityManager::class.java)

    init {
        start()
        // Try again once a network comes up, rather than wait for a tap.
        connectivity.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                scope.launch {
                    val current = _state.value
                    if (current is AuthState.Unreachable && !current.retrying) start()
                }
            }
        })
    }

    /**
     * Offline mode, as Findroid's: the app shows the downloads and leaves the
     * server alone. A TV has no downloads, so it's never offline.
     */
    val offlineMode: Boolean get() = store.offlineMode && !isTv

    /**
     * The server last connected to, as `https://media.example.com`, while
     * it isn't saved, as after removing it: the saved ones are in [servers].
     */
    val lastServer: String?
        get() {
            val last = store.lastServer?.toHttpUrlOrNull() ?: return null
            val key = keyOf(last)
            return if (store.servers.any { it.origin == key }) null else last.display
        }

    /**
     * The server that what an app before saved servers kept, like its
     * downloads, belongs to: the one in use, or the one it last used.
     */
    internal val formerServer: String?
        get() = store.active ?: store.lastServer?.toHttpUrlOrNull()?.let(::keyOf)

    /**
     * Turn offline mode on, straight to the downloads, or off, which checks
     * the server again. It holds across restarts until it's turned off.
     */
    fun setOfflineMode(on: Boolean) {
        store.offlineMode = on && !isTv
        if (on) goOffline() else start()
    }

    /** Check the saved server and session again, unless offline mode keeps the app away from it. */
    fun start() {
        candidate = null
        beforeAdding = null
        val server = origin ?: run {
            _state.value = AuthState.NoServer()
            return
        }
        val client = api ?: MatineeApi(server, http).also { api = it }
        val made = generation
        val user = lastUser
        if (offlineMode && user != null) {
            _state.value = AuthState.Offline(server.display, user)
            return
        }
        // Trying again stays on the unreachable screen, with the button busy.
        _state.value = when (val current = _state.value) {
            is AuthState.Unreachable -> current.copy(retrying = true)
            else -> AuthState.Connecting(server.display)
        }
        scope.launch {
            val sent = token
            val verified = try {
                if (sent != null) client.auth.session().user else null
            } catch (e: IOException) {
                if (generation == made) _state.value = AuthState.Unreachable(server.display, unreachability(e))
                return@launch
            }
            // Signed in, out, or to another server meanwhile: that stands.
            if (generation != made) return@launch
            _state.value = try {
                if (verified != null) {
                    cacheUser(verified)
                    AuthState.SignedIn(server.display, verified)
                } else {
                    // Only a token the server turned down goes. One this device
                    // couldn't decrypt stays saved until a sign-in replaces it.
                    if (sent != null) clearToken()
                    AuthState.SignedOut(server.display, requireApi().auth.config())
                }
            } catch (e: IOException) {
                AuthState.Unreachable(server.display, unreachability(e))
            }
        }
    }

    /**
     * Connect to the server the person typed, like `media.example.com` or
     * `192.168.1.5:8420`, or picked from those found nearby, which tell
     * their [name]. Without a scheme it tries https, then http. A server
     * already saved is switched to. Returns the error to show, or null once
     * connected.
     */
    suspend fun connect(input: String, name: String? = null): String? {
        val candidates = serverCandidates(input)
        if (candidates.isEmpty()) return res.getString(R.string.connect_empty)
        candidates.map(::keyOf).firstOrNull { key -> store.servers.any { it.origin == key } }?.let { saved ->
            switchTo(saved)
            return null
        }
        var failure: String? = null
        for (url in candidates) {
            try {
                val client = MatineeApi(url, base)
                val config = client.auth.config()
                // Gone back, or to another server, while it answered.
                if (_state.value !is AuthState.NoServer) return null
                if (origin == null) {
                    // The first server is saved at once, so the app comes back to its sign-in.
                    store.servers = store.servers + StoredServer(keyOf(url), name = name)
                    activate(url, null)
                    _state.value = AuthState.SignedOut(url.display, config)
                } else {
                    candidate = Candidate(url, name, client)
                    _state.value = AuthState.SignedOut(url.display, config, adding = true)
                }
                return null
            } catch (_: ApiException) {
                failure = res.getString(R.string.connect_not_matinee, url.display)
            } catch (e: IOException) {
                failure = e.message ?: res.getString(R.string.connect_failed, url.display)
            } catch (_: kotlinx.serialization.SerializationException) {
                failure = res.getString(R.string.connect_not_matinee, url.display)
            }
        }
        return failure
    }

    /**
     * Pick a server to add, or back from signing in to one being added to
     * picking again. The server in use stays as it is meanwhile.
     */
    fun addServer() {
        if (beforeAdding == null) beforeAdding = _state.value
        candidate = null
        _state.value = AuthState.NoServer(canCancel = origin != null)
    }

    /** Back from adding a server to the one in use, as it was. */
    fun cancelAdd() {
        if (origin == null) return
        val before = beforeAdding
        candidate = null
        beforeAdding = null
        when (before) {
            // Its clients and session never changed, so it shows again at once.
            is AuthState.SignedIn, is AuthState.Offline -> _state.value = before
            else -> start()
        }
    }

    /**
     * Use the saved server [origin] instead. Still signed in there, it opens
     * once the server confirms the session; else it asks to sign in.
     */
    fun switchTo(origin: String) {
        if (store.servers.none { it.origin == origin }) return
        val url = origin.toHttpUrlOrNull() ?: return
        if (origin == store.active && candidate == null && beforeAdding == null && _state.value is AuthState.SignedIn) return
        if (origin != store.active) store.offlineMode = false
        activate(url, tokens[origin])
        _state.value = AuthState.Connecting(url.display)
        start()
    }

    /**
     * Forget the saved server [origin]. What's on this device for it goes
     * first, with what's waiting sent there if it answers, then its session
     * ends on the server, as far as it answers, and then its token goes.
     * Removing the one in use moves to the next saved server.
     */
    fun removeServer(origin: String) {
        if (store.servers.none { it.origin == origin } || origin in _removing.value) return
        val url = origin.toHttpUrlOrNull()
        val bearer = tokens[origin]
        _removing.update { it + origin }
        scope.launch {
            // Its token stays in [tokens] until the server had its say.
            val client = if (url != null && bearer != null) MatineeApi(url, following(url, origin)) else null
            runCatching { onRemove?.invoke(origin, client) }
            withTimeoutOrNull(SIGN_OUT_TIMEOUT_MS) { runCatching { client?.auth?.signOut() } }
            tokens.remove(origin)
            store.servers = store.servers.filterNot { it.origin == origin }
            _removing.update { it - origin }
            if (origin == store.active) {
                val next = store.servers.firstOrNull()
                if (next != null) {
                    switchTo(next.origin)
                } else {
                    store.offlineMode = false
                    store.active = null
                    this@Session.origin = null
                    token = null
                    candidate = null
                    beforeAdding = null
                    _activeServer.value = null
                    rebind()
                    _state.value = AuthState.NoServer()
                }
            }
            publish()
        }
    }

    /** The URL to open in the browser to sign in, remembering what checks its answer and which server it's for. */
    fun browserSignInUrl(): String {
        val request = BrowserSignIn.create()
        val adding = candidate
        val server = adding?.url ?: checkNotNull(origin) { "not connected" }
        store.pendingSignIn = PendingSignIn(request.state, request.verifier, keyOf(server))
        return (adding?.api ?: requireApi()).paths.authorize(
            redirectUri = BrowserSignIn.REDIRECT_URI,
            state = request.state,
            codeChallenge = request.challenge,
            deviceName = deviceName,
            platform = platform,
        )
    }

    /**
     * The browser came back with a code, for the server whose page it
     * opened, which is saved and used once signed in. Returns the error to
     * show, or null once signed in.
     */
    suspend fun finishBrowserSignIn(uri: Uri): String? {
        val pending = store.pendingSignIn ?: return null
        val code = uri.getQueryParameter("code")
        if (uri.getQueryParameter("state") != pending.state || code == null) {
            return res.getString(R.string.signin_wrong_state)
        }
        store.pendingSignIn = null
        // A sign-in from before saved servers was for the one in use.
        val server = pending.origin?.toHttpUrlOrNull() ?: origin ?: return null
        val adding = candidate?.takeIf { keyOf(it.url) == keyOf(server) }
        return try {
            saveSignIn(server, MatineeApi(server, base).auth.app.token(code, pending.verifier), adding?.name)
            null
        } catch (e: IOException) {
            e.message ?: res.getString(R.string.signin_failed)
        }
    }

    /** Signed in with a code, on the server being signed in to. */
    fun signedIn(session: AppSession) {
        val adding = candidate
        val server = adding?.url ?: origin ?: return
        saveSignIn(server, session, adding?.name)
    }

    /** Keep [session] as [server]'s, saving the server if it's new, and use it. */
    private fun saveSignIn(server: HttpUrl, session: AppSession, name: String?) {
        val key = keyOf(server)
        val sealed = store.seal(session.token)
        val user = encodeUser(session.user)
        val saved = store.servers
        store.servers = if (saved.any { it.origin == key }) {
            saved.map { if (it.origin == key) it.copy(token = sealed, user = user, name = name ?: it.name) else it }
        } else {
            saved + StoredServer(key, sealed, user, name)
        }
        tokens[key] = session.token
        if (key != store.active) store.offlineMode = false
        activate(server, session.token)
        _state.value = AuthState.SignedIn(server.display, session.user)
    }

    /** Make the saved [server] the one in use, with [bearer] as its session. */
    private fun activate(server: HttpUrl, bearer: String?) {
        val key = keyOf(server)
        store.active = key
        store.lastServer = key
        origin = server
        token = bearer
        candidate = null
        beforeAdding = null
        _activeServer.value = key
        rebind()
        publish()
    }

    /** The server changed the account, such as its playback preferences. */
    fun updateUser(user: User) {
        val current = _state.value as? AuthState.SignedIn ?: return
        cacheUser(user)
        _state.value = current.copy(user = user)
    }

    private fun cacheUser(user: User) {
        val key = store.active ?: return
        changeSaved(key) { it.copy(user = encodeUser(user)) }
    }

    /** The account last signed in to the server in use, while its session still stands. */
    val lastUser: User?
        get() {
            if (token == null) return null
            val key = store.active ?: return null
            return store.servers.firstOrNull { it.origin == key }?.user?.let(::decodeUser)
        }

    /** Show the downloads, without the server. [setOfflineMode] keeps it so. */
    private fun goOffline() {
        if (isTv) return start()
        val server = origin ?: return
        val user = lastUser ?: return
        _state.value = AuthState.Offline(server.display, user)
    }

    /** Sign out of the server in use. The others stay signed in, and it stays saved. */
    fun signOut() {
        val client = api
        val made = generation
        scope.launch {
            runCatching { client?.auth?.signOut() }
            // Unless another sign-in came while the server answered.
            if (generation != made) return@launch
            clearToken()
            start()
        }
    }

    private fun unreachability(e: IOException): Unreachability {
        val network = connectivity.getNetworkCapabilities(connectivity.activeNetwork)
        return when {
            network?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) != true -> Unreachability.NoNetwork
            e is UnknownHostException -> Unreachability.NotFound
            e is ConnectException -> Unreachability.Refused
            e is SocketTimeoutException -> Unreachability.Timeout
            e is SSLException -> Unreachability.Certificate
            else -> Unreachability.Other
        }
    }

    /** The server in use signed out: its token and account go, it stays saved. */
    private fun clearToken() {
        // Offline mode needs the account it shows the downloads of.
        store.offlineMode = false
        token = null
        store.active?.let { key ->
            tokens.remove(key)
            changeSaved(key) { it.copy(token = null, user = null) }
        }
        rebind()
    }

    private fun changeSaved(key: String, change: (StoredServer) -> StoredServer) {
        store.servers = store.servers.map { if (it.origin == key) change(it) else it }
        publish()
    }

    private fun publish() {
        _servers.value = savedServers()
    }

    private fun savedServers(): List<SavedServer> {
        val active = store.active
        return store.servers.mapNotNull { saved ->
            val url = saved.origin.toHttpUrlOrNull() ?: return@mapNotNull null
            val user = if (tokens.containsKey(saved.origin)) saved.user?.let(::decodeUser) else null
            SavedServer(saved.origin, url.display, saved.name, user, saved.origin == active)
        }
    }

    /**
     * Every saved origin in one form, so the app can look servers up by it,
     * and the one in use among them. It never drops a session: of two
     * entries for one server, the one signed in stays, and an origin that
     * doesn't parse stays as it is.
     */
    private fun normalizeSaved() {
        val saved = store.servers
        val fixed = saved
            .map { server -> server.origin.toHttpUrlOrNull()?.let { server.copy(origin = keyOf(it)) } ?: server }
            .groupBy { it.origin }
            .map { (_, same) -> same.firstOrNull { it.token != null } ?: same.first() }
        if (fixed != saved) store.servers = fixed
        val usable = fixed.filter { it.origin.toHttpUrlOrNull() != null }
        val active = store.active
        val fixedActive = active?.toHttpUrlOrNull()?.let(::keyOf)?.takeIf { key -> usable.any { it.origin == key } }
            ?: usable.firstOrNull()?.origin
        if (fixedActive != active) store.active = fixedActive
    }

    /**
     * Watch Next's rows belong to one account on one server: this names
     * them, from the server in use and its account, which stay while
     * another server is being added.
     */
    internal fun identity(): String? {
        val key = store.active ?: return null
        val url = key.toHttpUrlOrNull() ?: return null
        val user = lastUser ?: return null
        return "${Paths(url).artwork("identity")}\n${user.id}"
    }

    companion object {
        private const val SIGN_OUT_TIMEOUT_MS = 10_000L

        private fun sameOrigin(url: HttpUrl, origin: HttpUrl) =
            url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port

        /** The form a server's origin is saved and looked up in: `https://media.example.com/`. */
        internal fun keyOf(url: HttpUrl): String =
            HttpUrl.Builder().scheme(url.scheme).host(url.host).port(url.port).build().toString()

        private fun encodeUser(user: User) = MatineeJson.encodeToString(User.serializer(), user)

        private fun decodeUser(json: String): User? = runCatching { decodeSaved(User.serializer(), json) }.getOrNull()

        /** The origins to try for what the person typed. Matinee lives at an origin's root. */
        fun serverCandidates(input: String): List<HttpUrl> {
            val text = input.trim().trimEnd('/')
            if (text.isEmpty()) return emptyList()
            val schemes = if ("://" in text) listOf("") else listOf("https://", "http://")
            return schemes.mapNotNull { scheme ->
                "$scheme$text".toHttpUrlOrNull()?.newBuilder()
                    ?.encodedPath("/")?.query(null)?.fragment(null)?.build()
            }.filter { it.scheme == "http" || it.scheme == "https" }
        }
    }
}
