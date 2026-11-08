package io.github.zekurio.matinee.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** What a long press on a card offers, for a file or a whole title. */
sealed interface ActionTarget {
    data class Item(val item: MediaItem) : ActionTarget

    data class Title(val title: TitleSummary) : ActionTarget
}

/** Opens the actions sheet; the sheet itself lives once at the app's root. */
class Actions {
    var target by mutableStateOf<ActionTarget?>(null)
        internal set

    fun item(item: MediaItem) {
        target = ActionTarget.Item(item)
    }

    fun title(title: TitleSummary) {
        target = ActionTarget.Title(title)
    }
}

val LocalActions = staticCompositionLocalOf { Actions() }

/** Messages that pop up at the bottom, like a failed mark. */
val LocalSnackbar = staticCompositionLocalOf { SnackbarHostState() }

/** Run [block], showing its error at the bottom of the screen. */
fun CoroutineScope.launchShowing(snackbar: SnackbarHostState, failure: String, block: suspend () -> Unit) {
    launch {
        try {
            block()
        } catch (e: IOException) {
            snackbar.showSnackbar(e.message?.let { "$failure: $it" } ?: failure)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActionsSheet(actions: Actions) {
    val target = actions.target ?: return
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val dismiss = {
        scope.launch { sheet.hide() }.invokeOnCompletion { actions.target = null }
        Unit
    }
    ModalBottomSheet(
        onDismissRequest = { actions.target = null },
        sheetState = sheet,
        containerColor = Palette.Raised,
        dragHandle = null,
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            when (target) {
                is ActionTarget.Item -> ItemActions(target.item, dismiss)
                is ActionTarget.Title -> TitleActions(target.title, dismiss)
            }
        }
    }
}

@Composable
private fun SheetHeader(title: String, subtitle: String?) {
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

@Composable
private fun ItemActions(item: MediaItem, dismiss: () -> Unit) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val snackbar = LocalSnackbar.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val scope = rememberCoroutineScope()
    val label = itemLabel(item, res)
    val code = episodeCode(item, res)
    val watched = viewer.isWatched(item)
    val favorite = viewer.isFavorite(item)
    val resume = item.progress?.let { !it.completed && it.positionSeconds > 0 } == true
    SheetHeader(
        if (code != null) label.title else label.showName,
        if (code != null) "${label.showName} · $code" else label.year,
    )
    SheetItem(Lucide.PlayOutline, stringResource(if (resume) R.string.title_resume else R.string.title_play)) {
        dismiss()
        nav.play(item.id)
    }
    if (resume) {
        SheetItem(Lucide.RotateCcw, stringResource(R.string.actions_play_from_start)) {
            dismiss()
            nav.play(item.id, 0.0)
        }
    }
    val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
    SheetItem(Lucide.Check, stringResource(if (watched) R.string.media_mark_unwatched else R.string.media_mark_watched)) {
        dismiss()
        scope.launchShowing(snackbar, watchedFailure) { viewer.setWatched(api, item, !watched) }
    }
    val favoriteFailure = stringResource(R.string.media_favorite_failed)
    SheetItem(
        if (favorite) Lucide.HeartFilled else Lucide.Heart,
        stringResource(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
    ) {
        dismiss()
        scope.launchShowing(snackbar, favoriteFailure) { viewer.setFavorite(api, item, !favorite) }
    }
    val title = item.title
    if (title != null && title.kind == TitleKind.SHOW) {
        SheetItem(Lucide.Info, stringResource(R.string.actions_episode_details)) {
            dismiss()
            nav.episode(item.id)
        }
        SheetItem(Lucide.Tv, stringResource(R.string.actions_go_to_show, title.name)) {
            dismiss()
            nav.title(title)
        }
    } else if (title != null) {
        SheetItem(Lucide.Info, stringResource(R.string.media_hero_details)) {
            dismiss()
            nav.title(title)
        }
    }
}

@Composable
private fun TitleActions(title: TitleSummary, dismiss: () -> Unit) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val snackbar = LocalSnackbar.current
    val viewer = LocalContext.current.app.viewer
    val scope = rememberCoroutineScope()
    val watched = viewer.isWatched(title)
    val favorite = viewer.isFavorite(title)
    SheetHeader(title.name, title.year?.toString())
    val playFailure = stringResource(R.string.media_play_failed, title.name)
    val noFiles = stringResource(R.string.media_no_files, title.name)
    SheetItem(Lucide.PlayOutline, stringResource(R.string.title_play)) {
        dismiss()
        scope.launchShowing(snackbar, playFailure) {
            val next = api.title(title.id).next
            if (next == null) snackbar.showSnackbar(noFiles) else nav.play(next.id)
        }
    }
    val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
    SheetItem(
        Lucide.Check,
        stringResource(
            when {
                title.kind == TitleKind.SHOW && watched -> R.string.media_mark_all_unwatched
                title.kind == TitleKind.SHOW -> R.string.media_mark_all_watched
                watched -> R.string.media_mark_unwatched
                else -> R.string.media_mark_watched
            },
        ),
    ) {
        dismiss()
        scope.launchShowing(snackbar, watchedFailure) { viewer.setWatched(api, title, !watched) }
    }
    val favoriteFailure = stringResource(R.string.media_favorite_failed)
    SheetItem(
        if (favorite) Lucide.HeartFilled else Lucide.Heart,
        stringResource(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
    ) {
        dismiss()
        scope.launchShowing(snackbar, favoriteFailure) { viewer.setFavorite(api, title, !favorite) }
    }
    SheetItem(Lucide.Info, stringResource(if (title.kind == TitleKind.SHOW) R.string.media_hero_episodes else R.string.media_hero_details)) {
        dismiss()
        nav.title(title)
    }
}
