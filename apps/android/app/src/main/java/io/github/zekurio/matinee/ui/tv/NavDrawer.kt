package io.github.zekurio.matinee.ui.tv

import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.theme.Palette

/** An entry in the TV's drawer. [icon] null draws the signed-in person's picture. */
class DrawerEntry(val key: String, val label: String, @param:DrawableRes val icon: Int?, val route: Any)

/** The person's picture for the profile entry. */
class DrawerAvatar(val name: String, val url: String?)

/**
 * Whether the drawer has focus, and the way into it. The shell's Back on
 * Home calls [open]; Left from a page's first column comes in by itself.
 */
@Stable
class DrawerState {
    var isOpen by mutableStateOf(false)
        internal set
    internal val requesters = mutableStateMapOf<String, FocusRequester>()
    internal var current: String = ""

    /** Asked for by the shell, not by a key: the one way in other than Left. */
    internal var opening = false

    /** Focus the current page's entry. */
    fun open() {
        val requester = requesters[current] ?: requesters.values.firstOrNull() ?: return
        opening = true
        runCatching { requester.requestFocus() }
        opening = false
    }
}

private val RAIL_ICON = 44.dp
private val EXPANDED_WIDTH = 236.dp
private val ROW_HEIGHT = 48.dp

/**
 * The TV's navigation, as Wholphin's: a rail of icons at the left edge
 * that grows into a labelled drawer over the page while it has focus. The
 * [current] page's entry is marked. Only Left, or [DrawerState.open], comes
 * in; Right or Back calls [onLeave] to hand focus back to the page.
 */
@Composable
internal fun TvDrawer(
    top: DrawerEntry,
    avatar: DrawerAvatar,
    entries: List<DrawerEntry>,
    bottom: DrawerEntry,
    current: String,
    state: DrawerState,
    onPick: (DrawerEntry) -> Unit,
    onLeave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    state.current = current
    val open = state.isOpen
    val shade by animateFloatAsState(if (open) 1f else 0f, if (open) Motion.enter() else Motion.exit(), label = "drawerShade")
    val width by animateDpAsState(if (open) EXPANDED_WIDTH else RAIL_ICON, Motion.move(), label = "drawerWidth")
    Box(
        modifier
            .fillMaxHeight()
            // Over the page, a shade the labels read on, deepest at the left.
            .drawBehind {
                if (shade > 0f) {
                    val panel = (Overscan.RailCenter + EXPANDED_WIDTH + 48.dp).toPx()
                    val reach = panel * 4
                    drawRect(
                        Brush.horizontalGradient(
                            0f to Palette.Background.copy(alpha = 0.98f * shade),
                            0.25f to Palette.Background.copy(alpha = 0.94f * shade),
                            0.5f to Palette.Background.copy(alpha = 0.7f * shade),
                            1f to Palette.Background.copy(alpha = 0.6f * shade),
                            endX = reach,
                        ),
                        size = Size(reach, size.height),
                    )
                }
            }
            .onFocusChanged { state.isOpen = it.hasFocus }
            .focusProperties {
                onEnter = {
                    if (requestedFocusDirection == FocusDirection.Left || state.opening) {
                        state.requesters[state.current]?.requestFocus()
                    } else {
                        // Up from a page's first row, say, shouldn't land here.
                        cancelFocusChange()
                    }
                }
            }
            // The properties above are the group's, not each entry's.
            .focusGroup()
            .onPreviewKeyEvent { event ->
                if (event.key == Key.DirectionRight) {
                    if (event.type == KeyEventType.KeyDown) onLeave()
                    true
                } else {
                    false
                }
            }
            .padding(start = Overscan.RailCenter - RAIL_ICON / 2, top = Overscan.Vertical, bottom = Overscan.Vertical),
    ) {
        Column(Modifier.fillMaxHeight().width(width), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Entry(top, current, state, open, onPick, avatar)
            Spacer(Modifier.height(18.dp))
            // One column, no scrolling group inside it: Down from the
            // profile went past a nested one to Settings.
            entries.forEach { Entry(it, current, state, open, onPick) }
            Spacer(Modifier.weight(1f))
            Entry(bottom, current, state, open, onPick)
        }
    }
}

@Composable
private fun Entry(
    entry: DrawerEntry,
    current: String,
    state: DrawerState,
    open: Boolean,
    onPick: (DrawerEntry) -> Unit,
    avatar: DrawerAvatar? = null,
) {
    val requester = remember { FocusRequester() }
    DisposableEffect(entry.key) {
        state.requesters[entry.key] = requester
        onDispose { if (state.requesters[entry.key] === requester) state.requesters.remove(entry.key) }
    }
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val selected = entry.key == current
    val tint = tvContent(
        focused,
        when {
            selected -> Palette.Accent
            open -> Palette.Foreground.copy(alpha = 0.8f)
            else -> Palette.Foreground.copy(alpha = 0.45f)
        },
    )
    Row(
        Modifier
            .height(ROW_HEIGHT)
            .fillMaxWidth()
            .focusRequester(requester)
            .tvControl(
                focused,
                CircleShape,
                rest = if (selected && !open) Palette.Foreground.copy(alpha = 0.1f) else Color.Transparent,
                scale = TvFocus.ROW_SCALE,
            )
            .clickable(interaction, indication = null, role = Role.Button, onClickLabel = entry.label) { onPick(entry) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(RAIL_ICON, ROW_HEIGHT), contentAlignment = Alignment.Center) {
            if (entry.icon != null) {
                LucideIcon(entry.icon, if (open) null else entry.label, size = 24.dp, tint = tint)
            } else if (avatar != null) {
                Avatar(avatar.name, avatar.url, size = 32.dp)
            }
        }
        AnimatedVisibility(open, enter = fadeIn(Motion.enter(delay = 60)), exit = fadeOut(Motion.exit())) {
            Text(
                entry.label,
                style = TvType.Facts,
                color = tvContent(focused, if (selected) Palette.Accent else Palette.Foreground.copy(alpha = 0.85f)),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 6.dp, end = 18.dp),
            )
        }
    }
}
