package io.github.zekurio.matinee.ui.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette

/** The toasts waiting to show, one at a time: `showSnackbar(message)` adds one. */
typealias ToastState = SnackbarHostState

/**
 * Where toasts show. Each is drawn by [toast], by default as the web's
 * sonner toasts are on a phone: full width, 16dp in from the edges.
 */
@Composable
fun ToastHost(state: ToastState, modifier: Modifier = Modifier, toast: @Composable (message: String) -> Unit = { Toast(it) }) {
    SnackbarHost(state, modifier) { data -> toast(data.visuals.message) }
}

/** One toast: the popover's color, `rounded-xl`, a border, and a shadow under it. */
@Composable
fun Toast(message: String, modifier: Modifier = Modifier) {
    Text(
        message,
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = FontWeight.Medium,
        color = Palette.Foreground,
        modifier = modifier
            .padding(16.dp)
            .fillMaxWidth()
            .shadow(16.dp, Shapes.Xl)
            .clip(Shapes.Xl)
            .background(Palette.Raised)
            .border(1.dp, Palette.Border, Shapes.Xl)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    )
}
