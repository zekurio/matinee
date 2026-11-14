package io.github.zekurio.matinee.ui.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * A dialog as the web's: a popover panel, `rounded-xl` with a hairline ring,
 * at most `max-w-sm` and 16dp clear of the screen's edges, its title and
 * [description] over [content], and its buttons in a footer under a line.
 * On a phone the web stacks the buttons full width, the main one on top, so
 * [footer] lists them in that order. [centered] centers the title, as the
 * web's alert dialogs do on a phone.
 */
@Composable
fun Dialog(
    onDismissRequest: () -> Unit,
    title: String,
    footer: @Composable ColumnScope.() -> Unit,
    description: String? = null,
    centered: Boolean = false,
    content: (@Composable ColumnScope.() -> Unit)? = null,
) {
    androidx.compose.ui.window.Dialog(onDismissRequest, DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier
                .padding(horizontal = 16.dp)
                .widthIn(max = 384.dp)
                .fillMaxWidth()
                .shadow(24.dp, Shapes.Xl)
                .clip(Shapes.Xl)
                .background(Palette.Raised)
                .border(1.dp, Palette.Ring, Shapes.Xl),
        ) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Column(
                    Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
                ) {
                    val align = if (centered) TextAlign.Center else TextAlign.Start
                    // text-base font-medium
                    Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, textAlign = align)
                    if (description != null) {
                        Text(description, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, textAlign = align)
                    }
                }
                content?.invoke(this)
            }
            HorizontalDivider(color = Palette.Border)
            // The web's footer is bg-muted/50, which on the popover is the popover.
            Column(
                Modifier.fillMaxWidth().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                content = footer,
            )
        }
    }
}

/** A footer button, full width as the web's are on a phone. */
@Composable
fun DialogButton(label: String, onClick: () -> Unit, look: ButtonLook = ButtonLook.Outline, enabled: Boolean = true) {
    MatineeButton(onClick = onClick, modifier = Modifier.fillMaxWidth(), look = look, enabled = enabled) {
        Text(label)
    }
}

/**
 * Asks before something that can't be undone, as the web's AlertDialog:
 * [confirm] names it, in the destructive look unless it's harmless.
 */
@Composable
fun ConfirmDialog(
    title: String,
    body: String?,
    confirm: String,
    onConfirm: () -> Unit,
    destructive: Boolean = true,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        title = title,
        description = body,
        centered = true,
        footer = {
            DialogButton(confirm, {
                onDismiss()
                onConfirm()
            }, look = if (destructive) ButtonLook.Destructive else ButtonLook.Primary)
            DialogButton(stringResource(R.string.common_cancel), onDismiss)
        },
    )
}
