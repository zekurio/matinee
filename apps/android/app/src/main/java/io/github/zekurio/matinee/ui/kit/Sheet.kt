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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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

/**
 * A sheet from the bottom, as the web's Drawer: the popover's color, round
 * at the top by `rounded-t-xl`, a hairline ring, and the backdrop tinted
 * with the page's background rather than dropped to black. Material's sheet
 * underneath does the dragging. [handle] shows the drawer's grip, for a
 * sheet that's dragged more than it's tapped.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Sheet(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    state: SheetState = rememberSheetState(),
    handle: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        modifier = modifier.border(1.dp, Palette.Ring, Shapes.Sheet),
        sheetState = state,
        shape = Shapes.Sheet,
        containerColor = Palette.Raised,
        contentColor = Palette.Foreground,
        tonalElevation = 0.dp,
        // The web's backdrop: bg-background/60.
        scrimColor = Palette.Background.copy(alpha = 0.6f),
        dragHandle = if (handle) ({ SheetHandle() }) else null,
        content = content,
    )
}

/** The drawer's grip: `h-1 w-10 rounded-full bg-foreground/20`, 8dp from the top. */
@Composable
private fun SheetHandle() {
    Box(
        Modifier
            .padding(top = 8.dp, bottom = 4.dp)
            .size(width = 40.dp, height = 4.dp)
            .clip(CircleShape)
            .background(Palette.Foreground.copy(alpha = 0.2f)),
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

/** What a sheet is about, over a line. */
@Composable
fun SheetHeader(title: String, subtitle: String?) {
    Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, maxLines = 1)
    }
    HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Palette.Border)
}

/** A row in a sheet menu: an icon and a label. */
@Composable
fun SheetItem(@DrawableRes icon: Int, label: String, destructive: Boolean = false, onClick: () -> Unit) {
    val color = if (destructive) Palette.Danger else Palette.Foreground
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(icon, null, tint = if (destructive) color else Palette.Muted)
        Text(label, style = MaterialTheme.typography.bodyLarge, color = color)
    }
}
