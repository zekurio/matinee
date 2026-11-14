package io.github.zekurio.matinee.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ImageTarget
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.Season as ShowSeason
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.downloads.DownloadFilesSheet
import io.github.zekurio.matinee.ui.downloads.DownloadSheet
import io.github.zekurio.matinee.ui.downloads.FileSet
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.Sheet
import io.github.zekurio.matinee.ui.kit.SheetHeader
import io.github.zekurio.matinee.ui.kit.SheetItem
import io.github.zekurio.matinee.ui.kit.ToastState
import io.github.zekurio.matinee.ui.kit.rememberSheetState
import io.github.zekurio.matinee.ui.metadata.rememberLibraryProvider
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.title.setSeasonWatched
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

/**
 * What a menu is for: a file, a whole title, or one season of a show. A
 * menu opened on the page of what it's for is [here]: that page already
 * shows Play, the tick, and the heart, and opening the page again would
 * only stack another copy of it, so the menu leaves those out.
 */
sealed interface ActionTarget {
    val here: Boolean

    data class Item(val item: MediaItem, override val here: Boolean) : ActionTarget

    /** [file] is what Play starts, when known: a movie's file, which the menu downloads. */
    data class Title(val title: TitleSummary, val file: MediaItem?, override val here: Boolean) : ActionTarget

    data class Season(val title: TitleSummary, val season: ShowSeason, override val here: Boolean) : ActionTarget
}

/**
 * Opens the actions sheet; the sheet itself lives once at the app's root.
 * What its items start runs in [scope], which outlives the sheet.
 */
class Actions(val scope: CoroutineScope) {
    var target by mutableStateOf<ActionTarget?>(null)
        internal set

    /** The file whose download sheet is open. */
    var download by mutableStateOf<MediaItem?>(null)

    /** The show or season whose download sheet is open. */
    var files by mutableStateOf<FileSet?>(null)

    /** Something being marked watched, while the person says when. */
    var watched by mutableStateOf<WatchedAsk?>(null)

    /** Ask when the person watched [name], then [mark] it with the answer. */
    fun askWatched(name: String, mark: suspend (watchedAt: String?) -> Unit) {
        watched = WatchedAsk(name, mark)
    }

    fun item(item: MediaItem, here: Boolean = false) {
        target = ActionTarget.Item(item, here)
    }

    fun title(title: TitleSummary, file: MediaItem? = null, here: Boolean = false) {
        target = ActionTarget.Title(title, file, here)
    }

    fun season(title: TitleSummary, season: ShowSeason, here: Boolean = false) {
        target = ActionTarget.Season(title, season, here)
    }

    fun open(target: ActionTarget) {
        this.target = target
    }
}

/**
 * Whether [target]'s menu has anything in it. One opened on its own page
 * holds only starting over, downloads, and an admin's items, so for an
 * account that may not download it can be empty, and the page leaves its
 * button out.
 */
@Composable
fun hasActions(target: ActionTarget): Boolean {
    val app = LocalContext.current.app
    val stored by app.downloads.store.items.collectAsState()
    if (!target.here || app.viewer.mayDownload) return true
    val admin = LocalUser.current.isAdmin
    fun startsOver(item: MediaItem?) = item?.progress?.let { !it.completed && it.positionSeconds > 0 } == true
    return when (target) {
        is ActionTarget.Item -> admin || startsOver(target.item) || stored[target.item.id] != null
        is ActionTarget.Title -> admin || startsOver(target.file) || target.file?.let { stored[it.id] } != null
        is ActionTarget.Season -> admin && target.season.number != null
    }
}

val LocalActions = staticCompositionLocalOf<Actions> { error("no actions") }

/** Messages that pop up at the bottom, like a failed mark. */
val LocalSnackbar = staticCompositionLocalOf { ToastState() }

