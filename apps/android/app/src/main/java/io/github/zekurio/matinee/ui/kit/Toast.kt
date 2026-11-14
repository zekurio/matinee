package io.github.zekurio.matinee.ui.kit

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.indication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * The toasts waiting to show, one at a time: `showSnackbar(message)` adds
 * one, with an `actionLabel` for a button and `withDismissAction` for a
 * close button. `SnackbarDuration` and `SnackbarResult` say how long it
 * stays and what was pressed; they are [ToastDuration] and [ToastResult].
 */
typealias ToastState = SnackbarHostState

typealias ToastDuration = androidx.compose.material3.SnackbarDuration

typealias ToastResult = androidx.compose.material3.SnackbarResult

/**
 * Where toasts show. Each is drawn by [toast] when it's given, from its
 * message alone; otherwise as the web's sonner toasts are on a phone, full
 * width, 16dp in from the edges, with its action and close button.
 */
@Composable
fun ToastHost(state: ToastState, modifier: Modifier = Modifier, toast: (@Composable (message: String) -> Unit)? = null) {
    SnackbarHost(state, modifier) { data ->
        val visuals = data.visuals
        if (toast != null) {
            toast(visuals.message)
        } else {
            Toast(
                visuals.message,
                action = visuals.actionLabel,
                onAction = data::performAction,
                onClose = if (visuals.withDismissAction) data::dismiss else null,
            )
        }
    }
}

/**
 * One toast: the popover's color, `rounded-xl`, a border, and a shadow
 * under it. An [action] sits under the message at the end, in the
 * primary color, as sonner's button does; [onClose] adds the round close
 * button over the top corner.
 */
@Composable
fun Toast(message: String, modifier: Modifier = Modifier, action: String? = null, onAction: () -> Unit = {}, onClose: (() -> Unit)? = null) {
    Box(modifier.padding(16.dp).fillMaxWidth()) {
        Column(
            Modifier
                .fillMaxWidth()
                .shadow(16.dp, Shapes.Xl)
                .clip(Shapes.Xl)
                .background(Palette.Raised)
                .border(1.dp, Palette.Border, Shapes.Xl)
                // A button's finger room stands in for the bottom padding.
                .padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = if (action != null) 2.dp else 12.dp),
        ) {
            Text(
                message,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = Palette.Foreground,
            )
            if (action != null) {
                val interaction = remember { MutableInteractionSource() }
                // 28dp tall as the web's, in 48dp a finger can hit.
                Box(
                    Modifier
                        .align(Alignment.End)
                        .minimumInteractiveComponentSize()
                        .clickable(interaction, indication = null, role = Role.Button, onClick = onAction),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier
                            .heightIn(min = 28.dp)
                            .clip(Shapes.Md)
                            .background(Palette.Accent)
                            .indication(interaction, LocalIndication.current)
                            .padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(action, style = MaterialTheme.typography.labelLarge, fontSize = 13.sp, color = Palette.AccentForeground, maxLines = 1)
                    }
                }
            }
        }
        if (onClose != null) {
            // Sonner's close button: a 20dp circle over the top corner, a
            // third of it outside, with a finger's room around it.
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 21.dp, y = (-21).dp)
                    .minimumInteractiveComponentSize()
                    .clickable(interactionSource = null, indication = null, role = Role.Button, onClick = onClose),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(Palette.Raised)
                        .border(1.dp, Palette.Input, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    LucideIcon(Lucide.X, stringResource(R.string.toast_close), size = 12.dp, tint = Palette.Muted)
                }
            }
        }
    }
}
