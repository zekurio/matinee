package io.github.zekurio.matinee.ui.home

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PageSize
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.FeaturedTitle
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.isShow
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.ActionTarget
import io.github.zekurio.matinee.ui.components.BlurHash
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.frame
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.components.tone
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.PageDots
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.Shapes
import io.github.zekurio.matinee.ui.kit.focusRing
import io.github.zekurio.matinee.ui.rememberReducedMotion
import io.github.zekurio.matinee.ui.rememberTouchExploration
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/*
 * The featured titles at the top of Home, after Findroid's HomeCarousel.kt
 * and HomeCarouselItem.kt and the iPhone app's HomeCarousel.swift: a row of
 * cards that swipes sideways, each the title's backdrop under a dark shade
 * with its genres and its name typed out. How many share the row, their
 * sizes, where it rests, where the advance goes next, and the genres line
 * are FeaturedCarousel.kt's, where they're tested. Debug stand-ins are
 * HomeCarouselDevData.kt's. Home shows it in a window under 600 dp wide, a
 * phone's; from there it opens with the banner (Hero.kt).
 */

/**
 * Home's featured titles as a row of cards. A tap opens the title, a long
 * press its actions, Play among them. One card per swipe, as Material's
 * pager flings. It moves on to the next card every five seconds and back to
 * the first after the last; not while a finger drags it, a card's actions
 * are open, TalkBack is on, animations are off, or Home isn't in front. On
 * a window from 600 dp wide, previous and next buttons beside the dots step
 * it, for a mouse or a keyboard.
 */
@Composable
internal fun HomeCarousel(slides: List<FeaturedTitle>, dev: HomeCarouselDevData?, modifier: Modifier = Modifier) {
    val config = LocalConfiguration.current
    val density = LocalDensity.current
    val api = LocalApi.current
    val actions = LocalActions.current
    val wide = isWide()
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val layout = FeaturedCarousel.layout(
            rowWidth = maxWidth.value,
            windowWidth = config.screenWidthDp.toFloat(),
            windowHeight = config.screenHeightDp.toFloat(),
            gutter = Gutter.value,
            count = slides.size,
        )
        val cardWidth = layout.cardWidth.dp
        val arts = remember(slides, api, dev) { slides.mapIndexed { index, slide -> cardArt(api, slide, dev?.art(index)) } }
        // Two lines of name, or three once the text is large, as iOS's accessibility sizes.
        val nameLines = if (density.fontScale >= 1.5f) 3 else 2
        val nameStyle = nameStyle(cardWidth)
        val cardHeight = cardHeight(slides, arts, layout, nameStyle, nameLines)

        val pager = rememberPagerState { slides.size }
        val stop by remember(layout.stops) {
            derivedStateOf { FeaturedCarousel.stop(pager.currentPage + pager.currentPageOffsetFraction, 1f, layout.stops) }
        }
        val dragged by pager.interactionSource.collectIsDraggedAsState()
        val resumed by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
        val exploring = rememberTouchExploration()
        val reducedMotion = rememberReducedMotion()
        val paused = dragged ||
            dev?.startStop != null ||
            actions.target != null ||
            exploring ||
            reducedMotion ||
            !resumed.isAtLeast(Lifecycle.State.RESUMED) ||
            layout.stops < 2
        val scope = rememberCoroutineScope()
        // Waits five seconds wherever the row comes to rest, and starts again
        // whenever it moves. The move runs outside the wait, so that the move
        // itself, which starts a new wait once it lands, doesn't cancel it.
        LaunchedEffect(paused, layout.stops) {
            if (paused) return@LaunchedEffect
            snapshotFlow { if (pager.isScrollInProgress) null else stop }.collectLatest { at ->
                if (at == null) return@collectLatest
                delay(FeaturedCarousel.ADVANCE_MS)
                scope.launch {
                    pager.glide(FeaturedCarousel.next(at, layout.stops), tween(FeaturedCarousel.MOVE_MS, easing = Motion.Easing))
                }
            }
        }
        // A debug folder's `stop`: resting at a card, or part of the way to the next.
        LaunchedEffect(layout.stride, dev) {
            val start = dev?.startStop ?: return@LaunchedEffect
            val page = start.toInt().coerceIn(0, (slides.size - 1).coerceAtLeast(0))
            pager.scrollToPage(page, (start - page).coerceIn(-0.5f, 0.5f))
        }
        LaunchedEffect(dev) {
            if (dev?.opensActions != true) return@LaunchedEffect
            delay(1000)
            actions.open(featuredTarget(slides.first()))
        }

        Column(Modifier.fillMaxWidth()) {
            HorizontalPager(
                pager,
                Modifier.fillMaxWidth().height(cardHeight),
                contentPadding = PaddingValues(horizontal = Gutter),
                pageSize = PageSize.Fixed(cardWidth),
                pageSpacing = layout.gap.dp,
                beyondViewportPageCount = 1,
                verticalAlignment = Alignment.Top,
            ) { index ->
                FeaturedCard(slides[index], arts[index], index, slides.size, cardWidth, cardHeight, nameStyle, nameLines)
            }
            if (layout.stops > 1) {
                val step = { by: Int ->
                    val target = if (by > 0) FeaturedCarousel.next(stop, layout.stops) else FeaturedCarousel.previous(stop, layout.stops)
                    scope.launch { pager.glide(target, Motion.move()) }
                    Unit
                }
                if (wide) {
                    Row(
                        Modifier.fillMaxWidth().padding(start = Gutter, end = Gutter - 6.dp, top = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        PageDots(layout.stops, stop)
                        Spacer(Modifier.weight(1f))
                        RoundIconButton(Lucide.ChevronLeft, stringResource(R.string.home_featured_previous), { step(-1) }, size = 36.dp, background = Color.Transparent)
                        RoundIconButton(Lucide.ChevronRight, stringResource(R.string.home_featured_next), { step(1) }, size = 36.dp, background = Color.Transparent)
                    }
                } else {
                    PageDots(layout.stops, stop, Modifier.align(Alignment.CenterHorizontally).padding(top = 12.dp))
                }
            }
        }
    }
}