/** Run [block], showing its error at the bottom of the screen. */
fun CoroutineScope.launchShowing(snackbar: ToastState, failure: String, block: suspend () -> Unit) {
    launch {
        try {
            block()
        } catch (e: IOException) {
            snackbar.showSnackbar(e.message?.let { "$failure: $it" } ?: failure)
        } catch (_: SerializationException) {
            // Parsing details can contain server data; the action's own message is enough here.
            snackbar.showSnackbar(failure)
        }
    }
}

@Composable
fun ActionsSheet(actions: Actions) {
    actions.download?.let { item -> DownloadSheet(item) { actions.download = null } }
    actions.files?.let { files -> DownloadFilesSheet(files) { actions.files = null } }
    actions.watched?.let { ask -> WatchedAtSheet(ask) { actions.watched = null } }
    val target = actions.target ?: return
    val sheet = rememberSheetState()
    val scope = rememberCoroutineScope()
    val dismiss = {
        scope.launch { sheet.hide() }.invokeOnCompletion { actions.target = null }
        Unit
    }
    Sheet(onDismissRequest = { actions.target = null }, state = sheet) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            when (target) {
                is ActionTarget.Item -> ItemActions(target.item, target.here, dismiss)
                is ActionTarget.Title -> TitleActions(target.title, target.file, target.here, dismiss)
                is ActionTarget.Season -> SeasonActions(target.title, target.season, target.here, dismiss)
            }
        }
    }
}

@Composable
private fun ItemActions(item: MediaItem, here: Boolean, dismiss: () -> Unit) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val snackbar = LocalSnackbar.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    // The sheet goes before the request ends, so it runs in the app's scope.
    val scope = LocalActions.current.scope
    val label = itemLabel(item, res)
    val code = episodeCode(item, res)
    val watched = viewer.isWatched(item)
    val favorite = viewer.isFavorite(item)
    val resume = item.progress?.let { !it.completed && it.positionSeconds > 0 } == true
    SheetHeader(
        if (code != null) label.title else label.showName,
        if (code != null) label.showName else label.year,
    )
    if (!here) {
        SheetItem(Lucide.PlayOutline, stringResource(if (resume) R.string.title_resume else R.string.title_play)) {
            dismiss()
            nav.play(item.id)
        }
    }
    if (resume) {
        SheetItem(Lucide.RotateCcw, stringResource(R.string.actions_play_from_start)) {
            dismiss()
            nav.play(item.id, 0.0)
        }
    }
    if (!here) {
        val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
        val actions = LocalActions.current
        SheetItem(Lucide.Check, stringResource(if (watched) R.string.media_mark_unwatched else R.string.media_mark_watched)) {
            dismiss()
            // Unwatched at once; watched asks when first.
            if (watched) {
                scope.launchShowing(snackbar, watchedFailure) { viewer.setWatched(api, item, false) }
            } else {
                actions.askWatched(if (code != null) label.title else label.showName) { at -> viewer.setWatched(api, item, true, at) }
            }
        }
        val favoriteFailure = stringResource(R.string.media_favorite_failed)
        SheetItem(
            if (favorite) Lucide.HeartFilled else Lucide.Heart,
            stringResource(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
        ) {
            dismiss()
            scope.launchShowing(snackbar, favoriteFailure) { viewer.setFavorite(api, item, !favorite) }
        }
    }
    DownloadItem(item, dismiss)
    val title = item.title ?: return
    val show = title.kind == TitleKind.SHOW
    if (!here && show) {
        SheetItem(Lucide.Info, stringResource(R.string.actions_episode_details)) {
            dismiss()
            nav.episode(item.id)
        }
        SheetItem(Lucide.Tv, stringResource(R.string.actions_go_to_show, title.name)) {
            dismiss()
            nav.titleUp(title.id)
        }
    } else if (!here) {
        SheetItem(Lucide.Info, stringResource(R.string.media_hero_details)) {
            dismiss()
            nav.titleUp(title.id)
        }
    }
    // A movie's file is the movie, so it has the movie's; an episode has its still.
    val season = item.seasonNumber
    val episode = item.episodeNumber
    MetadataItems(
        title,
        images = when {
            !show -> ImageTarget(title.id)
            season != null && episode != null -> ImageTarget(title.id, season, episode)
            else -> null
        },
        matchable = !show,
        dismiss = dismiss,
    )
}

