package io.github.zekurio.matinee.ui.home

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.FeaturedTitle
import io.github.zekurio.matinee.api.isShow
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.frame
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.components.tone
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.formatRating
import io.github.zekurio.matinee.ui.progressRatio
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.timeLeft
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

private const val ADVANCE_MS = 8000L

/**
 * The banner at the top of Home: new and well-rated titles over their art,
 * with Play starting where the person is in each. Advances on its own until
 * the person swipes it, always forward: the pages repeat, so after the last
 * comes the first again rather than a rewind through them all.
 */
@Composable
fun Hero(slides: List<FeaturedTitle>, modifier: Modifier = Modifier, top: @Composable () -> Unit) {
    val count = slides.size
    val loops = count > 1
    val pager = rememberPagerState(initialPage = if (loops) count * (LOOPS / 2) else 0) { if (loops) count * LOOPS else count }
    var held by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    // A page left halfway, as when Home went away mid-advance, settles first.
    LaunchedEffect(pager) {
        if (pager.currentPageOffsetFraction != 0f && !pager.isScrollInProgress) pager.scrollToPage(pager.currentPage)
    }
    // Waits on the page it settled on, so the advance's own scroll, which
    // moves the current page halfway through, doesn't cancel it.
    LaunchedEffect(held, count) {
        if (held || !loops) return@LaunchedEffect
        snapshotFlow { pager.settledPage }.collectLatest { page ->
            delay(ADVANCE_MS)
            pager.animateScrollToPage(page + 1, animationSpec = tween(700, easing = FastOutSlowInEasing))
        }
    }
    // A swipe holds the banner on what the person picked. Only a drag
    // counts: the banner's own advance scrolls too.
    val dragged by pager.interactionSource.collectIsDraggedAsState()
    LaunchedEffect(dragged) { if (dragged) held = true }
    Box(modifier.fillMaxWidth()) {
        HorizontalPager(pager, Modifier.fillMaxSize(), beyondViewportPageCount = 1) { page ->
            // How far the page sits from the middle, in pages: 1 one page off to the right.
            Slide(slides[page % count]) { (page - pager.currentPage) - pager.currentPageOffsetFraction }
        }
        HeroButtons(slides[pager.currentPage % count], Modifier.align(Alignment.BottomStart))
        Column(Modifier.fillMaxWidth().align(Alignment.TopStart)) { top() }
        // A phone's banner is kept short so two rows fit under it, and has
        // no room for dots; it's swiped, and advances on its own.
        if (loops && isWide()) {
            val current = pager.currentPage % count
            Row(
                Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                slides.indices.forEach { index ->
                    val active = index == current
                    val width by animateDpAsState(if (active) 20.dp else 6.dp, label = "hero dot")
                    Box(
                        Modifier
                            .padding(vertical = 8.dp)
                            .height(6.dp)
                            .width(width)
                            .clip(CircleShape)
                            .background(if (active) Palette.Foreground else Palette.Foreground.copy(alpha = 0.4f))
                            .clickable(onClickLabel = stringResource(R.string.media_hero_show_slide, index + 1)) {
                                held = true
                                // The nearest page showing that slide.
                                scope.launch { pager.animateScrollToPage(pager.currentPage - current + index) }
                            },
                    )
                }
            }
        }
    }
}

/** How many times over the banner's pages repeat, so it can keep going forward. */
private const val LOOPS = 1000