/** Moves the row to rest at [target], through every card between, as a finger would. */
private suspend fun PagerState.glide(target: Int, spec: AnimationSpec<Float>) {
    val stride = layoutInfo.pageSize + layoutInfo.pageSpacing
    animateScrollBy((target - (currentPage + currentPageOffsetFraction)) * stride, spec)
}

/** The name's style: text-22 semibold and tight, or text-28 on a card 560 dp or wider. */
@Composable
private fun nameStyle(cardWidth: Dp): TextStyle {
    val base = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold, color = Color.White, shadow = pictureShadow())
    return if (cardWidth >= 560.dp) base.copy(fontSize = 28.sp, lineHeight = 32.sp) else base
}

/** The genres' style: text-13 medium, white at 80%. */
@Composable
private fun genresStyle(): TextStyle = MaterialTheme.typography.bodySmall.copy(
    fontWeight = FontWeight.Medium,
    color = Color.White.copy(alpha = 0.8f),
    shadow = pictureShadow(),
)

/** A small shadow under text on a picture, as the iPhone's `pictureShadow()`: black at 60%, 1 dp soft, 1 dp down. */
@Composable
private fun pictureShadow(): Shadow {
    val px = with(LocalDensity.current) { 1.dp.toPx() }
    return Shadow(Color.Black.copy(alpha = 0.6f), Offset(0f, px), blurRadius = px)
}

/**
 * How tall the cards are: [FeaturedCarousel.cardHeight], or taller when
 * large text needs it for the longest name, so every card in the row keeps
 * one height.
 */
