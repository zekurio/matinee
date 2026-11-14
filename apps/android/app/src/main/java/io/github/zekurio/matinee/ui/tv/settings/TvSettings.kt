package io.github.zekurio.matinee.ui.tv.settings

import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.LocalTvPageFocus
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.TvListItem
import io.github.zekurio.matinee.ui.tv.TvListItems
import io.github.zekurio.matinee.ui.tv.TvListSwitch
import io.github.zekurio.matinee.ui.tv.TvListValue
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvPickerPanel
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.auth.FocusOnShow

/**
 * Settings' categories on a TV. Downloads, appearance, the admin pages,
 * and linking a device by camera have none; see the rows in each for what
 * of the phone's pages they keep.
 */
enum class TvSettingsCategory(val key: String, @param:DrawableRes val icon: Int, @param:StringRes val title: Int) {
    Playback("playback", Lucide.TvPlay, R.string.settings_page_playback),
    Subtitles("subtitles", Lucide.Captions, R.string.settings_subtitles_title),
    Languages("languages", Lucide.AudioLines, R.string.playback_languages_title),
    Devices("account", Lucide.Monitor, R.string.tv_settings_devices),
    Account("server", Lucide.UserRound, R.string.tv_settings_account),
    About("about", Lucide.Info, R.string.about_title),
    ;

    companion object {
        /** By the key in `SettingsPageRoute`, the phone's page keys where they mean the same. */
        fun of(key: String?) = entries.firstOrNull { it.key == key } ?: Playback
    }
}

/**
 * The right-edge panel a row opened, if any. One at a time, shown over
 * the page until a choice or Back closes it, when focus goes back to the
 * row. It stays composed while it slides away.
 */
@Stable
internal class SettingsPanels {
    var shown by mutableStateOf<(@Composable (open: Boolean) -> Unit)?>(null)
        private set
    var isOpen by mutableStateOf(false)
        private set
    private var from: FocusRequester? = null

    /** Show [panel], which gets whether it's open, from the row [from]. */
    fun show(from: FocusRequester, panel: @Composable (open: Boolean) -> Unit) {
        this.from = from
        shown = panel
        isOpen = true
    }

    fun close() {
        isOpen = false
    }

    /** Focus the row that opened the panel. */
    fun restore() {
        from?.let { runCatching { it.requestFocus() } }
    }
}

private val CATEGORY_WIDTH = 260.dp

/** Where rows start under the top, clear of the clock. */
private val TOP = Overscan.Vertical + 60.dp

/**
 * Settings on a TV, as Google TV's own: the categories on the left, the
 * focused one's rows on the right. Focusing a category shows its rows;
 * Right, Select, or a click goes into them, Left or Back comes out to the
 * category again.
 * Choices open in a panel at the right edge, switches flip in place.
 * [initial] picks the category to start on, by its key.
 */
