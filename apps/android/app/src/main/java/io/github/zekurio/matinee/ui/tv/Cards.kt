package io.github.zekurio.matinee.ui.tv

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.components.ActionTarget
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.tone
import io.github.zekurio.matinee.ui.theme.Palette

/** Sizes of TV cards and the room around them, for a 960x540dp screen. */
object TvCards {
    val PosterWidth: Dp = 124.dp
    val LandscapeWidth: Dp = 224.dp
    val Gap: Dp = 20.dp
    val Shape = RoundedCornerShape(10.dp)

    /** Between a row's heading and its cards, with room for the focus ring. */
    val TitleGap: Dp = 14.dp
}

/**
 * Where TV pages start and end across: clear of the drawer's rail on the
 * left, of the overscan on the right.
 */
object TvPage {
    /** Past the collapsed drawer's rail, with room for a first card's focus ring. */
    val Start: Dp = 80.dp
    val End: Dp = Overscan.Horizontal
}

/**
 * A card's picture as the focus target: [art] over the item's tone, with
 * the TV focus look. Select runs [onClick]. With [menu], holding Select or
 * pressing Menu opens the actions panel for it instead, and focus comes
 * back here when the panel closes. Put the card's caption, if any,
 * outside it, so only the picture grows.
 */
@Composable
fun TvArtCard(
    toneKey: String,
    aspect: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    menu: ActionTarget? = null,
    art: @Composable BoxScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val panel = LocalTvMenu.current
    val requester = remember { FocusRequester() }
    val open: (() -> Unit)? = if (menu != null && panel != null) ({ panel.open(menu, requester) }) else null
    Box(
        modifier
            .aspectRatio(aspect)
            .focusRequester(requester)
            .onKeyEvent { event ->
                if (open == null || event.key != Key.Menu) return@onKeyEvent false
                if (event.type == KeyEventType.KeyUp) open()
                true
            }
            .tvFocus(interaction, TvCards.Shape)
            .clip(TvCards.Shape)
            .tone(toneKey)
            .combinedClickable(
                interaction,
                indication = null,
                role = Role.Button,
                onClickLabel = contentDescription,
                onLongClick = open,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
        content = art,
    )
}

/** A movie or show as its 2:3 poster, its name on the tone until the picture loads. [menu] is as on [TvArtCard]. */
@Composable
fun TvPosterCard(
    name: String,
    poster: ImageSource?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    watched: Boolean = false,
    menu: ActionTarget? = null,
) {
    TvArtCard(name, 2f / 3f, onClick, modifier.width(TvCards.PosterWidth), contentDescription = name, menu = menu) {
        Text(
            name,
            style = TvType.Label,
            color = Palette.Foreground.copy(alpha = 0.75f),
            textAlign = TextAlign.Center,
            maxLines = 4,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(12.dp),
        )
        if (poster != null) Picture(listOf(poster), Modifier.fillMaxSize())
        if (watched) TvWatchedMark(Modifier.align(Alignment.TopEnd).padding(8.dp))
    }
}

/**
 * A file as a 16:9 still, for Continue watching and Next up, with how far
 * in the person is along its bottom and a caption under it. [focus] goes
 * on the picture, which is what takes focus. [menu] is as on [TvArtCard].
 */
@Composable
fun TvLandscapeCard(
    toneKey: String,
    art: List<ImageSource>,
    caption: String,
    detail: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    progress: Float? = null,
    watched: Boolean = false,
    focus: Modifier = Modifier,
    menu: ActionTarget? = null,
) {
    Column(modifier.width(TvCards.LandscapeWidth)) {
        TvArtCard(toneKey, 16f / 9f, onClick, focus.fillMaxWidth(), contentDescription = caption, menu = menu) {
            Picture(art, Modifier.fillMaxSize())
            if (watched) TvWatchedMark(Modifier.align(Alignment.TopEnd).padding(8.dp))
            else if (progress != null && progress > 0f) TvProgress(progress, Modifier.align(Alignment.BottomCenter).padding(10.dp))
        }
        Text(
            caption,
            style = TvType.Label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 12.dp),
        )
        if (detail != null) {
            Text(detail, style = TvType.Caption, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** How far into a file the person is: the accent on a dark track. */
@Composable
fun TvProgress(progress: Float, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f))) {
        Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).fillMaxHeight().background(Palette.Accent))
    }
}

