package io.github.zekurio.matinee.ui.settings

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import io.github.zekurio.matinee.BuildConfig
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Dialog
import io.github.zekurio.matinee.ui.kit.DialogButton
import java.util.Locale
import kotlinx.coroutines.launch

/**
 * Settings, About: what this app and device are, then the two things to
 * send along when something breaks, the latest playback's report and the
 * app's own log. The TV shows the same in its About category.
 */
@Composable
internal fun AboutPage() {
    SettingsScaffold(stringResource(R.string.about_title)) {
        item(key = "app") {
            Panel {
                appInfo().forEachIndexed { index, (title, value) ->
                    if (index > 0) RowDivider()
                    ValueRow(stringResource(title), value)
                }
            }
        }
        item(key = "report") { PlaybackDiagnosticsSection() }
        item(key = "log") { AppLogSection() }
    }
}

/** The app's version and build, Android's, and the model, as rows of a title and a value. */
internal fun appInfo(): List<Pair<Int, String>> = listOf(
    R.string.about_version to buildString {
        append("${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
        if (BuildConfig.BUILD_TYPE != "release") append(", ${BuildConfig.BUILD_TYPE}")
    },
    R.string.about_android to "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
    R.string.about_device to deviceName(),
)

/** "Google Pixel 8", without the maker twice for a model that names it already. */
private fun deviceName(): String {
    val maker = Build.MANUFACTURER.replaceFirstChar { it.titlecase(Locale.ROOT) }
    return if (Build.MODEL.startsWith(maker, ignoreCase = true)) Build.MODEL else "$maker ${Build.MODEL}"
}

/** What a log takes out wherever it shows: the server's host and the account's names and id. */
internal fun Context.logKnownValues(): KnownValues {
    val (server, user) = when (val state = app.session.state.value) {
        is AuthState.SignedIn -> state.server to state.user
        is AuthState.Offline -> state.server to state.user
        else -> null to null
    }
    return KnownValues.of(server, listOf(user?.username, user?.displayName, user?.id))
}

/** This process's recent log, scrubbed of the server and the account. */
internal suspend fun Context.readOwnLog(): String = readAppLog(Process.myPid(), logKnownValues())

/** Puts [text] on the clipboard as plain text, under [label]. */
internal fun Context.copyText(label: String, text: String) {
    val clipboard = getSystemService(ClipboardManager::class.java) ?: return
    clipboard.setPrimaryClip(ClipData.newPlainText(label, text))
}

/** Offers [text] to the apps that take it, like mail or a messenger. */
private fun Context.shareText(subject: String, text: String) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, subject).putExtra(Intent.EXTRA_TEXT, text)
    runCatching { startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

/**
 * The app's log: shown, copied, or shared, read afresh each time. What it
 * takes out is in the first row's description and the log's own header.
 */
@Composable
private fun AppLogSection() {
    val context = LocalContext.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    var shown by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val title = stringResource(R.string.logs_title)
    val copied = stringResource(R.string.logs_copied)
    val copy = { text: String ->
        context.copyText(title, text)
        // Android 13 and later confirm a copy themselves.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) scope.launch { snackbar.showSnackbar(copied) }
    }
    val withLog = { use: (String) -> Unit ->
        if (!busy) {
            busy = true
            scope.launch {
                try {
                    use(context.readOwnLog())
                } finally {
                    busy = false
                }
            }
        }
    }
    Section(title) {
        Panel {
            LinkRow(stringResource(R.string.logs_show), description = stringResource(R.string.logs_note)) { withLog { shown = it } }
            RowDivider()
            LinkRow(stringResource(R.string.logs_copy)) { withLog(copy) }
            RowDivider()
            LinkRow(stringResource(R.string.logs_share)) { withLog { context.shareText(title, it) } }
        }
    }
    shown?.let { text ->
        val lines = remember(text) { text.trimEnd().lines() }
        Dialog(
            onDismissRequest = { shown = null },
            title = title,
            footer = {
                DialogButton(stringResource(R.string.logs_copy), { copy(text) }, look = ButtonLook.Secondary)
                DialogButton(stringResource(R.string.diagnostics_close), { shown = null })
            },
        ) {
            SelectionContainer {
                // The latest at the bottom, where it opens.
                LazyColumn(Modifier.fillMaxWidth().height(420.dp), reverseLayout = true) {
                    items(lines.asReversed()) { line ->
                        Text(line, fontFamily = FontFamily.Monospace, fontSize = 11.sp, lineHeight = 15.sp)
                    }
                }
            }
        }
    }
}
