package io.github.zekurio.matinee.ui.home

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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.Chip
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
import kotlinx.coroutines.launch

private const val ADVANCE_MS = 8000L

/**
 * The library chips, the way phones move between libraries, as in the web
 * app. Sits over art on Home, so the chips are frosted there.
 */
@Composable
fun LibraryChips(
    libraries: List<Library>,
    current: String?,
    modifier: Modifier = Modifier,
    frosted: Boolean = false,
    contentPadding: PaddingValues = PaddingValues(horizontal = Gutter),
) {
    val nav = LocalNavigator.current
    if (libraries.isEmpty()) return
    LazyRow(
        modifier,
        contentPadding = contentPadding,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        items(libraries, key = { it.id }) { library ->
            Chip(library.name, selected = library.id == current, frosted = frosted, onClick = { nav.library(library.id) })
        }
    }
}

/**
 * The banner at the top of Home: new and well-rated titles over their art,
 * with Play starting where the person is in each. Advances on its own until
 * the person swipes it.
 */
@Composable
fun Hero(slides: List<FeaturedTitle>, modifier: Modifier = Modifier, top: @Composable () -> Unit) {
    val pager = rememberPagerState { slides.size }
    var held by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(pager.currentPage, held, slides.size) {
        if (held || slides.size < 2) return@LaunchedEffect
        delay(ADVANCE_MS)
        pager.animateScrollToPage((pager.currentPage + 1) % slides.size)
    }
    // A swipe holds the banner on what the person picked. Only a drag
    // counts: the banner's own advance scrolls too.
    val dragged by pager.interactionSource.collectIsDraggedAsState()
    LaunchedEffect(dragged) { if (dragged) held = true }
    Box(modifier.fillMaxWidth()) {
        HorizontalPager(pager, Modifier.fillMaxSize(), key = { slides[it].title.id }) { page ->
            Slide(slides[page])
        }
        Column(Modifier.fillMaxWidth().align(Alignment.TopStart)) { top() }
        if (slides.size > 1) {
            Row(
                Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                slides.indices.forEach { index ->
                    val active = index == pager.currentPage
                    Box(
                        Modifier
                            .padding(vertical = 8.dp)
                            .height(6.dp)
                            .width(if (active) 20.dp else 6.dp)
                            .clip(CircleShape)
                            .background(if (active) Palette.Foreground else Palette.Foreground.copy(alpha = 0.4f))
                            .clickable(onClickLabel = stringResource(R.string.media_hero_show_slide, index + 1)) {
                                held = true
                                scope.launch { pager.animateScrollToPage(index) }
                            },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Slide(slide: FeaturedTitle) {
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
    Box(Modifier.fillMaxSize().tone(title.name)) {
        Picture(sources, Modifier.fillMaxSize(), alignment = Alignment.TopCenter)
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
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(start = Gutter, end = Gutter, bottom = 40.dp),
        ) {
            TitleMark(slide, Modifier.widthIn(max = 512.dp))
            Gap(12.dp)
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
            if (title.genres.isNotEmpty()) {
                Gap(12.dp)
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
                Gap(16.dp)
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
            Gap(16.dp)
            Row(
                Modifier.then(if (wide) Modifier else Modifier.fillMaxWidth()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val buttonModifier = if (wide) Modifier else Modifier.weight(1f)
                MatineeButton(onClick = { nav.play(item.id) }, modifier = buttonModifier) {
                    LucideIcon(Lucide.Play, null, size = 16.dp)
                    Text(stringResource(if (resuming) R.string.media_hero_resume else R.string.media_hero_play))
                }
                MatineeButton(onClick = { nav.title(title) }, look = ButtonLook.Frosted, modifier = buttonModifier) {
                    LucideIcon(if (title.isShow) Lucide.List else Lucide.Info, null, size = 16.dp)
                    Text(stringResource(if (title.isShow) R.string.media_hero_episodes else R.string.media_hero_details))
                }
            }
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
                modifier = Modifier.fillMaxWidth().height(if (isWide()) 120.dp else 76.dp),
            )
        }
    } else {
        Text(
            slide.title.name,
            style = MaterialTheme.typography.displaySmall.copy(
                shadow = androidx.compose.ui.graphics.Shadow(Color.Black.copy(alpha = 0.45f), blurRadius = 24f),
            ),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = modifier,
        )
    }
}

/** The banner's place while it loads. */
@Composable
fun HeroSkeleton(modifier: Modifier = Modifier, top: @Composable () -> Unit) {
    Box(modifier.fillMaxWidth().background(Palette.Card)) {
        Column(Modifier.fillMaxWidth()) { top() }
        Box(Modifier.align(Alignment.BottomStart).padding(Gutter).padding(bottom = 32.dp)) {
            Column {
                Box(Modifier.size(220.dp, 48.dp).clip(MaterialTheme.shapes.small).background(Palette.Secondary))
                Gap(16.dp)
                Box(Modifier.size(140.dp, 16.dp).clip(MaterialTheme.shapes.small).background(Palette.Secondary))
            }
        }
    }
}
