package io.github.zekurio.matinee.ui.tv.home

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.FeaturedTitle
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.ActionTarget
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.landscape
import io.github.zekurio.matinee.ui.components.shelfCardModel
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.formatRating
import io.github.zekurio.matinee.ui.home.RailState
import io.github.zekurio.matinee.ui.home.failedOutright
import io.github.zekurio.matinee.ui.home.railState
import io.github.zekurio.matinee.ui.home.rememberHomeLoaders
import io.github.zekurio.matinee.ui.home.rememberShelf
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.progressRatio
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.timeLeft
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.PinnedRows
import io.github.zekurio.matinee.ui.tv.ShowBackdrop
import io.github.zekurio.matinee.ui.tv.TvButton
import io.github.zekurio.matinee.ui.tv.TvCards
import io.github.zekurio.matinee.ui.tv.TvFocusMemory
import io.github.zekurio.matinee.ui.tv.TvLandscapeCard
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvPosterCard
import io.github.zekurio.matinee.ui.tv.TvRow
import io.github.zekurio.matinee.ui.tv.TvTitleLogo
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.fadeTop
import io.github.zekurio.matinee.ui.tv.rememberPinnedRowsFling
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory

/** The header's room above the rows, so the rows start in the same place whatever it says. */
private val HEADER_HEIGHT = 226.dp

/** Above the focused card in the rows: the list's top padding, a row's heading, and the gap under it. */
private val ROW_PIVOT = 12.dp + TvCards.TitleHeight + TvCards.TitleGap

/** Room after the last row, so it too can scroll up to where the focused row sits. */
private val ROWS_END = 320.dp

/**
 * Home on a TV, as Wholphin's: the focused card's backdrop behind the
 * page, its name, facts, and overview in a header at the top, and Home's
 * rows under it, the phone's rows in the phone's order from the same
 * loads. The focused row scrolls to the same place under the header.
 */
@Composable
fun TvHomeScreen() {
    val loaders = rememberHomeLoaders()
    val memory = rememberTvFocusMemory()
    val model: TvHomeModel = viewModel()
    val focused = model.focused
    // Each row's first card, in the rows' order, for focus the first time.
    val firsts = remember { mutableStateMapOf<String, String>() }
    val order = remember { mutableStateOf(emptyList<String>()) }
    memory.Restore {
        // The rows above the libraries show only once loaded, so wait for them: focus taken
        // sooner would sit in a row they then push down.
        if (listOf(loaders.featured, loaders.resume, loaders.nextUp).any { it.state is Load.Loading }) return@Restore null
        // The row focus was in last comes first, for when its card is gone.
        (listOfNotNull(memory.lastRow) + order.value).firstNotNullOfOrNull { row -> firsts[row]?.let { row to it } }
    }
    ShowBackdrop(focused?.backdrop.orEmpty())

    val libraries = loaders.libraries
    if (failedOutright(libraries.state, listOf(loaders.resume.state, loaders.nextUp.state, loaders.featured.state))) {
        Message(
            stringResource(R.string.home_failed),
            (libraries.state as? Load.Failed)?.message,
        ) { loaders.all.forEach { it.reload() } }
        return
    }
    val libs = (libraries.state as? Load.Ready)?.value
    val loaded = (loaders.featured.state as? Load.Ready)?.value
    LaunchedEffect(loaded) { loaded?.let(model::offer) }
    val featured = model.featured ?: loaded
    val list = rememberLazyListState()
    LaunchedEffect(model, list) {
        // A new pick waits until the row is out of sight and focus isn't in it.
        snapshotFlow {
            val info = list.layoutInfo
            // The list lays out a row a little past its edge, so look at where it is.
            val seen = info.visibleItemsInfo.any { it.key == FEATURED && it.offset + it.size > info.viewportStartOffset }
            model.pending != null && memory.lastRow != FEATURED && info.visibleItemsInfo.isNotEmpty() && !seen
        }.collect { hidden -> if (hidden) model.swap() }
    }
    val rows = buildList {
        if (!featured.isNullOrEmpty()) add(FEATURED)
        add(CONTINUE)
        add(NEXT_UP)
        libs?.forEach { add(shelfKey(it)) }
    }
    SideEffect { order.value = rows }

    Box(Modifier.fillMaxSize()) {
        Header(focused, Modifier.padding(start = TvPage.Start, end = 220.dp, top = Overscan.Vertical + 8.dp).height(HEADER_BODY))
        val onFocus: (FocusedItem) -> Unit = { model.focused = it }
        PinnedRows(ROW_PIVOT) {
            LazyColumn(
                Modifier.fillMaxSize().padding(top = HEADER_HEIGHT).fadeTop(12.dp),
                state = list,
                flingBehavior = rememberPinnedRowsFling(list),
                contentPadding = PaddingValues(top = 12.dp, bottom = ROWS_END),
                verticalArrangement = Arrangement.spacedBy(28.dp),
            ) {
                featuredRow(featured, memory, firsts, onFocus)
                itemRow(CONTINUE, R.string.browse_continue_watching, R.string.home_continue_failed, loaders.resume, memory, firsts, onFocus)
                itemRow(NEXT_UP, R.string.browse_next_up, R.string.home_next_up_failed, loaders.nextUp, memory, firsts, onFocus)
                when (val state = libraries.state) {
                    Load.Loading -> item(key = "loading") { Loading() }
                    is Load.Failed -> item(key = "libraries-failed") {
                        RowNotice(null, stringResource(R.string.home_load_failed), state.message, libraries::reload)
                    }
                    is Load.Ready -> if (state.value.isEmpty()) {
                        item(key = "empty") { NoLibraries() }
                    } else {
                        state.value.forEach { library ->
                            item(key = shelfKey(library)) { ShelfRow(library, memory, firsts, onFocus) }
                        }
                    }
                }
            }
        }
    }
}

