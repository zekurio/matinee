package io.github.zekurio.matinee.ui.tv

import androidx.activity.compose.BackHandler
import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.Season
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.api.WatchedAt
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.ActionTarget
import io.github.zekurio.matinee.ui.components.Actions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.WatchedAsk
import io.github.zekurio.matinee.ui.components.launchShowing
import io.github.zekurio.matinee.ui.components.watchedAtOn
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.title.isResuming
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.TextStyle
import java.util.Locale

/**
 * The TV's side of [Actions]: the panel at the right edge that shows what
 * the phone's actions sheet would, and the card focus goes back to when
 * it closes. Cards open it with [open]; the watched question opens it
 * through [Actions.askWatched] as on the phone.
 */
@Stable
class TvMenu(val actions: Actions) {
    internal var returnTo: FocusRequester? = null

    /** Focus stays inside the panel while this is set. */
    internal var trapping = false

    val isOpen: Boolean get() = actions.target != null || actions.watched != null

    /** Open the panel for [target], from the card [from], which gets focus back. */
    fun open(target: ActionTarget, from: FocusRequester?) {
        returnTo = from
        actions.target = target
    }
}

val LocalTvMenu = staticCompositionLocalOf<TvMenu?> { null }

/** What the panel shows: a menu, the watched question, or the day for it. */
private sealed interface PanelView {
    data class Menu(val target: ActionTarget) : PanelView

    data class Watched(val ask: WatchedAsk) : PanelView

    data class Day(val ask: WatchedAsk) : PanelView
}

/** An entry in the panel. [leaves] for one that opens another page, so focus doesn't go back to the card. */
private class Entry(@param:DrawableRes val icon: Int, val label: String, val leaves: Boolean = false, val run: () -> Unit)

private val PANEL_WIDTH = 380.dp

/**
 * The panel, over the page, for the shell to put above its pages. It takes
 * focus when it opens and keeps it, closes on Back, and gives focus back
 * to the card that opened it, or [fallback] when there's none.
 */
@Composable
fun TvActionsPanel(menu: TvMenu, fallback: () -> Unit) {
    val actions = menu.actions
    var picking by remember { mutableStateOf<WatchedAsk?>(null) }
    val current: PanelView? = actions.watched?.let { ask -> if (picking === ask) PanelView.Day(ask) else PanelView.Watched(ask) }
        ?: actions.target?.let { PanelView.Menu(it) }
    // Kept through the slide out, after the state is cleared.
    var last by remember { mutableStateOf<PanelView?>(null) }
    if (current != null) last = current

    val snackbar = LocalSnackbar.current
    val failure = stringResource(R.string.media_mark_watched_failed)
    // The mark runs in the app's scope, since the panel goes first.
    val mark = { ask: WatchedAsk, watchedAt: String? -> actions.scope.launchShowing(snackbar, failure) { ask.mark(watchedAt) } }
    val restore = {
        menu.trapping = false
        val back = menu.returnTo
        menu.returnTo = null
        if (back == null || !runCatching { back.requestFocus() }.getOrDefault(false)) fallback()
    }
    val close = {
        actions.target = null
        actions.watched = null
        picking = null
        restore()
    }
    BackHandler(enabled = current != null) {
        // From the day, Back goes to the question it came from.
        if (current is PanelView.Day) picking = null else close()
    }

    AnimatedVisibility(current != null, enter = fadeIn(Motion.enter()), exit = fadeOut(Motion.exit())) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)))
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
        AnimatedVisibility(
            current != null,
            enter = slideInHorizontally(Motion.enter()) { it } + fadeIn(Motion.enter()),
            exit = slideOutHorizontally(Motion.exit()) { it } + fadeOut(Motion.exit()),
        ) {
            val view = last ?: return@AnimatedVisibility
            val first = remember(view) { FocusRequester() }
            LaunchedEffect(view, current != null) {
                if (current == null) return@LaunchedEffect
                withFrameNanos { }
                menu.trapping = true
                runCatching { first.requestFocus() }
            }
            Column(
                Modifier
                    .width(PANEL_WIDTH)
                    .fillMaxHeight()
                    .background(Palette.Raised)
                    .focusProperties { onExit = { if (menu.trapping) cancelFocusChange() } }
                    .focusGroup()
                    .verticalScroll(rememberScrollState())
                    .padding(start = 28.dp, end = Overscan.Horizontal, top = Overscan.Vertical + 20.dp, bottom = Overscan.Vertical),
            ) {
                when (view) {
                    is PanelView.Menu -> MenuView(view.target, first) { entry ->
                        menu.trapping = false
                        actions.target = null
                        entry.run()
                        // The watched question takes over the panel; anything else closes it.
                        if (menu.isOpen) {
                            menu.trapping = true
                        } else if (entry.leaves) {
                            menu.returnTo = null
                        } else {
                            restore()
                        }
                    }
                    is PanelView.Watched -> WatchedView(view.ask, first, onPick = { at ->
                        mark(view.ask, at)
                        close()
                    }, onDay = { picking = view.ask })
                    is PanelView.Day -> DayView(view.ask, first) { at ->
                        mark(view.ask, at)
                        close()
                    }
                }
            }
        }
    }
}

