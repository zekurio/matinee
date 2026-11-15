package io.github.zekurio.matinee.ui.requests

import androidx.compose.runtime.Composable
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.components.LocalApi

/**
 * What requests need around the phone's signed-in app, while it's open:
 * an admin's queue, streamed once for the dot, the queue, and title pages.
 */
@Composable
fun RequestsAround() {
    val api = LocalApi.current
    val hub = LocalRequests.current
    val admin = LocalUser.current.isAdmin
    FollowStream(admin, enabled = admin, open = { api.admin.requests.live(limit = 1) }, onEach = { hub.queue = it })
}