/**
 * What TV Home keeps while it's on the back stack, so it comes back as it
 * was left: the card the header shows, and the featured titles. The server
 * picks other featured titles each time it's asked, and Home asks again
 * whenever something is watched. That suits the phone's banner, but a row
 * that changed under the person, or on the way back from a title, would
 * lose the card focus was on. A new pick waits in [pending] for [swap].
 */
internal class TvHomeModel : ViewModel() {
    var focused by mutableStateOf<FocusedItem?>(null)
    var featured by mutableStateOf<List<FeaturedTitle>?>(null)
        private set
    var pending by mutableStateOf<List<FeaturedTitle>?>(null)
        private set

    fun offer(next: List<FeaturedTitle>) {
        if (featured == null) featured = next else if (next != featured) pending = next
    }

    /** Show the newest pick, if one is waiting. */
    fun swap() {
        pending?.let { featured = it }
        pending = null
    }
}

private const val FEATURED = "featured"
private const val CONTINUE = "continue"
private const val NEXT_UP = "nextUp"

private fun shelfKey(library: Library) = "shelf-${library.id}"

/** Puts [row]'s first card in [firsts] while it shows one. */
@Composable
private fun FirstCard(firsts: MutableMap<String, String>, row: String, first: String?) {
    SideEffect { if (first == null) firsts.remove(row) else firsts[row] = first }
}

/** The featured titles, the phone's banner, as a row of posters; the header shows the one focused. */
private fun LazyListScope.featuredRow(
    slides: List<FeaturedTitle>?,
    memory: TvFocusMemory,
    firsts: MutableMap<String, String>,
    onFocus: (FocusedItem) -> Unit,
) {
    if (slides.isNullOrEmpty()) return
    item(key = FEATURED) {
        val api = LocalApi.current
        val nav = LocalNavigator.current
        val res = LocalResources.current
        val viewer = androidx.compose.ui.platform.LocalContext.current.app.viewer
        FirstCard(firsts, FEATURED, slides.first().title.id)
        TvRow(stringResource(R.string.tv_home_featured), FEATURED, memory) {
            items(slides, key = { it.title.id }) { slide ->
                val info = remember(slide) { featuredInfo(slide, api, res) }
                TvPosterCard(
                    slide.title.name,
                    api.art(slide.title.images.poster),
                    onClick = { nav.title(slide.title) },
                    watched = viewer.isWatched(slide.title),
                    menu = ActionTarget.Title(slide.title, null, here = false),
                    modifier = with(memory) { Modifier.item(FEATURED, slide.title.id) }.onFocusChanged { if (it.isFocused) onFocus(info) },
                )
            }
        }
    }
}