@Composable
private fun PanelHeader(title: String, subtitle: String?) {
    Text(title, style = TvType.Headline, maxLines = 2, overflow = TextOverflow.Ellipsis)
    if (subtitle != null) {
        Text(subtitle, style = TvType.Body, color = Palette.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
    }
    Box(Modifier.padding(top = 24.dp))
}

/** A row in the panel: an icon and a label, filled with the text color while focused. */
@Composable
private fun PanelItem(@DrawableRes icon: Int, label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(12.dp)
    val content = if (focused) Palette.Background else Palette.Foreground
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(shape)
            .background(if (focused) Palette.Foreground else Color.Transparent)
            .clickable(interaction, indication = null, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(icon, null, size = 20.dp, tint = if (focused) content else Palette.Muted)
        Text(label, style = TvType.Facts, color = content, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun MenuView(target: ActionTarget, first: FocusRequester, onPick: (Entry) -> Unit) {
    val res = LocalResources.current
    val (title, subtitle) = when (target) {
        is ActionTarget.Item -> {
            val label = itemLabel(target.item, res)
            val code = episodeCode(target.item, res)
            if (code != null) label.title to "${label.showName} · $code" else label.showName to label.year
        }
        is ActionTarget.Title -> target.title.name to target.title.year?.toString()
        is ActionTarget.Season -> seasonName(target.season.number, res) to target.title.name
    }
    val entries = when (target) {
        is ActionTarget.Item -> itemEntries(target.item, target.here)
        is ActionTarget.Title -> titleEntries(target.title, target.file, target.here)
        is ActionTarget.Season -> seasonEntries(target.title, target.season, target.here)
    }
    PanelHeader(title, subtitle)
    entries.forEachIndexed { index, entry ->
        PanelItem(entry.icon, entry.label, if (index == 0) Modifier.focusRequester(first) else Modifier) { onPick(entry) }
    }
}

/**
 * A file's entries, the phone's sheet without downloads and the admin's
 * metadata items: play, play from the start, the marks, and its pages.
 */
@Composable
private fun itemEntries(item: MediaItem, here: Boolean): List<Entry> {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val snackbar = LocalSnackbar.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val actions = LocalTvMenu.current?.actions ?: return emptyList()
    val scope = actions.scope
    val label = itemLabel(item, res)
    val code = episodeCode(item, res)
    val watched = viewer.isWatched(item)
    val favorite = viewer.isFavorite(item)
    val resume = isResuming(item)
    val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
    val favoriteFailure = stringResource(R.string.media_favorite_failed)
    val title = item.title
    val show = title?.kind == TitleKind.SHOW
    return buildList {
        if (!here) add(Entry(Lucide.PlayOutline, res.getString(if (resume) R.string.title_resume else R.string.title_play)) { nav.play(item.id) })
        if (resume) add(Entry(Lucide.RotateCcw, res.getString(R.string.actions_play_from_start)) { nav.play(item.id, 0.0) })
        if (!here) {
            add(
                Entry(Lucide.Check, res.getString(if (watched) R.string.media_mark_unwatched else R.string.media_mark_watched)) {
                    // Unwatched at once; watched asks when first.
                    if (watched) scope.launchShowing(snackbar, watchedFailure) { viewer.setWatched(api, item, false) }
                    else actions.askWatched(if (code != null) label.title else label.showName) { at -> viewer.setWatched(api, item, true, at) }
                },
            )
            add(
                Entry(
                    if (favorite) Lucide.HeartFilled else Lucide.Heart,
                    res.getString(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
                ) { scope.launchShowing(snackbar, favoriteFailure) { viewer.setFavorite(api, item, !favorite) } },
            )
        }
        if (title != null && !here) {
            if (show) {
                add(Entry(Lucide.Info, res.getString(R.string.actions_episode_details), leaves = true) { nav.episode(item.id) })
                add(Entry(Lucide.Tv, res.getString(R.string.actions_go_to_show, title.name), leaves = true) { nav.titleUp(title.id) })
            } else {
                add(Entry(Lucide.Info, res.getString(R.string.media_hero_details), leaves = true) { nav.titleUp(title.id) })
            }
        }
    }
}

/** A title's entries, the phone's sheet without downloads and the admin's metadata items. */
@Composable
private fun titleEntries(title: TitleSummary, file: MediaItem?, here: Boolean): List<Entry> {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val snackbar = LocalSnackbar.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val actions = LocalTvMenu.current?.actions ?: return emptyList()
    val scope = actions.scope
    val watched = viewer.isWatched(title)
    val favorite = viewer.isFavorite(title)
    val show = title.kind == TitleKind.SHOW
    val playFailure = stringResource(R.string.media_play_failed, title.name)
    val noFiles = stringResource(R.string.media_no_files, title.name)
    val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
    val favoriteFailure = stringResource(R.string.media_favorite_failed)
    return buildList {
        if (!here) {
            add(
                Entry(Lucide.PlayOutline, res.getString(R.string.title_play)) {
                    scope.launchShowing(snackbar, playFailure) {
                        val next = api.titles.get(title.id).next
                        if (next == null) snackbar.showSnackbar(noFiles) else nav.play(next.id)
                    }
                },
            )
        }
        if (file != null && isResuming(file)) add(Entry(Lucide.RotateCcw, res.getString(R.string.actions_play_from_start)) { nav.play(file.id, 0.0) })
        if (!here) {
            val mark = when {
                show && watched -> R.string.media_mark_all_unwatched
                show -> R.string.media_mark_all_watched
                watched -> R.string.media_mark_unwatched
                else -> R.string.media_mark_watched
            }
            add(
                Entry(Lucide.Check, res.getString(mark)) {
                    if (watched) scope.launchShowing(snackbar, watchedFailure) { viewer.setWatched(api, title, false) }
                    else actions.askWatched(title.name) { at -> viewer.setWatched(api, title, true, watchedAt = at) }
                },
            )
            add(
                Entry(
                    if (favorite) Lucide.HeartFilled else Lucide.Heart,
                    res.getString(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
                ) { scope.launchShowing(snackbar, favoriteFailure) { viewer.setFavorite(api, title, !favorite) } },
            )
            add(
                Entry(Lucide.Info, res.getString(if (show) R.string.media_hero_episodes else R.string.media_hero_details), leaves = true) {
                    nav.titleUp(title.id)
                },
            )
        }
    }
}

/** A season's entries: its page. The phone's download and image editor stay off the TV. */
@Composable
private fun seasonEntries(title: TitleSummary, season: Season, here: Boolean): List<Entry> {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    return buildList {
        if (!here) add(Entry(Lucide.List, res.getString(R.string.media_hero_episodes), leaves = true) { nav.season(title.id, season.number) })
    }
}

/** When the person watched it, as the phone's sheet asks: now, on release, a day they pick, or they don't remember. */
@Composable
private fun WatchedView(ask: WatchedAsk, first: FocusRequester, onPick: (String?) -> Unit, onDay: () -> Unit) {
    PanelHeader(stringResource(R.string.media_mark_watched), ask.name)
    PanelItem(Lucide.Clock, stringResource(R.string.media_watched_at_now), Modifier.focusRequester(first)) { onPick(null) }
    PanelItem(Lucide.Calendar, stringResource(R.string.media_watched_at_released)) { onPick(WatchedAt.RELEASED) }
    PanelItem(Lucide.CalendarClock, stringResource(R.string.media_watched_at_other), onClick = onDay)
    PanelItem(Lucide.CalendarOff, stringResource(R.string.media_watched_at_unknown)) { onPick(WatchedAt.UNKNOWN) }
}

/**
 * The day, picked with the remote: a line each for the day, the month,
 * and the year, which Left and Right change, up to today, then the
 * button that marks it.
 */
@Composable
private fun DayView(ask: WatchedAsk, first: FocusRequester, onPick: (String) -> Unit) {
    val today = remember { LocalDate.now() }
    var day by remember { mutableStateOf(today) }
    val locale = Locale.getDefault()
    PanelHeader(stringResource(R.string.media_watched_date_title), ask.name)
    DayField(day.dayOfMonth.toString(), Modifier.focusRequester(first)) { step ->
        day = day.withDayOfMonth(Math.floorMod(day.dayOfMonth - 1 + step, day.lengthOfMonth()) + 1).coerceAtMost(today)
    }
    DayField(day.month.getDisplayName(TextStyle.FULL_STANDALONE, locale)) { step ->
        day = day.plusMonths(step.toLong()).coerceAtMost(today)
    }
    DayField(day.year.toString()) { step ->
        day = day.plusYears(step.toLong()).coerceAtMost(today)
    }
    Box(Modifier.padding(top = 16.dp))
    PanelItem(Lucide.Check, stringResource(R.string.media_mark_watched)) {
        onPick(watchedAtOn(day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()))
    }
}

private fun LocalDate.coerceAtMost(max: LocalDate) = if (isAfter(max)) max else this

/** One part of the day: Left and Right step it by [onStep]'s one back or forward. */
@Composable
private fun DayField(value: String, modifier: Modifier = Modifier, onStep: (Int) -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(12.dp)
    val content = if (focused) Palette.Background else Palette.Foreground
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .onKeyEvent { event ->
                val step = when (event.key) {
                    Key.DirectionLeft -> -1
                    Key.DirectionRight -> 1
                    else -> return@onKeyEvent false
                }
                if (event.type == KeyEventType.KeyDown) onStep(step)
                true
            }
            .clip(shape)
            .background(if (focused) Palette.Foreground else Palette.Foreground.copy(alpha = 0.06f))
            .clickable(interaction, indication = null, role = Role.Button) { }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(Lucide.ChevronLeft, null, size = 20.dp, tint = if (focused) content else Color.Transparent)
        Text(value, style = TvType.Facts, color = content, modifier = Modifier.weight(1f).padding(horizontal = 12.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        LucideIcon(Lucide.ChevronRight, null, size = 20.dp, tint = if (focused) content else Color.Transparent)
    }
    Box(Modifier.padding(top = 8.dp))
}
