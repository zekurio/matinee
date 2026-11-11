package io.github.zekurio.matinee.ui.player.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.player.Menu
import io.github.zekurio.matinee.ui.player.MenuEntry
import io.github.zekurio.matinee.ui.player.PlayerController
import io.github.zekurio.matinee.ui.player.PlayerPrefs
import io.github.zekurio.matinee.ui.player.menuEntries
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.TvListHeading
import io.github.zekurio.matinee.ui.tv.TvListItem
import io.github.zekurio.matinee.ui.tv.TvListItems
import io.github.zekurio.matinee.ui.tv.TvSidePanel
import io.github.zekurio.matinee.ui.tv.TvType

/**
 * A menu as the TV's right-edge panel, over the dimmed picture. It takes
 * focus, on the current choice, and keeps it until Back or a choice closes
 * it; focus then goes back to the menu's button, [button].
 */
@Composable
internal fun TvMenuPanel(open: Menu?, controller: PlayerController, prefs: PlayerPrefs, button: (Menu) -> FocusRequester, onDismiss: () -> Unit) {
    // The menu that was open stays drawn while the panel slides away.
    var last by remember { mutableStateOf(open) }
    if (open != null) last = open
    val menu = last
    val title = menu?.let { stringResource(menuName(it)) }
    val entries = if (menu == null) emptyList() else menuEntries(menu, controller) + if (menu == Menu.Settings) pictureEntries(prefs) else emptyList()
    // The panel's heading names the menu, so a first heading that says the same goes.
    val rows = if ((entries.firstOrNull() as? MenuEntry.Heading)?.text == title) entries.drop(1) else entries
    val picked = remember { FocusRequester() }
    val pickedIndex = rows.indexOfFirst { it is MenuEntry.Choice && it.selected && it.enabled }
    TvSidePanel(
        open != null,
        title,
        onBack = onDismiss,
        returnFocus = { menu?.let { runCatching { button(it).requestFocus() } } },
        initial = picked.takeIf { pickedIndex >= 0 },
        initialIndex = pickedIndex.coerceAtLeast(0),
        focusKey = menu,
    ) {
        itemsIndexed(rows, key = { _, entry -> entry.key }) { index, entry ->
            when (entry) {
                is MenuEntry.Heading -> TvListHeading(entry.text, Modifier.padding(top = if (index > 0) 8.dp else 0.dp))
                is MenuEntry.Note -> Text(
                    entry.text,
                    style = TvType.Body,
                    color = Palette.Muted,
                    modifier = Modifier.padding(horizontal = TvListItems.Inset, vertical = 8.dp),
                )
                is MenuEntry.Divider -> Box(Modifier.padding(vertical = 8.dp).fillMaxWidth().height(1.dp).background(Palette.Border))
                is MenuEntry.Choice -> TvListItem(
                    entry.title,
                    onClick = {
                        entry.pick()
                        onDismiss()
                    },
                    modifier = if (index == pickedIndex) Modifier.focusRequester(picked) else Modifier,
                    subtitle = entry.detail?.ifEmpty { null },
                    quiet = true,
                    enabled = entry.enabled,
                    checked = entry.selected,
                )
            }
        }
    }
}

private fun menuName(menu: Menu) = when (menu) {
    Menu.Audio -> R.string.player_menu_audio
    Menu.Subtitles -> R.string.player_menu_subtitles
    Menu.Settings -> R.string.player_menu_settings
}

/** How the picture fills the screen, which a phone switches with a pinch. */
@Composable
private fun pictureEntries(prefs: PlayerPrefs): List<MenuEntry> = listOf(
    MenuEntry.Divider("picture-start"),
    MenuEntry.Heading(stringResource(R.string.player_picture), "picture"),
    MenuEntry.Choice(stringResource(R.string.player_fit), null, selected = !prefs.fillScreen, key = "picture-fit") { prefs.fillScreen = false },
    MenuEntry.Choice(stringResource(R.string.player_fill), null, selected = prefs.fillScreen, key = "picture-fill") { prefs.fillScreen = true },
)
