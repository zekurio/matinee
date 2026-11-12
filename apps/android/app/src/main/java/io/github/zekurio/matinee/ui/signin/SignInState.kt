package io.github.zekurio.matinee.ui.signin

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.AppDevice
import io.github.zekurio.matinee.api.AppSession
import io.github.zekurio.matinee.api.DeviceCode
import io.github.zekurio.matinee.api.DeviceSignIn
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.auth.Unreachability
import io.github.zekurio.matinee.auth.localNetworkPermission
import io.github.zekurio.matinee.ui.describeFailure
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/* What the sign-in screens do, apart from how they look, for the phone's screens and the TV's alike. */

/** Connecting to the server the person typed or picked: whether it's under way, and what went wrong. */
@Stable
class ServerConnect internal constructor(
    private val session: Session,
    private val scope: CoroutineScope,
    private val withLocalNetwork: (() -> Unit) -> Unit,
    private val localNetworkHint: () -> String?,
) {
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    /**
     * Try [address], unless a try is under way, asking for local network
     * access first where Android needs it. Once it answers, the session
     * moves on to signing in. [name] is what a server found nearby calls itself.
     */
    fun connect(address: String, name: String? = null) {
        if (busy) return
        busy = true
        error = null
        withLocalNetwork {
            scope.launch {
                // Without the access a LAN server only says it can't be reached.
                error = session.connect(address, name)?.let { failure ->
                    localNetworkHint()?.let { "$failure\n$it" } ?: failure
                }
                busy = false
            }
        }
    }

    fun clearError() {
        error = null
    }
}

@Composable
fun rememberServerConnect(session: Session): ServerConnect {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val withLocalNetwork = rememberLocalNetworkAccess()
    return remember(session, withLocalNetwork) {
        ServerConnect(session, scope, withLocalNetwork) {
            localNetworkPermission(context)?.let { context.getString(R.string.connect_local_network) }
        }
    }
}

/**
 * The OAuth device grant under way: the code to show once it came, and
 * what went wrong. [expired] once the code ran out, when it isn't renewed
 * on its own. A poll that fails tries again on its own.
 */
@Stable
class DeviceCodeState internal constructor() {
    var code by mutableStateOf<DeviceCode?>(null)
        internal set
    var error by mutableStateOf<String?>(null)
        internal set
    var expired by mutableStateOf(false)
        internal set
    internal var attempt by mutableIntStateOf(0)

    /** Start again with a new code: after one expired, or never came. */
    fun newCode() {
        attempt++
    }
}

/**
 * Starts the device grant and polls until someone signed in approves this
 * device, then signs the session in. A code that expires is replaced at
 * once when [renewExpired], with a new QR code; otherwise [DeviceCodeState.expired]
 * says so and waits for [DeviceCodeState.newCode].
 */
@Composable
fun rememberDeviceCode(session: Session, renewExpired: Boolean): DeviceCodeState {
    val state = remember { DeviceCodeState() }
    val resources = LocalContext.current.resources
    LaunchedEffect(state.attempt) {
        // A server being added, before it's saved, or the one in use.
        val api = session.signInApi()
        state.error = null
        state.expired = false
        val started = try {
            api.auth.device.start(AppDevice(session.deviceName, session.platform))
        } catch (e: IOException) {
            state.error = describeFailure(resources, e)
            return@LaunchedEffect
        }
        state.code = started
        while (true) {
            delay(started.interval * 1000L)
            val answer = try {
                api.auth.device.poll(started.deviceCode)
            } catch (e: ApiException) {
                // The code expired: get a new one, and with it a new QR code.
                if (e.status == 404) {
                    if (renewExpired) {
                        state.attempt++
                    } else {
                        state.code = null
                        state.expired = true
                    }
                    return@LaunchedEffect
                }
                state.error = describeFailure(resources, e)
                continue
            } catch (e: IOException) {
                // Wi-Fi dropping, or Android cutting off the network while
                // the browser has the screen: keep asking about the same
                // code, which someone may have approved meanwhile.
                state.error = describeFailure(resources, e)
                continue
            }
            state.error = null
            if (answer is DeviceSignIn.Approved) {
                session.signedIn(AppSession(answer.token, answer.user))
                return@LaunchedEffect
            }
        }
    }
    return state
}

/** Why the saved server didn't answer, in a line. [canWatchOffline] when the downloads still play. */
@Composable
fun unreachableMessage(reason: Unreachability, server: String, canWatchOffline: Boolean): String {
    val host = server.substringAfter("://")
    return when (reason) {
        Unreachability.NoNetwork ->
            stringResource(if (canWatchOffline) R.string.unreachable_offline_downloads else R.string.unreachable_offline)
        Unreachability.Refused -> stringResource(R.string.unreachable_refused, host)
        Unreachability.NotFound -> stringResource(R.string.unreachable_not_found, host)
        Unreachability.Timeout -> stringResource(R.string.unreachable_timeout, host)
        Unreachability.Certificate -> stringResource(R.string.unreachable_certificate, host)
        Unreachability.Other -> stringResource(R.string.unreachable_other, host)
    }
}
