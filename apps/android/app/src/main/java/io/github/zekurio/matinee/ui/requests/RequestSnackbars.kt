package io.github.zekurio.matinee.ui.requests

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.Navigator
import io.github.zekurio.matinee.ui.components.LocalApi
import kotlinx.coroutines.launch

/**
 * What requests need around the phone's signed-in app, while it's open:
 * an admin's queue, streamed once for the dot, the queue, and the strips;
 * the notification permission, asked for after the first request; and
 * the page a tapped notification leads to. New notifications aren't shown
 * while the app is open; the background check posts them.
 */
@Composable
fun RequestsAround(session: Session) {
    val api = LocalApi.current
    val hub = LocalRequests.current
    val admin = LocalUser.current.isAdmin
    FollowStream(admin, enabled = admin, open = { api.admin.requests.live(limit = 1) }, onEach = { hub.queue = it })
    PermissionAfterAsk()
    OpenFromNotification(session)
}

private fun open(nav: Navigator, target: OpenTarget) {
    when (target) {
        is OpenTarget.Title -> nav.title(target.titleId)
        is OpenTarget.Catalog -> nav.catalog(io.github.zekurio.matinee.api.CatalogRef(target.kind, target.provider, target.providerId))
        is OpenTarget.Queue -> nav.requests(target.list)
    }
}

/**
 * Asks for the notification permission once, after the first ask or
 * "Notify me", when telling the person something is ready starts to
 * matter. Android before 13 has no such permission.
 */
@Composable
private fun PermissionAfterAsk() {
    val hub = LocalRequests.current
    val context = LocalContext.current
    val app = context.app
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { app.scheduleNotices() }
    LaunchedEffect(hub.wantsPermission) {
        if (!hub.wantsPermission) return@LaunchedEffect
        hub.wantsPermission = false
        if (app.notices.askedPermission) return@LaunchedEffect
        app.notices.askedPermission = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsAllowed(context)) {
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

/** The page a tapped notification leads to, on the server it came from. */
@Composable
private fun OpenFromNotification(session: Session) {
    val app = LocalContext.current.app
    val nav = LocalNavigator.current
    val target by app.opening.collectAsState()
    LaunchedEffect(target) {
        val wanted = target ?: return@LaunchedEffect
        app.opening.value = null
        if (wanted.server == session.activeServer.value) open(nav, wanted)
    }
}
