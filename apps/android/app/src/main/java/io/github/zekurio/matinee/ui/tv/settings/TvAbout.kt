package io.github.zekurio.matinee.ui.tv.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.player.PlaybackDiagnostics
import io.github.zekurio.matinee.ui.player.formatReport
import io.github.zekurio.matinee.ui.settings.appInfo
import io.github.zekurio.matinee.ui.settings.copyText
import io.github.zekurio.matinee.ui.settings.readOwnLog
import io.github.zekurio.matinee.ui.settings.statusLabel
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.LocalTvOpenPanels
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.TvListHeading
import io.github.zekurio.matinee.ui.tv.TvListItem
import io.github.zekurio.matinee.ui.tv.TvListValue
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvType
import kotlinx.coroutines.launch

/**
 * The phone's About page on a TV: the app and the TV, the latest
 * playback's report, and the app's log. A TV has no app to share them
 * with, so they're shown and copied.
 */
@Composable
internal fun ColumnScope.AboutRows(panels: SettingsPanels, first: Modifier) {
    val context = LocalContext.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val report by PlaybackDiagnostics.latest.collectAsState()
    val reportText = remember(report) { report?.let(::formatReport) }
    var busy by remember { mutableStateOf(false) }
    val reportTitle = stringResource(R.string.diagnostics_title)
    val logTitle = stringResource(R.string.logs_title)
    val reportCopied = stringResource(R.string.diagnostics_copied)
    val logCopied = stringResource(R.string.logs_copied)
    // A TV's system shows nothing for a copy, so the app says it.
    val copy = { label: String, text: String, done: String ->
        context.copyText(label, text)
        scope.launch { snackbar.showSnackbar(done) }
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

    appInfo().forEachIndexed { index, (title, value) ->
        TvListItem(
            stringResource(title),
            onClick = {},
            modifier = if (index == 0) first else Modifier,
            quiet = true,
            trailing = { TvListValue(value, chevron = false) },
        )
    }

    GroupGap()
    TvListHeading(reportTitle)
    val showLog = remember { FocusRequester() }
    val latest = report?.latest
    if (reportText == null || latest == null) {
        RowNote(stringResource(R.string.diagnostics_empty))
    } else {
        TvListItem(
            stringResource(R.string.diagnostics_latest),
            onClick = {},
            quiet = true,
            trailing = { TvListValue(statusLabel(latest), chevron = false) },
        )
        val show = remember { FocusRequester() }
        TvListItem(
            stringResource(R.string.diagnostics_show),
            onClick = { panels.show(show) { open -> if (open) TvTextViewer(reportTitle, reportText, panels) } },
            modifier = Modifier.focusRequester(show),
            quiet = true,
        )
        TvListItem(stringResource(R.string.diagnostics_copy), onClick = { copy(reportTitle, reportText, reportCopied) }, quiet = true)
        // Its rows go, so focus moves on to the log's.
        TvListItem(
            stringResource(R.string.diagnostics_clear),
            onClick = {
                runCatching { showLog.requestFocus() }
                PlaybackDiagnostics.clear()
            },
            quiet = true,
            destructive = true,
        )
    }

    GroupGap()
    TvListHeading(logTitle)
    TvListItem(
        stringResource(R.string.logs_show),
        onClick = { withLog { text -> panels.show(showLog) { open -> if (open) TvTextViewer(logTitle, text, panels, fromEnd = true) } } },
        modifier = Modifier.focusRequester(showLog),
        subtitle = stringResource(R.string.logs_note),
        quiet = true,
    )
    TvListItem(stringResource(R.string.logs_copy), onClick = { withLog { copy(logTitle, it, logCopied) } }, quiet = true)
}

/**
 * [text] over the whole page, in monospace, for reading from the couch.
 * Up and Down scroll it by most of a screen, Back closes it and puts
 * focus back on the row that opened it. [fromEnd] opens it at the bottom,
 * for a log, whose latest lines are last.
 */
@Composable
private fun TvTextViewer(title: String, text: String, panels: SettingsPanels, fromEnd: Boolean = false) {
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    var height by remember { mutableIntStateOf(0) }
    val close = {
        panels.close()
        panels.restore()
    }
    BackHandler(onBack = close)
    // The shell takes the clock away while it's open, as for a panel.
    val counter = LocalTvOpenPanels.current
    DisposableEffect(counter) {
        counter?.let { it.count++ }
        onDispose { counter?.let { it.count-- } }
    }
    LaunchedEffect(Unit) {
        withFrameNanos { }
        if (fromEnd) scroll.scrollTo(scroll.maxValue)
        runCatching { focus.requestFocus() }
    }
    Box(Modifier.fillMaxSize().background(Palette.Background)) {
        Column(Modifier.fillMaxSize().padding(start = TvPage.Start, end = TvPage.End, top = Overscan.Vertical + 8.dp)) {
            Text(title, style = TvType.Headline, modifier = Modifier.padding(bottom = 20.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .onSizeChanged { height = it.height }
                    .focusRequester(focus)
                    .onPreviewKeyEvent { event ->
                        val step = when (event.key) {
                            Key.DirectionDown -> height * 0.8f
                            Key.DirectionUp -> -height * 0.8f
                            // Focus stays here until Back.
                            Key.DirectionLeft, Key.DirectionRight -> 0f
                            else -> return@onPreviewKeyEvent false
                        }
                        if (event.type == KeyEventType.KeyDown && step != 0f) scope.launch { scroll.animateScrollBy(step) }
                        true
                    }
                    .focusable()
                    .verticalScroll(scroll),
            ) {
                Text(
                    text,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    color = Palette.Foreground,
                    modifier = Modifier.padding(bottom = Overscan.Vertical + 16.dp),
                )
            }
        }
    }
}