/** Continue watching or Next up: nothing while loading or empty, as on the phone; a notice when it failed. */
private fun LazyListScope.itemRow(
    key: String,
    title: Int,
    failed: Int,
    loader: Loader<List<MediaItem>>,
    memory: TvFocusMemory,
    firsts: MutableMap<String, String>,
    onFocus: (FocusedItem) -> Unit,
) {
    when (val rail = railState(loader.state)) {
        RailState.Loading, RailState.Empty -> Unit
        is RailState.Failed -> item(key = key) {
            RowNotice(stringResource(title), stringResource(failed), rail.message, loader::reload)
        }
        is RailState.Shown -> item(key = key) {
            val api = LocalApi.current
            val nav = LocalNavigator.current
            val res = LocalResources.current
            val viewer = androidx.compose.ui.platform.LocalContext.current.app.viewer
            FirstCard(firsts, key, rail.items.first().id)
            TvRow(stringResource(title), key, memory) {
                items(rail.items, key = { it.id }) { item ->
                    val info = remember(item) { itemInfo(item, api, res) }
                    val label = itemLabel(item, res)
                    val code = episodeCode(item, res)
                    val left = if (item.progress?.completed == false) timeLeft(item, res) else null
                    TvLandscapeCard(
                        toneKey = label.showName,
                        art = api.landscape(item),
                        caption = label.showName,
                        detail = listOfNotNull(code, left ?: label.year.takeIf { code == null }).joinToString(" · ").ifEmpty { null },
                        onClick = { nav.item(item) },
                        progress = progressRatio(item),
                        watched = viewer.isWatched(item),
                        menu = ActionTarget.Item(item, here = false),
                        focus = with(memory) { Modifier.item(key, item.id) }.onFocusChanged { if (it.isFocused) onFocus(info) },
                    )
                }
            }
        }
    }
}

/** A library's newest titles as posters. */
@Composable
private fun ShelfRow(library: Library, memory: TvFocusMemory, firsts: MutableMap<String, String>, onFocus: (FocusedItem) -> Unit) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val viewer = androidx.compose.ui.platform.LocalContext.current.app.viewer
    val key = shelfKey(library)
    val entries = rememberShelf(library)
    val title = stringResource(R.string.browse_recently_added, library.name)
    when (val state = railState(entries.state)) {
        RailState.Loading -> {
            FirstCard(firsts, key, null)
            RowNotice(title, null, null, null, SHELF_HEIGHT)
        }
        is RailState.Failed -> {
            FirstCard(firsts, key, null)
            RowNotice(title, stringResource(R.string.home_shelf_failed), state.message, entries::reload, SHELF_HEIGHT)
        }
        RailState.Empty -> {
            FirstCard(firsts, key, null)
            RowNotice(title, stringResource(R.string.browse_empty_shelf), null, null, SHELF_HEIGHT)
        }
        is RailState.Shown -> {
            FirstCard(firsts, key, state.items.first().title.id)
            TvRow(title, key, memory) {
                items(state.items, key = { it.title.id }) { entry ->
                    val card = remember(entry) { shelfCardModel(entry, api, res) }
                    val info = remember(entry) { shelfInfo(entry, card, api, res) }
                    TvPosterCard(
                        entry.title.name,
                        card.poster,
                        onClick = { card.open(nav) },
                        watched = viewer.isWatched(entry.title),
                        menu = ActionTarget.Title(entry.title, null, here = false),
                        modifier = with(memory) { Modifier.item(key, entry.title.id) }.onFocusChanged { if (it.isFocused) onFocus(info) },
                    )
                }
            }
        }
    }
}

/**
 * The focused card's logo or name, facts, and overview, over the backdrop.
 * It fades from one card to the next rather than jumping. Its height is
 * fixed, so the overview takes what lines the rest leaves.
 */
