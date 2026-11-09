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
import io.github.zekurio.matinee.api.User
import io.github.zekurio.matinee.downloads.AccountScope
import io.github.zekurio.matinee.downloads.canonicalServer
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient

/** Where the app is between picking a server and using it. */
sealed interface AuthState {
    data object NoServer : AuthState

    data class Connecting(val server: String) : AuthState

    /**
     * A saved server that didn't answer; the app offers to try again, and
     * does on its own when the network comes back. [retrying] while it does.
     */
    data class Unreachable(val server: String, val reason: Unreachability, val retrying: Boolean = false) : AuthState

    data class SignedOut(val server: String, val config: AuthConfig) : AuthState

    data class SignedIn(val server: String, val user: User) : AuthState

    /** The server is away, and the app shows what's downloaded. */
    data class Offline(val server: String, val user: User) : AuthState
}

/**
 * Who the app acts for: the server's origin ([canonicalServer]), the account
 * on it, and which sign-in. A new token, even for the same account, is a new
 * [generation].
 */
data class SessionIdentity(val server: String, val userId: String, val generation: Long) {
    val scope: AccountScope get() = AccountScope(server, userId)
}

/**
 * An identity with the API and HTTP client that act for it. They send its
 * token and no other, and fail with [IdentityChanged] once it's replaced, so
 * work started for one account can't go on as the next.
 */
class SessionBinding(val identity: SessionIdentity, val api: MatineeApi, val http: OkHttpClient)

/** A request made for a sign-in that has since ended. */
class IdentityChanged : IOException("The account signed in changed.")

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
 * The server, the session on it, and the HTTP client every part of the app
 * shares: the API, artwork, and the player. The client adds the session
 * token to requests for the server's origin and nowhere else.
 */