@Composable
private fun cardHeight(slides: List<FeaturedTitle>, arts: List<CardArt>, layout: CarouselLayout, nameStyle: TextStyle, nameLines: Int): Dp {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val genres = genresStyle()
    val base = layout.cardHeight.dp
    val needed = with(density) {
        slides.indices.maxOfOrNull { index ->
            val textWidth = (layout.cardWidth.dp - PADDING * 2 - if (arts[index] is CardArt.Poster) posterRoom(base) else 0.dp).roundToPx()
            val constraints = Constraints(maxWidth = textWidth.coerceAtLeast(0))
            val name = measurer.measure(slides[index].featuredName, nameStyle, maxLines = nameLines, constraints = constraints).size.height
            val line = slides[index].cardLine()?.let {
                measurer.measure(it, genres, maxLines = 1, constraints = constraints).size.height + LINE_GAP.roundToPx()
            } ?: 0
            (name + line + (PADDING * 2).roundToPx()).toDp()
        } ?: 0.dp
    }
    return maxOf(base, needed)
}

/** The card's padding around its text. */
private val PADDING = 16.dp

/** The gap between the genres and the name. */
private val LINE_GAP = 4.dp

/** The poster's inset from the card's edges, when the title has only that. */
private val POSTER_INSET = 12.dp

/** How much of the card's width a poster takes, with its inset, for a card [height] tall. */
private fun posterRoom(height: Dp) = (height - POSTER_INSET * 2) * 2f / 3f + POSTER_INSET

/** What a card's long press opens: the title's actions, Play first. A movie's file is the movie, which the sheet can download. */
private fun featuredTarget(slide: FeaturedTitle) = ActionTarget.Title(slide.title, if (slide.title.isShow) null else slide.item, here = false)

/**
 * One featured title: its backdrop at 16:9 under a dark shade, the same in
 * light and dark, and over it at the bottom its genres, then its name, in
 * white. The card says nothing else; its actions and its page carry the
 * rest. To TalkBack it's one button: the name, then the genres and where
 * it is in the row.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FeaturedCard(
    slide: FeaturedTitle,
    art: CardArt,
    index: Int,
    count: Int,
    width: Dp,
    height: Dp,
    nameStyle: TextStyle,
    nameLines: Int,
) {
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val interaction = remember { MutableInteractionSource() }
    val line = slide.cardLine()
    val position = stringResource(R.string.home_featured_position, index + 1, count)
    val description = listOfNotNull(slide.featuredName, line, position).joinToString(", ")
    val shape = Shapes.Xl
    Box(
        Modifier
            .size(width, height)
            .clip(shape)
            .focusRing(interaction, shape)
            .border(1.dp, Palette.Foreground.copy(alpha = 0.1f), shape)
            .combinedClickable(
                interactionSource = interaction,
                indication = LocalIndication.current,
                role = Role.Button,
                onLongClickLabel = stringResource(R.string.title_more_actions),
                onLongClick = { actions.open(featuredTarget(slide)) },
                onClick = { nav.title(slide.title) },
            )
            .semantics { contentDescription = description },
    ) {
        FeaturedArtwork(slide, art, height, Modifier.matchParentSize())
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .padding(PADDING)
                // Clear of the poster, when the title has only that.
                .padding(end = if (art is CardArt.Poster) posterRoom(height) else 0.dp)
                .clearAndSetSemantics {},
            verticalArrangement = Arrangement.spacedBy(LINE_GAP),
        ) {
            if (line != null) {
                Text(line, style = genresStyle(), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(slide.featuredName, style = nameStyle, maxLines = nameLines, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** A card's picture: a wide one, a poster alone, or none, which leaves the title's tone. */
private sealed interface CardArt {
    data class Wide(val sources: List<ImageSource>) : CardArt

    data class Poster(val source: ImageSource) : CardArt

    data object None : CardArt
}

/**
 * The backdrop, or a show's episode still, or a frame from the file; a
 * title with only a poster gets the poster whole at the end over a blur of
 * itself. A debug folder's picture stands in first.
 */