@Composable
private fun TitleActions(title: TitleSummary, file: MediaItem?, here: Boolean, dismiss: () -> Unit) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val viewer = LocalContext.current.app.viewer
    // The sheet goes before the request ends, so it runs in the app's scope.
    val scope = actions.scope
    val watched = viewer.isWatched(title)
    val favorite = viewer.isFavorite(title)
    val show = title.kind == TitleKind.SHOW
    SheetHeader(title.name, title.year?.toString())
    val playFailure = stringResource(R.string.media_play_failed, title.name)
    val noFiles = stringResource(R.string.media_no_files, title.name)
    if (!here) {
        SheetItem(Lucide.PlayOutline, stringResource(R.string.title_play)) {
            dismiss()
            scope.launchShowing(snackbar, playFailure) {
                val next = api.titles.get(title.id).next
                if (next == null) snackbar.showSnackbar(noFiles) else nav.play(next.id)
            }
        }
    }
    if (file != null && file.progress?.let { !it.completed && it.positionSeconds > 0 } == true) {
        SheetItem(Lucide.RotateCcw, stringResource(R.string.actions_play_from_start)) {
            dismiss()
            nav.play(file.id, 0.0)
        }
    }
    if (!here) {
        val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
        SheetItem(
            Lucide.Check,
            stringResource(
                when {
                    show && watched -> R.string.media_mark_all_unwatched
                    show -> R.string.media_mark_all_watched
                    watched -> R.string.media_mark_unwatched
                    else -> R.string.media_mark_watched
                },
            ),
        ) {
            dismiss()
            // Unwatched at once; watched asks when first.
            if (watched) {
                scope.launchShowing(snackbar, watchedFailure) { viewer.setWatched(api, title, false) }
            } else {
                actions.askWatched(title.name) { at -> viewer.setWatched(api, title, true, watchedAt = at) }
            }
        }
        val favoriteFailure = stringResource(R.string.media_favorite_failed)
        SheetItem(
            if (favorite) Lucide.HeartFilled else Lucide.Heart,
            stringResource(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
        ) {
            dismiss()
            scope.launchShowing(snackbar, favoriteFailure) { viewer.setFavorite(api, title, !favorite) }
        }
    }
    when {
        // What's on the phone already can still go.
        !viewer.mayDownload -> if (file != null) DownloadItem(file, dismiss)
        show -> SheetItem(Lucide.Download, stringResource(R.string.downloads_action)) {
            dismiss()
            actions.files = FileSet(title)
        }
        file != null -> DownloadItem(file, dismiss)
        else -> SheetItem(Lucide.Download, stringResource(R.string.downloads_action)) {
            dismiss()
            scope.launchShowing(snackbar, playFailure) {
                val next = api.titles.get(title.id).next
                if (next == null) snackbar.showSnackbar(noFiles) else actions.download = next
            }
        }
    }
    if (!here) {
        SheetItem(Lucide.Info, stringResource(if (show) R.string.media_hero_episodes else R.string.media_hero_details)) {
            dismiss()
            nav.titleUp(title.id)
        }
    }
    MetadataItems(title, ImageTarget(title.id), matchable = true, dismiss = dismiss)
}

/**
 * A season's menu: its download, and from its card its tick, its favorite,
 * and its page, as a poster's menu has them. The card goes by the season's
 * counts for whether it's watched; its page, by its episodes.
 */
