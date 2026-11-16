package io.github.zekurio.matinee.ui.kit

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.launch

/** Where a sheet is, for hiding it before it goes. */
@OptIn(ExperimentalMaterial3Api::class)
typealias SheetState = androidx.compose.material3.SheetState

/**
 * A sheet's state. [skipPartiallyExpanded] off lets a tall sheet open
 * halfway, as a long list's does.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun rememberSheetState(skipPartiallyExpanded: Boolean = true): SheetState =
    rememberModalBottomSheetState(skipPartiallyExpanded = skipPartiallyExpanded)

/** How far a sheet's text sits from its sides. */
val SheetPadding = 20.dp

/**
 * A sheet from the bottom, as the web's Drawer: the popover's color, round
 * at the top by `rounded-t-xl`, a hairline ring, the drawer's grip, and the
 * backdrop tinted with the page's background rather than dropped to black.
 * Material's sheet underneath does the dragging.
 *
 * The ring is drawn by the content, not on [ModalBottomSheet]'s modifier:
 * that modifier sits outside the sheet's offset, so a border there stays at
 * the top of the screen while the sheet moves, and shows as lines over the
 * page. The content pads the system bars itself for the same reason, so
 * the ring runs down to the screen's edge.
 *
 * Content taller than the screen should scroll in [SheetBody], with what
 * must stay in reach, like a sheet's button, after it in [SheetFooter].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Sheet(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    state: SheetState = rememberSheetState(),
    content: @Composable ColumnScope.() -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        modifier = modifier,
        sheetState = state,
        shape = Shapes.Sheet,
        containerColor = Palette.Raised,
        contentColor = Palette.Foreground,
        tonalElevation = 0.dp,
        // The web's backdrop: bg-background/60.
        scrimColor = Palette.Background.copy(alpha = 0.6f),
        dragHandle = null,
        contentWindowInsets = { WindowInsets(0) },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .border(1.dp, Palette.Ring, Shapes.Sheet)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Bottom)),
        ) {
            SheetHandle()
            content()
        }
    }
}

/** The drawer's grip: `h-1 w-10 rounded-full bg-foreground/20`, 8dp from the top. */
@Composable
private fun ColumnScope.SheetHandle() {
    Box(
        Modifier
            .align(Alignment.CenterHorizontally)
            .padding(top = 8.dp, bottom = 4.dp)
            .size(width = 40.dp, height = 4.dp)
            .clip(CircleShape)
            .background(Palette.Foreground.copy(alpha = 0.2f)),
    )
}

/**
 * The part of a sheet that scrolls when the sheet is taller than the
 * screen, between a [SheetHeader] and a [SheetFooter] that stay put.
 * [modifier] goes inside the scroll, so its padding scrolls with the rows.
 */
@Composable
fun ColumnScope.SheetBody(
    modifier: Modifier = Modifier,
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState()).then(modifier),
        verticalArrangement = verticalArrangement,
        content = content,
    )
}

/**
 * What stays at a sheet's bottom under its [SheetBody], set off by a line.
 * [line] off leaves the line out, for a sheet with nothing between its
 * header's line and this.
 */
@Composable
fun SheetFooter(
    modifier: Modifier = Modifier,
    line: Boolean = true,
    verticalArrangement: Arrangement.Vertical = Arrangement.spacedBy(12.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    if (line) HorizontalDivider(color = Palette.Border)
    Column(
        modifier.fillMaxWidth().padding(horizontal = SheetPadding, vertical = 12.dp),
        verticalArrangement = verticalArrangement,
        content = content,
    )
}

/**
 * For a sheet's items: the sheet slides away, then it's gone and the
 * item's action runs, so a page or dialog it opens doesn't cut it off.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun rememberSheetCloser(sheet: SheetState, onDismiss: () -> Unit): (() -> Unit) -> Unit {
    val scope = rememberCoroutineScope()
    return { action ->
        scope.launch { sheet.hide() }.invokeOnCompletion {
            onDismiss()
            action()
        }
    }
}

/**
 * What a sheet is about, over a line: every sheet's title, so they all
 * start the same under the grip. [line] off leaves the line out, for a
 * [SheetBody] that draws its own.
 */
@Composable
fun SheetHeader(title: String, subtitle: String? = null, line: Boolean = true) {
    Column(Modifier.fillMaxWidth().padding(horizontal = SheetPadding, vertical = 8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (subtitle != null) {
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
    if (line) HorizontalDivider(Modifier.padding(top = 6.dp), color = Palette.Border)
}

/** A row in a sheet menu: an icon and a label. */
@Composable
fun SheetItem(@DrawableRes icon: Int, label: String, destructive: Boolean = false, onClick: () -> Unit) {
    val color = if (destructive) Palette.Danger else Palette.Foreground
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = SheetPadding, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(icon, null, tint = if (destructive) color else Palette.Muted)
        Text(label, style = MaterialTheme.typography.bodyLarge, color = color)
    }
}