/** The accent's dot on something watched. */
@Composable
fun TvWatchedMark(modifier: Modifier = Modifier) {
    Box(modifier.width(12.dp).height(12.dp).clip(CircleShape).background(Palette.Accent))
}

/**
 * A pill button for TV pages. Unfocused it's a quiet frosted pill; focused
 * it fills with the text color, inverts its content, and grows, so it's
 * the one obvious thing on screen.
 */
@Composable
fun TvButton(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = CircleShape
    Row(
        modifier
            .heightIn(min = 48.dp)
            .tvFocus(interaction, shape, scale = 1.04f)
            .clip(shape)
            .background(if (focused) Palette.Foreground else Palette.Foreground.copy(alpha = 0.12f))
            .clickable(interaction, indication = null, role = Role.Button, onClick = onClick)
            .padding(horizontal = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(LocalContentColor provides if (focused) Palette.Background else Palette.Foreground) {
            androidx.compose.material3.ProvideTextStyle(TvType.Label) { content() }
        }
    }
}

/**
 * A titled row of cards that scrolls sideways. Cards pass out of sight at
 * the drawer's rail on the left and at the screen's edge on the right, and
 * the focused card always stays clear of both, with room for its ring.
 * [key] names it in [memory], so it lands on the card it left when focus
 * comes back. Give each card `with(memory) { Modifier.item(key, cardKey) }`.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TvRow(
    title: String,
    key: String,
    memory: TvFocusMemory,
    modifier: Modifier = Modifier,
    content: LazyListScope.() -> Unit,
) {
    val density = LocalDensity.current
    val spec = remember(density) {
        with(density) { SidewaysSpec(ROW_INSET.toPx(), (TvPage.End + ROW_INSET).toPx()) }
    }
    Column(modifier.fillMaxWidth()) {
        Text(
            title,
            style = TvType.Title,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = TvPage.Start, end = TvPage.End),
        )
        CompositionLocalProvider(LocalBringIntoViewSpec provides spec) {
            LazyRow(
                with(memory) { Modifier.row(key) }.fillMaxWidth().padding(start = TvPage.Start - ROW_INSET),
                state = rememberLazyListState(),
                contentPadding = PaddingValues(start = ROW_INSET, end = TvPage.End, top = TvCards.TitleGap, bottom = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(TvCards.Gap),
                content = content,
            )
        }
    }
}

/** Room a row keeps beside its focused card, for the ring and the card's growth. */
private val ROW_INSET = 20.dp

/** Scrolls a row only as far as it takes to show the focused card [start] and [end] clear of its edges. */
@OptIn(ExperimentalFoundationApi::class)
private class SidewaysSpec(private val start: Float, private val end: Float) : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
        val trailing = offset + size
        return when {
            offset < start -> offset - start
            trailing > containerSize - end -> trailing - (containerSize - end)
            else -> 0f
        }
    }
}

/**
 * For a page of [TvRow]s under a fixed header: whichever row takes focus
 * scrolls to the same place, the focused card [pivot] below the top of the
 * list, with its row's heading above it, rather than as little as it
 * takes. Wrap the page's `LazyColumn` in it.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PinnedRows(pivot: Dp, content: @Composable () -> Unit) {
    val pivotPx = with(LocalDensity.current) { pivot.toPx() }
    val spec = remember(pivotPx) {
        object : BringIntoViewSpec {
            override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float = offset - pivotPx
        }
    }
    CompositionLocalProvider(LocalBringIntoViewSpec provides spec, content = content)
}