@Composable
private fun SeasonActions(title: TitleSummary, season: ShowSeason, here: Boolean, dismiss: () -> Unit) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    SheetHeader(seasonName(season.number, res), title.name)
    if (!here) {
        val watched = season.itemCount > 0 && season.watchedCount >= season.itemCount
        val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
        val name = stringResource(R.string.title_season_of, title.name, seasonName(season.number, res))
        SheetItem(Lucide.Check, stringResource(if (watched) R.string.media_mark_unwatched else R.string.media_mark_watched)) {
            dismiss()
            // Unwatched at once; watched asks when first.
            if (watched) {
                actions.scope.launchShowing(snackbar, watchedFailure) { setSeasonWatched(api, viewer, title, season.number, false, null) }
            } else {
                actions.askWatched(name) { at -> setSeasonWatched(api, viewer, title, season.number, true, at) }
            }
        }
    }
    // The files without a season number aren't a season to mark.
    if (!here && season.number != null) {
        val favorite = viewer.isFavorite(title, season)
        val favoriteFailure = stringResource(R.string.media_favorite_failed)
        SheetItem(
            if (favorite) Lucide.HeartFilled else Lucide.Heart,
            stringResource(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
        ) {
            dismiss()
            // The sheet goes before the request ends, so it runs in the app's scope.
            actions.scope.launchShowing(snackbar, favoriteFailure) { viewer.setFavorite(api, title, season, !favorite) }
        }
    }
    if (viewer.mayDownload) {
        SheetItem(Lucide.Download, stringResource(R.string.downloads_action)) {
            dismiss()
            actions.files = FileSet(title, season)
        }
    }
    if (!here) {
        SheetItem(Lucide.List, stringResource(R.string.media_hero_episodes)) {
            dismiss()
            nav.season(title.id, season.number)
        }
    }
    // Files without a season number aren't a season to give a poster.
    MetadataItems(title, season.number?.let { ImageTarget(title.id, it) }, matchable = false, dismiss = dismiss)
}

/**
 * An admin's metadata items, after the rest: fix match and refresh for a
 * movie or show that's [matchable] and whose library has a provider with
 * its API key, and the image editor for [images]. Fix match and refresh
 * show once the provider is known, which the first menu asks for.
 */
@Composable
private fun MetadataItems(title: TitleSummary, images: ImageTarget?, matchable: Boolean, dismiss: () -> Unit) {
    if (!LocalUser.current.isAdmin) return
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val snackbar = LocalSnackbar.current
    val viewer = LocalContext.current.app.viewer
    val scope = LocalActions.current.scope
    val provider = if (matchable) (rememberLibraryProvider(title.libraryId) as? Load.Ready)?.value?.takeIf { it.configured } else null
    if (provider == null && images == null) return
    HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Palette.Border)
    if (provider != null) {
        SheetItem(Lucide.Search, stringResource(R.string.title_menu_fix_match)) {
            dismiss()
            nav.identify(title.id)
        }
        val done = stringResource(R.string.title_refresh_done, title.name)
        val failed = stringResource(R.string.title_refresh_error)
        SheetItem(Lucide.RefreshCw, stringResource(R.string.title_menu_refresh)) {
            dismiss()
            scope.launchShowing(snackbar, failed) {
                api.titles.refresh(title.id)
                viewer.changed()
                snackbar.showSnackbar(done)
            }
        }
    }
    if (images != null) {
        SheetItem(Lucide.Image, stringResource(R.string.title_menu_edit_images)) {
            dismiss()
            nav.images(images.titleId, images.season, images.episode)
        }
    }
}

/**
 * Download a file, or take back its download. An account that may not
 * download gets only the second, for a file on the phone already.
 */
@Composable
private fun DownloadItem(item: MediaItem, dismiss: () -> Unit) {
    val actions = LocalActions.current
    val context = LocalContext.current
    val downloads = context.app.downloads
    val stored by downloads.store.items.collectAsState()
    if (stored[item.id] == null) {
        if (!context.app.viewer.mayDownload) return
        SheetItem(Lucide.Download, stringResource(R.string.downloads_action)) {
            dismiss()
            actions.download = item
        }
    } else {
        SheetItem(Lucide.Trash, stringResource(R.string.downloads_remove), destructive = true) {
            dismiss()
            downloads.remove(item.id, context.app.session.api)
        }
    }
}
