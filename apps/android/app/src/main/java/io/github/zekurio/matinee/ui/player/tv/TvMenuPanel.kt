package io.github.zekurio.matinee.ui.player.tv

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.player.Menu
import io.github.zekurio.matinee.ui.player.MenuEntry
import io.github.zekurio.matinee.ui.player.PlayerController
import io.github.zekurio.matinee.ui.player.PlayerPrefs
import io.github.zekurio.matinee.ui.player.menuEntries
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * A menu as a panel on the right edge, over the dimmed picture. It takes
 * focus, on the current choice, and keeps it until Back or a choice closes
 * it; the screen then gives focus back to the button that opened it.
 */
@Composable
internal fun TvMenuPanel(open: Menu?, controller: PlayerController, prefs: PlayerPrefs, onDismiss: () -> Unit) {
    // The menu that was open stays drawn while the panel slides away.
    var last by remember { mutableStateOf(open) }
    if (open != null) last = open
    BackHandler(enabled = open != null, onBack = onDismiss)
    val trapped by rememberUpdatedState(open != null)
    val picked = remember { FocusRequester() }
    val first = remember { FocusRequester() }
    LaunchedEffect(open) {
        if (open == null) return@LaunchedEffect
        withFrameNanos {}
        if (runCatching { picked.requestFocus() }.isFailure) runCatching { first.requestFocus() }
    }
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(open != null, enter = Motion.fadeIn, exit = Motion.fadeOut) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)))
        }
        AnimatedVisibility(
            open != null,
            modifier = Modifier.align(Alignment.CenterEnd),
            enter = slideInHorizontally(Motion.slide()) { it } + Motion.fadeIn,
            exit = slideOutHorizontally(Motion.slide()) { it } + Motion.fadeOut,
        ) {
            val menu = last ?: return@AnimatedVisibility
            val entries = menuEntries(menu, controller) + if (menu == Menu.Settings) pictureEntries(prefs) else emptyList()
            val firstChoice = entries.indexOfFirst { it is MenuEntry.Choice && it.enabled }
            LazyColumn(
                Modifier
                    .fillMaxHeight()
                    .width(400.dp)
                    .background(Palette.Raised)
                    .focusProperties { onExit = { if (trapped) cancelFocusChange() } }
                    .focusGroup(),
                contentPadding = PaddingValues(start = 24.dp, end = 48.dp, top = 27.dp, bottom = 27.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                itemsIndexed(entries, key = { _, entry -> entry.key }) { index, entry ->
                    when (entry) {
                        is MenuEntry.Heading -> PanelHeading(entry.text, top = index > 0)
                        is MenuEntry.Note -> Text(
                            entry.text,
                            style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp),
                            color = Palette.Muted,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                        is MenuEntry.Divider -> Box(Modifier.padding(vertical = 8.dp).fillMaxWidth().height(1.dp).background(Palette.Border))
                        is MenuEntry.Choice -> PanelRow(
                            entry,
                            Modifier
                                .then(if (entry.selected && entry.enabled) Modifier.focusRequester(picked) else Modifier)
                                .then(if (index == firstChoice) Modifier.focusRequester(first) else Modifier),
                        ) {
                            entry.pick()
                            onDismiss()
                        }
                    }
                }
            }
        }
    }
}

/** How the picture fills the screen, which a phone switches with a pinch. */
@Composable
private fun pictureEntries(prefs: PlayerPrefs): List<MenuEntry> = listOf(
    MenuEntry.Divider("picture-start"),
    MenuEntry.Heading(stringResource(R.string.player_picture), "picture"),
    MenuEntry.Choice(stringResource(R.string.player_fit), null, selected = !prefs.fillScreen, key = "picture-fit") { prefs.fillScreen = false },
    MenuEntry.Choice(stringResource(R.string.player_fill), null, selected = prefs.fillScreen, key = "picture-fill") { prefs.fillScreen = true },
)

@Composable
private fun PanelHeading(text: String, top: Boolean) {
    Text(
        text,
        style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = if (top) 12.dp else 0.dp, bottom = 8.dp).semantics { heading() },
    )
}

/** One choice: filled while focused, with a check when it's the current one. */
@Composable
private fun PanelRow(entry: MenuEntry.Choice, modifier: Modifier, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val (fill, content) = tvColors(focused)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (focused) fill else Color.Transparent)
            .selectable(entry.selected, interactionSource = interaction, indication = null, enabled = entry.enabled, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                entry.title,
                style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp),
                color = if (entry.enabled) content else Palette.Faint,
            )
            if (!entry.detail.isNullOrEmpty()) {
                Text(entry.detail, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp), color = content.copy(alpha = 0.7f))
            }
        }
        if (entry.selected) LucideIcon(Lucide.Check, null, size = 22.dp, tint = if (focused) content else Palette.Accent)
    }
}