@Composable
fun TvSettingsScreen(initial: String? = null) {
    val session = LocalContext.current.app.session
    var selected by rememberSaveable { mutableStateOf(TvSettingsCategory.of(initial)) }
    val categories = remember { TvSettingsCategory.entries.associateWith { FocusRequester() } }
    val firstRow = remember { FocusRequester() }
    var inRows by remember { mutableStateOf(false) }
    // Select or a click on a category goes into its rows, once the rows of
    // the category it picked are there: a click on another category picks
    // it in the same moment as it asks for its rows.
    var toRows by remember { mutableStateOf(false) }
    LaunchedEffect(toRows, selected) {
        if (!toRows) return@LaunchedEffect
        withFrameNanos { }
        runCatching { firstRow.requestFocus() }
        toRows = false
    }
    val panels = remember { SettingsPanels() }
    val toCategory = { runCatching { categories.getValue(selected).requestFocus() } }

    // The category it opened on, once. Keyed on the one selected, it would
    // pull focus back from the rows a click on a category went into.
    FocusOnShow(remember { categories.getValue(selected) })
    // Back from the drawer, the category that's open.
    val shell = LocalTvPageFocus.current
    DisposableEffect(shell) {
        val restore = { toCategory().getOrDefault(false) }
        shell?.restore = restore
        onDispose { if (shell?.restore === restore) shell.restore = null }
    }
    BackHandler(enabled = inRows) { toCategory() }

    Box(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxSize().padding(start = TvPage.Start - TvListItems.Inset, end = TvPage.End)) {
            Column(Modifier.width(CATEGORY_WIDTH).fillMaxHeight().padding(top = Overscan.Vertical + 8.dp)) {
                Text(stringResource(R.string.shell_settings), style = TvType.Headline, modifier = Modifier.padding(start = TvListItems.Inset, bottom = 28.dp))
                Column(Modifier.focusGroup(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    TvSettingsCategory.entries.forEach { category ->
                        TvListItem(
                            stringResource(category.title),
                            onClick = {
                                selected = category
                                toRows = true
                            },
                            icon = category.icon,
                            quiet = true,
                            selected = category == selected,
                            modifier = Modifier
                                .focusRequester(categories.getValue(category))
                                .focusProperties { right = firstRow }
                                .onFocusChanged { if (it.isFocused) selected = category },
                        )
                    }
                }
            }
            Box(Modifier.width(48.dp))
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    // Rows scroll under a fixed top, so they never pass behind the clock.
                    .padding(top = TOP)
                    .onFocusChanged { inRows = it.hasFocus }
                    .focusProperties { left = categories.getValue(selected) }
                    .focusGroup()
                    .verticalScroll(rememberScrollState())
                    .padding(top = 4.dp, bottom = Overscan.Vertical + 24.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                // A new category starts its rows afresh, at the top.
                key(selected) {
                    val first = Modifier.focusRequester(firstRow)
                    when (selected) {
                        TvSettingsCategory.Playback -> PlaybackRows(session, panels, first)
                        TvSettingsCategory.Subtitles -> SubtitleRows(panels, first)
                        TvSettingsCategory.Languages -> LanguageRows(session, panels, first)
                        TvSettingsCategory.Devices -> DeviceRows(panels, first)
                        TvSettingsCategory.Account -> AccountRows(session, panels, first)
                        TvSettingsCategory.About -> AboutRows(panels, first)
                    }
                }
            }
        }
        panels.shown?.invoke(panels.isOpen)
    }
}

/** A choice among [options], its value at the row's end, picked in a panel at the right edge. */
@Composable
internal fun <T> PickRow(
    title: String,
    options: List<Pair<T, String>>,
    current: T,
    panels: SettingsPanels,
    modifier: Modifier = Modifier,
    description: String? = null,
    onPick: (T) -> Unit,
) {
    val value = options.firstOrNull { it.first == current }?.second ?: current.toString()
    val row = remember { FocusRequester() }
    TvListItem(
        title,
        onClick = {
            panels.show(row) { open ->
                TvPickerPanel(open, title, options, current, onPick, panels::close, panels::restore, description)
            }
        },
        modifier = modifier.focusRequester(row),
        subtitle = description,
        quiet = true,
        trailing = { TvListValue(value) },
    )
}

/** On or off, flipped in place by Select. */
@Composable
internal fun SwitchRow(title: String, checked: Boolean, modifier: Modifier = Modifier, description: String? = null, onChange: (Boolean) -> Unit) {
    TvListItem(
        title,
        onClick = { onChange(!checked) },
        modifier = modifier,
        subtitle = description,
        quiet = true,
        trailing = { TvListSwitch(checked) },
    )
}

/** A note under a group of rows, such as what a setting is used for. */
@Composable
internal fun RowNote(text: String) {
    Text(text, style = TvType.Caption, color = Palette.Muted, modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 8.dp))
}

/** Room above a heading that starts a new group of rows. */
@Composable
internal fun ColumnScope.GroupGap() {
    Box(Modifier.fillMaxWidth().height(16.dp))
}

/** Opens one of the system's settings pages, if this TV has it. */
internal fun android.content.Context.openSystemSettings(action: String) {
    runCatching { startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

internal const val CAPTION_SETTINGS = Settings.ACTION_CAPTIONING_SETTINGS
