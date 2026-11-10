package io.github.zekurio.matinee.ui.settings

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.player.AttemptDiagnostics
import io.github.zekurio.matinee.ui.player.AttemptOutcome
import io.github.zekurio.matinee.ui.player.PlaybackDiagnostics
import io.github.zekurio.matinee.ui.player.SourceMode
import io.github.zekurio.matinee.ui.player.formatReport
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.launch

/**
 * The report of the latest playback, in Settings, Playback: what it holds
 * and what it leaves out, how the last try went, and ways to read, copy,
 * and clear it. It reads the report kept in memory, so it's there after
 * the player closes.
 */
@Composable
fun PlaybackDiagnosticsSection() {
    val context = LocalContext.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val report by PlaybackDiagnostics.latest.collectAsState()
    val text = remember(report) { report?.let(::formatReport) }
    var open by remember { mutableStateOf(false) }
    val copied = stringResource(R.string.diagnostics_copied)
    val copy = { value: String ->
        context.copyReport(value)
        // Android 13 and later confirm a copy themselves.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) scope.launch { snackbar.showSnackbar(copied) }
    }
    Section(stringResource(R.string.diagnostics_title)) {
        Text(stringResource(R.string.diagnostics_privacy), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        Gap(14.dp)
        Panel {
            val latest = report?.latest
            if (text == null || latest == null) {
                Text(
                    stringResource(R.string.diagnostics_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Muted,
                    modifier = Modifier.padding(16.dp),
                )
            } else {
                ValueRow(stringResource(R.string.diagnostics_latest), statusLabel(latest))
                RowDivider()
                LinkRow(stringResource(R.string.diagnostics_show)) { open = true }
                RowDivider()
                LinkRow(stringResource(R.string.diagnostics_copy)) { copy(text) }
                RowDivider()
                LinkRow(stringResource(R.string.diagnostics_clear), destructive = true) {
                    open = false
                    PlaybackDiagnostics.clear()
                }
            }
        }
    }
    if (open && text != null) {
        AlertDialog(
            onDismissRequest = { open = false },
            containerColor = Palette.Raised,
            title = { Text(stringResource(R.string.diagnostics_title)) },
            text = {
                Column(Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState())) {
                    SelectionContainer {
                        Text(text, fontFamily = FontFamily.Monospace, fontSize = 12.sp, lineHeight = 16.sp)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { copy(text) }) { Text(stringResource(R.string.diagnostics_copy), color = Palette.Foreground) }
            },
            dismissButton = {
                TextButton(onClick = { open = false }) { Text(stringResource(R.string.diagnostics_close), color = Palette.Foreground) }
            },
        )
    }
}

/** "Failed (stream)": how the latest try went, and with which source. */
@Composable
private fun statusLabel(attempt: AttemptDiagnostics): String {
    val mode = stringResource(
        when (attempt.mode) {
            SourceMode.DIRECT -> R.string.diagnostics_mode_direct
            SourceMode.STREAM -> R.string.diagnostics_mode_stream
            SourceMode.HLS, SourceMode.ENCODE -> R.string.diagnostics_mode_hls
            SourceMode.LOCAL -> R.string.diagnostics_mode_local
        },
    )
    return stringResource(
        when (attempt.outcome) {
            AttemptOutcome.LOADING -> R.string.diagnostics_status_loading
            AttemptOutcome.PLAYING -> R.string.diagnostics_status_playing
            AttemptOutcome.FAILED -> R.string.diagnostics_status_failed
            AttemptOutcome.REPLACED -> R.string.diagnostics_status_replaced
            AttemptOutcome.CLOSED -> R.string.diagnostics_status_closed
        },
        mode,
    )
}

/** Puts the report on the clipboard, as plain text the viewer pastes where they like. */
private fun Context.copyReport(text: String) {
    val clipboard = getSystemService(ClipboardManager::class.java) ?: return
    clipboard.setPrimaryClip(ClipData.newPlainText(getString(R.string.diagnostics_title), text))
}