private fun cardArt(api: MatineeApi, slide: FeaturedTitle, standIn: StandInArt?): CardArt {
    when (standIn) {
        is StandInArt.Backdrop -> return CardArt.Wide(listOf(standIn.source))
        is StandInArt.Poster -> return CardArt.Poster(standIn.source)
        StandInArt.None -> return CardArt.None
        null -> Unit
    }
    val (title, item) = slide
    val wide = listOfNotNull(api.art(title.images.backdrop, ArtworkSize.Large), api.art(item.episode?.still, ArtworkSize.Large))
    val frame = api.frame(item.id, large = true)
    if (wide.isNotEmpty()) return CardArt.Wide(wide + frame)
    api.art(title.images.poster, ArtworkSize.Medium)?.let { return CardArt.Poster(it) }
    return CardArt.Wide(listOf(frame))
}

/**
 * The shade over a card's picture, after Findroid's: black from 10% at the
 * top, whatever the theme, so the words on it are always white on dark;
 * lighter than Findroid's through the middle, to show more of the picture,
 * and darker at the bottom, 60% where the genres sit and 80% at the edge,
 * which a snowy or busy picture needs under small text.
 */
private val SHADE = Brush.verticalGradient(
    0f to Color.Black.copy(alpha = 0.1f),
    0.4f to Color.Black.copy(alpha = 0.3f),
    0.7f to Color.Black.copy(alpha = 0.6f),
    1f to Color.Black.copy(alpha = 0.8f),
)

@Composable
private fun FeaturedArtwork(slide: FeaturedTitle, art: CardArt, height: Dp, modifier: Modifier) {
    Box(modifier.tone(slide.title.name).clipToBounds()) {
        when (art) {
            is CardArt.Wide -> Picture(art.sources, Modifier.fillMaxSize())
            is CardArt.Poster -> {
                PosterBlur(art.source, Modifier.fillMaxSize())
                val posterHeight = height - POSTER_INSET * 2
                Picture(
                    listOf(art.source),
                    Modifier
                        .align(Alignment.CenterEnd)
                        .padding(end = POSTER_INSET)
                        .size(posterHeight * 2f / 3f, posterHeight)
                        .clip(Shapes.Md),
                )
            }
            CardArt.None -> Unit
        }
        Box(Modifier.fillMaxSize().background(SHADE))
    }
}

/**
 * The poster blurred across the card, behind the poster itself. Its
 * blurhash is blurred already, and draws on every Android version; without
 * one, the picture blurred, which Android 12 and later can do.
 */
@Composable
private fun PosterBlur(source: ImageSource, modifier: Modifier) {
    val hash = source.placeholder?.blurhash
    val bitmap = remember(hash) { hash?.let { BlurHash.decode(it) } }
    if (bitmap != null) {
        Image(bitmap.asImageBitmap(), contentDescription = null, modifier = modifier, contentScale = ContentScale.Crop)
    } else {
        Picture(
            listOf(source),
            modifier
                .graphicsLayer {
                    scaleX = 1.2f
                    scaleY = 1.2f
                }
                .blur(24.dp),
        )
    }
}

/** The carousel's place while the featured titles load: its cards as they'll sit. */
@Composable
fun HomeCarouselSkeleton(modifier: Modifier = Modifier) {
    val config = LocalConfiguration.current
    val loading = stringResource(R.string.loading_in_progress)
    BoxWithConstraints(modifier.fillMaxWidth().clipToBounds().semantics { contentDescription = loading }) {
        val layout = FeaturedCarousel.layout(maxWidth.value, config.screenWidthDp.toFloat(), config.screenHeightDp.toFloat(), Gutter.value, SKELETON_CARDS)
        Row(
            Modifier.padding(start = Gutter).wrapContentWidth(Alignment.Start, unbounded = true),
            horizontalArrangement = Arrangement.spacedBy(layout.gap.dp),
        ) {
            repeat(layout.perRow + 1) {
                Box(Modifier.size(layout.cardWidth.dp, layout.cardHeight.dp).clip(Shapes.Xl).background(Palette.Card))
            }
        }
    }
}

/** As many cards as the skeleton lays out for, enough to fill any row. */
private const val SKELETON_CARDS = 6