/**
 * One slide. Its art holds still and crossfades with the next one's as the
 * pages move, as the web's banner does, rather than the pictures sliding
 * edge to edge; its text slides with the page. [offset] is how far the page
 * is from the middle, in pages, read only while drawing.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Slide(slide: FeaturedTitle, offset: () -> Float) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val (title, item, count) = slide
    val wide = isWide()
    val sources = listOfNotNull(
        api.art(title.images.backdrop, ArtworkSize.Large),
        api.art(item.episode?.still, ArtworkSize.Large),
        api.frame(item.id, large = true),
    )
    val ratio = progressRatio(item)
    val left = timeLeft(item, res)
    val resuming = left != null && ratio != null
    Box(Modifier.fillMaxSize()) {
        // The picture and its shade hold still where the middle page is and
        // fade. Pages draw left to right, so the one on the right fades over
        // the one under it, which stays whole: a crossfade without a seam
        // or a dip to dark.
        Box(
            Modifier
                .fillMaxSize()
                .graphicsLayer {
                    val away = offset()
                    translationX = -away * size.width
                    alpha = if (away > 0f) (1f - away).coerceIn(0f, 1f) else 1f
                }
                .tone(title.name),
        ) {
            Picture(sources, Modifier.fillMaxSize(), alignment = Alignment.TopCenter)
            if (wide) {
                // Darken where the text sits and fade into the page below.
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.horizontalGradient(
                            0f to Palette.Background.copy(alpha = 0.95f),
                            0.5f to Palette.Background.copy(alpha = 0.6f),
                            1f to Color.Transparent,
                        ),
                    ),
                )
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.verticalGradient(
                            0f to Palette.Background.copy(alpha = 0.55f),
                            0.25f to Color.Transparent,
                            0.55f to Palette.Background.copy(alpha = 0.4f),
                            1f to Palette.Background,
                        ),
                    ),
                )
            } else {
                // A phone's text spans the width at the bottom, so it gets a
                // shadow there, and none down the side, which hid half the
                // picture. The header has its own shadow at the top.
                Box(
                    Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(0.62f).background(
                        Brush.verticalGradient(
                            0f to Color.Transparent,
                            0.45f to Palette.Background.copy(alpha = 0.7f),
                            1f to Palette.Background,
                        ),
                    ),
                )
            }
        }
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                // Above the buttons, which stay while the slides swipe.
                .padding(start = Gutter, end = Gutter, bottom = heroBottom() + HERO_BUTTONS),
        ) {
            TitleMark(slide, Modifier.widthIn(max = 512.dp))
            Gap(10.dp)
            val facts = listOfNotNull(
                title.year?.toString(),
                if (title.isShow && count > 1) res.getQuantityString(R.plurals.media_episode_count, count, count) else null,
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                if (facts.isNotEmpty()) {
                    Text(facts.joinToString(" · "), style = MaterialTheme.typography.bodyLarge, color = Palette.Foreground.copy(alpha = 0.8f))
                }
                title.contentRating?.let { rating ->
                    Text(
                        rating,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp),
                        color = Palette.Foreground.copy(alpha = 0.8f),
                        modifier = Modifier
                            .border(1.dp, Palette.Foreground.copy(alpha = 0.3f), MaterialTheme.shapes.extraSmall)
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                }
                title.rating?.let { rating ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        LucideIcon(Lucide.Star, stringResource(R.string.media_hero_rated), size = 14.dp, tint = Palette.Star)
                        Text(formatRating(rating), style = MaterialTheme.typography.bodyLarge, color = Palette.Foreground.copy(alpha = 0.8f))
                    }
                }
            }
            // A phone's short banner has room for the genres or how far the
            // person is, not both; where they are matters more.
            if (title.genres.isNotEmpty() && (wide || !resuming)) {
                Gap(8.dp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    title.genres.take(3).forEach { genre ->
                        Text(
                            genre,
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Normal, fontSize = 12.sp),
                            color = Palette.Foreground.copy(alpha = 0.85f),
                            maxLines = 1,
                            modifier = Modifier
                                .clip(CircleShape)
                                .border(1.dp, Palette.Foreground.copy(alpha = 0.15f), CircleShape)
                                .background(Palette.Background.copy(alpha = 0.3f))
                                .clickable { nav.genre(genre) }
                                .padding(horizontal = 10.dp, vertical = 2.dp),
                        )
                    }
                }
            }
            if (wide && title.overview != null) {
                Gap(8.dp)
                Text(
                    title.overview,
                    style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 24.sp),
                    color = Palette.Foreground.copy(alpha = 0.7f),
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 576.dp),
                )
            }
            if (resuming) {
                Gap(12.dp)
                Row(
                    Modifier.widthIn(max = 320.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.weight(1f).height(4.dp).clip(CircleShape).background(Palette.Foreground.copy(alpha = 0.25f))) {
                        Box(Modifier.fillMaxWidth(ratio).height(4.dp).clip(CircleShape).background(Palette.Foreground))
                    }
                    val code = episodeCode(item, res)
                    Text(
                        if (code != null) "$code · $left" else left.orEmpty(),
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Normal, fontSize = 12.sp),
                        color = Palette.Foreground.copy(alpha = 0.8f),
                    )
                }
            }
        }
    }
}

/** The buttons' height and the gap above them, which a slide's text leaves free. */
private val HERO_BUTTONS = 44.dp + 14.dp

