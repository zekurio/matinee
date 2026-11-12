package io.github.zekurio.matinee.ui.settings.admin

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.keyframes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.Reveal
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.MatineeTextField
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/* What the admin pages share: loading the server's settings, saving them,
 * the save bar for a page whose fields save together, text rows, and
 * asking before something can't be undone. */

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

/** How the save bar's last save went. */
private sealed interface SaveFeedback {
    data object Idle : SaveFeedback
    data object Pending : SaveFeedback
    data object Success : SaveFeedback
    data class Failed(val message: String?) : SaveFeedback
}

/** How long "Saved" shows before the bar goes, as the web's. */
private const val SAVED_MILLIS = 1_400L

/**
 * A settings page whose fields wait to be saved together, as the web's
 * panels with its save bar. The bar sits under the list, outside what
 * scrolls, so it never covers the last rows; it shows while the page has
 * unsaved edits ([dirty]), with Reset and Save, and stays above the
 * keyboard and the navigation bar.
 *
 * Until the edits are saved or reset, it holds the page open, as the web
 * does: back, from the system or the top bar, shakes the bar instead of
 * leaving. The bar reports the save itself: Save turns into "Saved" for a
 * moment before the bar goes, and a failure stays in it with the server's
 * reason until the next attempt or a reset.
 *
 * [canSave] is false while a field holds something that can't be saved;
 * the field says why. [onSave] throws an [IOException] when the save fails.
 */
@Composable
internal fun SaveBarScaffold(
    title: String,
    dirty: Boolean,
    onReset: () -> Unit,
    onSave: suspend () -> Unit,
    canSave: Boolean = true,
    content: LazyListScope.() -> Unit,
) {
    val scope = rememberCoroutineScope()
    var stored by remember { mutableStateOf<SaveFeedback>(SaveFeedback.Idle) }
    // An edit after a save starts a new round, so "Saved" doesn't linger,
    // and a failure goes with the edits it failed to save.
    val feedback = when {
        dirty && stored == SaveFeedback.Success -> SaveFeedback.Idle
        !dirty && stored is SaveFeedback.Failed -> SaveFeedback.Idle
        else -> stored
    }
    LaunchedEffect(stored) {
        if (stored == SaveFeedback.Success) {
            delay(SAVED_MILLIS)
            stored = SaveFeedback.Idle
        }
    }
    val visible = dirty || feedback != SaveFeedback.Idle
    // Bumped on each attempt to leave with unsaved edits; the bar shakes.
    var attention by remember { mutableIntStateOf(0) }
    // Gone until the next edit, which starts calm.
    LaunchedEffect(visible) { if (!visible) attention = 0 }
    val attempt: () -> Unit = { attention++ }
    BackHandler(enabled = dirty, onBack = attempt)
    val pending = feedback == SaveFeedback.Pending
    val save = {
        if (!pending && dirty && canSave) {
            stored = SaveFeedback.Pending
            scope.launch {
                stored = try {
                    onSave()
                    SaveFeedback.Success
                } catch (e: IOException) {
                    SaveFeedback.Failed(e.message?.ifBlank { null })
                }
            }
        }
    }
    // The keyboard pushes the bar up with it, and the list shrinks above it.
    Column(Modifier.fillMaxSize().imePadding()) {
        TopBar(title, onBack = if (dirty) attempt else null)
        LazyColumn(
            Modifier.fillMaxWidth().weight(1f),
            contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 8.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            content()
            // The bar keeps clear of the navigation bar while it shows.
            item(key = "bottom") { Box(if (visible) Modifier else Modifier.navigationBarsPadding()) }
        }
        Reveal(visible) {
            SaveBar(feedback, dirty, canSave, attention, onReset = {
                stored = SaveFeedback.Idle
                onReset()
            }, onSave = save)
        }
    }
}

@Composable
private fun SaveBar(feedback: SaveFeedback, dirty: Boolean, canSave: Boolean, attention: Int, onReset: () -> Unit, onSave: () -> Unit) {
    val shake = remember { Animatable(0f) }
    LaunchedEffect(attention) {
        if (attention > 0) {
            shake.snapTo(0f)
            shake.animateTo(0f, keyframes {
                durationMillis = 360
                -6f at 72
                6f at 144
                -6f at 216
                6f at 288
            })
        }
    }
    val pending = feedback == SaveFeedback.Pending
    Column(Modifier.fillMaxWidth().background(Palette.Raised)) {
        HorizontalDivider(color = Palette.Border)
        Row(
            Modifier
                .graphicsLayer { translationX = shake.value * density }
                .navigationBarsPadding()
                .padding(start = Gutter, end = Gutter - 4.dp, top = 10.dp, bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite }) {
                Text(
                    stringResource(
                        when (feedback) {
                            SaveFeedback.Success -> R.string.web_common_saveBar_saved
                            is SaveFeedback.Failed -> R.string.web_common_saveBar_failed
                            else -> R.string.web_common_saveBar_unsaved
                        },
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (feedback is SaveFeedback.Failed) Palette.Danger else Palette.Foreground,
                )
                if (feedback is SaveFeedback.Failed && feedback.message != null) {
                    Text(feedback.message, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
            }
            MatineeButton(onClick = onReset, look = ButtonLook.Ghost, enabled = dirty && !pending, contentPadding = PaddingValues(horizontal = 12.dp)) {
                Text(stringResource(R.string.web_common_saveBar_reset))
            }
            MatineeButton(
                onClick = onSave,
                enabled = pending || feedback == SaveFeedback.Success || (dirty && canSave),
            ) {
                when (feedback) {
                    SaveFeedback.Pending -> CircularProgressIndicator(Modifier.size(16.dp), color = Palette.AccentForeground, strokeWidth = 2.dp)
                    SaveFeedback.Success -> LucideIcon(Lucide.Check, null, size = 16.dp)
                    else -> {}
                }
                Text(
                    stringResource(
                        when (feedback) {
                            SaveFeedback.Pending -> R.string.web_common_saveBar_saving
                            SaveFeedback.Success -> R.string.web_common_saveBar_done
                            is SaveFeedback.Failed -> R.string.web_common_saveBar_retry
                            SaveFeedback.Idle -> R.string.web_common_saveBar_save
                        },
                    ),
                    maxLines = 1,
                )
            }
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
    trailing: (@Composable () -> Unit)? = null,
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
            trailing = trailing,
        )
        // The last error stays while it closes, so the text doesn't vanish first.
        var shown by remember { mutableStateOf(error) }
        if (error != null) shown = error
        Reveal(error != null) {
            Column {
                Gap(4.dp)
                Text(shown.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Palette.Danger)
            }
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