class Session(context: Context) {
    private val res = context.applicationContext.resources
    private val store = SessionStore(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @Volatile private var origin: HttpUrl? = store.server?.toHttpUrlOrNull()
    @Volatile private var token: String? = store.token

    /** Moves whenever [origin] or [token] does; clients made before it stop sending their token. */
    @Volatile private var generation = 0L

    private val _state = MutableStateFlow<AuthState>(AuthState.NoServer)
    val state: StateFlow<AuthState> = _state.asStateFlow()

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
            if (bearer != null && generation != made) throw IdentityChanged()
            val request = chain.request()
            val builder = request.newBuilder()
            if (server != null && bearer != null && sameOrigin(request.url, server)) {
                builder.header("Authorization", "Bearer $bearer")
            }
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
     * Sends whichever token is the session's at the time, for a client made
     * once for the whole run, like the image loader's. Only for artwork.
     */
    val artworkHttp: OkHttpClient = base.newBuilder()
        .addInterceptor { chain ->
            val request = chain.request()
            val server = origin
            val bearer = token
            val builder = request.newBuilder()
            if (server != null && bearer != null && sameOrigin(request.url, server)) {
                builder.header("Authorization", "Bearer $bearer")
            }
            chain.proceed(builder.build())
        }
        .build()

    @Volatile var api: MatineeApi? = origin?.let { MatineeApi(it, http) }
        private set

    private val _binding = MutableStateFlow<SessionBinding?>(null)

    /** Who the app acts for, while a token and its account are known, as when offline. */
    val binding: StateFlow<SessionBinding?> = _binding.asStateFlow()

    /** A new server or token: new clients, and the old ones stop. */
    private fun rebind() {
        generation++
        http = bound(origin, token, generation)
        api = origin?.let { MatineeApi(it, http) }
        publish(null)
    }

    /** Say who the app acts for now that [user] is known for the token, or no one. */
    private fun publish(user: User?) {
        val server = origin
        val client = api
        val next = if (server != null && client != null && token != null && user != null) {
            SessionBinding(SessionIdentity(canonicalServer(server), user.id, generation), client, http)
        } else {
            null
        }
        if (_binding.value?.identity != next?.identity) _binding.value = next
    }

    /** The API while signed in. Screens only show then. */
    fun requireApi(): MatineeApi = checkNotNull(api) { "not connected" }

    private val connectivity = context.getSystemService(ConnectivityManager::class.java)

    init {
        publish(lastUser)
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

    /** Offline mode, as Findroid's: the app shows the downloads and leaves the server alone. */
    val offlineMode: Boolean get() = store.offlineMode

    /**
     * Turn offline mode on, straight to the downloads, or off, which checks
     * the server again. It holds across restarts until it's turned off.
     */
    fun setOfflineMode(on: Boolean) {
        store.offlineMode = on
        if (on) goOffline() else start()
    }

    /** Check the saved server and session again, unless offline mode keeps the app away from it. */
    fun start() {
        val server = origin ?: run {
            _state.value = AuthState.NoServer
            return
        }
        val client = api ?: MatineeApi(server, http).also { api = it }
        val made = generation
        val user = lastUser
        if (store.offlineMode && user != null) {
            _state.value = AuthState.Offline(server.display, user)
            return
        }
        // Trying again stays on the unreachable screen, with the button busy.
        _state.value = when (val current = _state.value) {
            is AuthState.Unreachable -> current.copy(retrying = true)
            else -> AuthState.Connecting(server.display)
        }
        scope.launch {
            val user = try {
                if (token != null) client.session() else null
            } catch (e: IOException) {
                if (generation == made) _state.value = AuthState.Unreachable(server.display, unreachability(e))
                return@launch
            }
            // Signed in, out, or to another server meanwhile: that stands.
            if (generation != made) return@launch
            _state.value = try {
                if (user != null) {
                    cacheUser(user)
                    AuthState.SignedIn(server.display, user)
                } else {
                    clearToken()
                    AuthState.SignedOut(server.display, requireApi().authConfig())
                }
            } catch (e: IOException) {
                AuthState.Unreachable(server.display, unreachability(e))
            }
        }
    }

    /**
     * Point the app at the server the person typed, like `media.example.com`
     * or `192.168.1.5:8420`. Without a scheme it tries https, then http.
     * Returns the error to show, or null once connected.
     */
    suspend fun connect(input: String): String? {
        val candidates = serverCandidates(input)
        if (candidates.isEmpty()) return res.getString(R.string.connect_empty)
        var failure: String? = null
        for (candidate in candidates) {
            try {
                val config = MatineeApi(candidate, http).authConfig()
                origin = candidate
                store.server = candidate.toString()
                clearToken()
                _state.value = AuthState.SignedOut(candidate.display, config)
                return null
            } catch (_: ApiException) {
                failure = res.getString(R.string.connect_not_matinee, candidate.display)
            } catch (e: IOException) {
                failure = e.message ?: res.getString(R.string.connect_failed, candidate.display)
            } catch (_: kotlinx.serialization.SerializationException) {
                failure = res.getString(R.string.connect_not_matinee, candidate.display)
            }
        }
        return failure
    }

    /** Back to picking a server. */
    fun forgetServer() {
        store.offlineMode = false
        origin = null
        store.server = null
        clearToken()
        _state.value = AuthState.NoServer
    }

    /** The URL to open in the browser to sign in, remembering what checks its answer. */
    fun browserSignInUrl(): String {
        val request = BrowserSignIn.create()
        store.pendingSignIn = request.state to request.verifier
        return requireApi().paths.authorize(
            redirectUri = BrowserSignIn.REDIRECT_URI,
            state = request.state,
            codeChallenge = request.challenge,
            deviceName = deviceName,
            platform = platform,
        )
    }

    /** The browser came back with a code. Returns the error to show, or null once signed in. */
    suspend fun finishBrowserSignIn(uri: Uri): String? {
        val pending = store.pendingSignIn ?: return null
        val code = uri.getQueryParameter("code")
        if (uri.getQueryParameter("state") != pending.first || code == null) {
            return res.getString(R.string.signin_wrong_state)
        }
        store.pendingSignIn = null
        return try {
            signedIn(requireApi().appToken(code, pending.second))
            null
        } catch (e: IOException) {
            e.message ?: res.getString(R.string.signin_failed)
        }
    }

    fun signedIn(session: AppSession) {
        val server = origin ?: return
        token = session.token
        store.token = session.token
        rebind()
        cacheUser(session.user)
        _state.value = AuthState.SignedIn(server.display, session.user)
    }

    /** The server changed the account, such as its playback preferences. */
    fun updateUser(user: User) {
        val current = _state.value as? AuthState.SignedIn ?: return
        cacheUser(user)
        _state.value = current.copy(user = user)
    }

    private fun cacheUser(user: User) {
        store.lastUser = MatineeJson.encodeToString(User.serializer(), user)
        publish(user)
    }

    /** The account last signed in here, while its session still stands. */
    val lastUser: User?
        get() = if (token == null) null else store.lastUser?.let {
            runCatching { MatineeJson.decodeFromString(User.serializer(), it) }.getOrNull()
        }

    /** Show the downloads, without the server. [setOfflineMode] keeps it so. */
    private fun goOffline() {
        val server = origin ?: return
        val user = lastUser ?: return
        _state.value = AuthState.Offline(server.display, user)
    }

    fun signOut() {
        val client = api
        val made = generation
        scope.launch {
            runCatching { client?.signOut() }
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

    private fun clearToken() {
        // Offline mode needs the account it shows the downloads of.
        store.offlineMode = false
        token = null
        store.token = null
        store.lastUser = null
        rebind()
    }

    companion object {
        private fun sameOrigin(url: HttpUrl, origin: HttpUrl) =
            url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port

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