/**
 * Play and the title's page, for the slide showing. One row that stays in
 * place while the slides swipe under it, and reads the same for every
 * slide so nothing in it changes mid-swipe, as on the web: Play picks up
 * where the person is, which the slide's progress bar shows, and a show's
 * page holds its episodes.
 */
@Composable
private fun HeroButtons(slide: FeaturedTitle, modifier: Modifier = Modifier) {
    val nav = LocalNavigator.current
    val (title, item) = slide
    val wide = isWide()
    Row(
        modifier.padding(start = Gutter, end = Gutter, bottom = heroBottom()).then(if (wide) Modifier else Modifier.fillMaxWidth()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val buttonModifier = if (wide) Modifier else Modifier.weight(1f)
        MatineeButton(onClick = { nav.play(item.id) }, modifier = buttonModifier) {
            LucideIcon(Lucide.Play, null, size = 16.dp)
            Text(stringResource(R.string.media_hero_play))
        }
        MatineeButton(onClick = { nav.title(title) }, look = ButtonLook.Frosted, modifier = buttonModifier) {
            LucideIcon(Lucide.Info, null, size = 16.dp)
            Text(stringResource(R.string.media_hero_details))
        }
    }
}

/** The title as its logo when the provider has one, else as text. */
@Composable
private fun TitleMark(slide: FeaturedTitle, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val logo = slide.title.images.logo
    var failed by remember(logo?.id) { mutableStateOf(false) }
    if (logo != null && !failed) {
        BoxWithConstraints(modifier.fillMaxWidth(0.8f)) {
            AsyncImage(
                model = api.paths.artwork(logo.id, ArtworkSize.Medium),
                contentDescription = slide.title.name,
                contentScale = ContentScale.Fit,
                alignment = Alignment.BottomStart,
                onError = { failed = true },
                modifier = Modifier.fillMaxWidth().height(if (isWide()) 120.dp else 52.dp),
            )
        }
    } else {
        // A phone's banner is short; a title that big would reach the header.
        Text(
            slide.title.name,
            style = (if (isWide()) MaterialTheme.typography.displaySmall else MaterialTheme.typography.headlineMedium).copy(
                shadow = androidx.compose.ui.graphics.Shadow(Color.Black.copy(alpha = 0.45f), blurRadius = 24f),
            ),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = modifier,
        )
    }
}

/** Space under the banner's buttons: room for the dots on a wide screen, little on a phone. */
@Composable
private fun heroBottom() = if (isWide()) 32.dp else 12.dp

/** The banner's place while it loads. */
@Composable
fun HeroSkeleton(modifier: Modifier = Modifier, top: @Composable () -> Unit) {
    Box(modifier.fillMaxWidth().background(Palette.Card)) {
        Column(Modifier.fillMaxWidth()) { top() }
        Box(Modifier.align(Alignment.BottomStart).padding(Gutter).padding(bottom = heroBottom())) {
            Column {
                Box(Modifier.size(220.dp, 48.dp).clip(MaterialTheme.shapes.small).background(Palette.Secondary))
                Gap(16.dp)
                Box(Modifier.size(140.dp, 16.dp).clip(MaterialTheme.shapes.small).background(Palette.Secondary))
            }
        }
    }
}
