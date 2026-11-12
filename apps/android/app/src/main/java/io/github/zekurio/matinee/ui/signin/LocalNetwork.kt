package io.github.zekurio.matinee.ui.signin

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import io.github.zekurio.matinee.auth.localNetworkPermission

/**
 * Runs an action once Android has been asked for local network access, or at
 * once when it needn't be. The action runs whatever the answer: a server on
 * the internet works without it, and one on the LAN fails with its own error.
 * Asks again each time it's still missing, since Settings can take it back.
 */
@Composable
fun rememberLocalNetworkAccess(): (() -> Unit) -> Unit {
    val context = LocalContext.current
    val pending = remember { mutableStateOf<(() -> Unit)?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        val action = pending.value
        pending.value = null
        action?.invoke()
    }
    return remember(context, launcher) {
        { action ->
            val needed = localNetworkPermission(context)
            if (needed == null) {
                action()
            } else {
                pending.value = action
                launcher.launch(needed)
            }
        }
    }
}