@Composable
private fun Header(item: FocusedItem?, modifier: Modifier = Modifier) {
    AnimatedContent(
        item,
        modifier.fillMaxWidth(),
        transitionSpec = { fadeIn(Motion.enter()) togetherWith fadeOut(Motion.exit()) },
        contentAlignment = Alignment.TopStart,
        label = "homeHeader",
    ) { shown ->
        if (shown == null) return@AnimatedContent
        // One line until the name is laid out and says it took two. A logo that fails shows the name.
        var nameLines by remember { mutableIntStateOf(1) }
        val name = NAME_LINE * nameLines
        val mark = if (shown.logo != null) maxOf(LOGO_HEIGHT, name) else name
        val subtitle = if (shown.subtitle != null) SUBTITLE_HEIGHT else 0.dp
        val overviewLines = ((HEADER_BODY - mark - subtitle - FACTS_HEIGHT - 12.dp) / OVERVIEW_LINE).toInt().coerceIn(0, if (shown.subtitle != null) 2 else 3)
        Column(Modifier.fillMaxWidth()) {
            TvTitleLogo(shown.name, shown.logo, Modifier.size(width = LOGO_WIDTH, height = LOGO_HEIGHT), alignment = Alignment.BottomStart) {
                Text(
                    shown.name,
                    style = TvType.Display,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    onTextLayout = { nameLines = it.lineCount },
                )
            }
            if (shown.subtitle != null) {
                Text(
                    shown.subtitle,
                    style = TvType.Title,
                    color = Palette.Foreground.copy(alpha = 0.9f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            Facts(shown, Modifier.padding(top = 10.dp))
            if (shown.overview != null && overviewLines > 0) {
                Text(
                    shown.overview,
                    style = TvType.Body,
                    color = Palette.Foreground.copy(alpha = 0.75f),
                    maxLines = overviewLines,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 12.dp).widthIn(max = 560.dp),
                )
            }
        }
    }
}

/** The header's room under the overscan: [HEADER_HEIGHT] less its top padding. */
private val HEADER_BODY = HEADER_HEIGHT - Overscan.Vertical - 8.dp

/**
 * The box a logo fits in, at its bottom left: as tall as still leaves an
 * episode's overview its two lines.
 */
private val LOGO_WIDTH = 360.dp
private val LOGO_HEIGHT = 70.dp

/** A line of the name, in [TvType.Display]. */
private val NAME_LINE = 40.dp

/** The episode line with its gap, the facts with theirs, and a line of overview. */
private val SUBTITLE_HEIGHT = 28.dp
private val FACTS_HEIGHT = 32.dp
private val OVERVIEW_LINE = 24.dp

/** Year, length, and the like, then the age rating in a box and the score by its star. */
@Composable
private fun Facts(item: FocusedItem, modifier: Modifier = Modifier) {
    val color = Palette.Foreground.copy(alpha = 0.85f)
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        if (item.facts.isNotEmpty()) Text(item.facts.joinToString("  ·  "), style = TvType.Facts, color = color, maxLines = 1)
        item.contentRating?.let {
            Text(
                it,
                style = TvType.Caption,
                color = color,
                maxLines = 1,
                modifier = Modifier
                    .border(1.dp, Palette.Foreground.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 8.dp, vertical = 1.dp),
            )
        }
        item.rating?.let {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                LucideIcon(Lucide.Star, stringResource(R.string.media_hero_rated), size = 16.dp, tint = Palette.Star)
                Text(formatRating(it), style = TvType.Facts, color = color)
            }
        }
    }
}

/**
 * A row that has no cards to show: its heading and why, with a way to try
 * again where there is one. Without [headline], a row still loading.
 * [height] is the room under the heading, a library's as tall as its
 * posters, so the rows under it stay put when they come.
 */
@Composable
private fun RowNotice(title: String?, headline: String?, message: String?, onRetry: (() -> Unit)?, height: Dp = ROW_NOTICE_HEIGHT) {
    Column(Modifier.fillMaxWidth().padding(start = TvPage.Start, end = TvPage.End)) {
        if (title != null) Text(title, style = TvType.Title, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.height(TvCards.TitleHeight))
        Row(
            Modifier.padding(top = TvCards.TitleGap).height(height),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            if (headline == null) {
                CircularProgressIndicator(color = Palette.Muted, strokeWidth = 3.dp, modifier = Modifier.size(28.dp))
            } else {
                Column(Modifier.weight(1f, fill = false)) {
                    Text(headline, style = TvType.Body, color = Palette.Foreground.copy(alpha = 0.85f))
                    if (message != null) Text(message, style = TvType.Caption, color = Palette.Muted)
                }
                if (onRetry != null) {
                    TvButton(stringResource(R.string.common_retry), onRetry, icon = Lucide.RefreshCw)
                }
            }
        }
    }
}

private val ROW_NOTICE_HEIGHT: Dp = 96.dp

/** A row of posters under its heading: [TvRow]'s posters and the room it leaves below them. */
private val SHELF_HEIGHT: Dp = TvCards.PosterWidth * 1.5f + 4.dp

@Composable
private fun Loading() {
    Box(Modifier.fillMaxWidth().height(ROW_NOTICE_HEIGHT), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Palette.Muted, strokeWidth = 3.dp, modifier = Modifier.size(32.dp))
    }
}

@Composable
private fun NoLibraries() {
    val user = LocalUser.current
    Column(Modifier.fillMaxWidth().padding(start = TvPage.Start, end = TvPage.End)) {
        val admin = user.isAdmin
        Text(stringResource(if (admin) R.string.browse_home_no_libraries else R.string.browse_home_nothing_yet), style = TvType.Headline)
        Text(
            stringResource(if (admin) R.string.browse_home_no_libraries_admin else R.string.browse_home_nothing_yet_description),
            style = TvType.Body,
            color = Palette.Muted,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

/** Home as one message, when nothing on it loaded. */
@Composable
private fun Message(title: String, message: String?, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(start = TvPage.Start, end = TvPage.End),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = TvType.Headline)
        if (message != null) Text(message, style = TvType.Body, color = Palette.Muted, modifier = Modifier.padding(top = 8.dp))
        TvButton(stringResource(R.string.common_retry), onRetry, Modifier.padding(top = 28.dp), icon = Lucide.RefreshCw)
    }
}
