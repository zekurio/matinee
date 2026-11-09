package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.MatineeTextField
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlinx.coroutines.launch

/* What the admin pages share: loading the server's settings, saving them,
 * text rows, and asking before something can't be undone. */

/**
 * The page's data from [loader]: a spinner while it loads, the error when
 * it doesn't, which [failed] words, and then [content].
 */
internal fun <T> LazyListScope.loaded(loader: Loader<T>, failed: @Composable (String) -> String, content: LazyListScope.(T) -> Unit) {
    when (val state = loader.state) {
        Load.Loading -> item(key = "loading") {
            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Palette.Accent)
            }
        }
        is Load.Failed -> item(key = "failed") {
            Column {
                Text(failed(state.message), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                Gap(12.dp)
                MatineeButton(onClick = loader::reload, look = ButtonLook.Outline) { Text(stringResource(R.string.common_retry)) }
            }
        }
        is Load.Ready -> content(state.value)
    }
}

/** Runs a save, one at a time, showing what went wrong at the bottom. */
internal class Saver(private val run: (suspend () -> Unit) -> Unit, private val busy: () -> Boolean) {
    val saving get() = busy()

    operator fun invoke(block: suspend () -> Unit) = run(block)
}

@Composable
internal fun rememberSaver(): Saver {
    val scope = rememberCoroutineScope()
    val snackbar = LocalSnackbar.current
    val failure = stringResource(R.string.web_common_saveBar_failed)
    var saving by remember { mutableStateOf(false) }
    return remember(scope) {
        Saver(
            run = { block ->
                if (!saving) {
                    saving = true
                    scope.launch {
                        try {
                            block()
                        } catch (e: IOException) {
                            snackbar.showSnackbar(e.message?.let { "$failure $it" } ?: failure)
                        } finally {
                            saving = false
                        }
                    }
                }
            },
            busy = { saving },
        )
    }
}

/** Save and reset, for a page whose fields wait to be saved together, while any changed. */
@Composable
internal fun SaveButtons(dirty: Boolean, saver: Saver, onReset: () -> Unit, onSave: () -> Unit) {
    if (!dirty && !saver.saving) return
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        MatineeButton(onClick = onSave, enabled = !saver.saving, modifier = Modifier.weight(1f)) {
            if (saver.saving) CircularProgressIndicator(Modifier.size(18.dp), color = Palette.Background, strokeWidth = 2.dp)
            Text(stringResource(if (saver.saving) R.string.web_common_saveBar_saving else R.string.web_common_saveBar_save))
        }
        MatineeButton(onClick = onReset, look = ButtonLook.Ghost, enabled = !saver.saving) {
            Text(stringResource(R.string.web_common_saveBar_reset))
        }
    }
}

/** A text field in a panel, its name above it. */
@Composable
internal fun TextRow(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    placeholder: String? = null,
    keyboard: KeyboardType = KeyboardType.Text,
    error: String? = null,
    secret: Boolean = false,
) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
        Gap(6.dp)
        MatineeTextField(
            value = value,
            onValueChange = onChange,
            placeholder = placeholder,
            isError = error != null,
            keyboardOptions = KeyboardOptions(keyboardType = if (secret) KeyboardType.Password else keyboard, autoCorrectEnabled = false),
            visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        )
        if (error != null) {
            Gap(4.dp)
            Text(error, style = MaterialTheme.typography.bodySmall, color = Palette.Danger)
        }
    }
}

/** Asks before something that can't be undone; [confirm] names it. */
@Composable
internal fun ConfirmDialog(title: String, body: String?, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Palette.Raised,
        title = { Text(title) },
        text = body?.let { { Text(it, color = Palette.Muted) } },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                onConfirm()
            }) { Text(confirm, color = Palette.Danger) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel), color = Palette.Foreground) }
        },
    )
}

/** Small muted lines under a panel, for what a page has to say about itself. */
@Composable
internal fun Note(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
}
