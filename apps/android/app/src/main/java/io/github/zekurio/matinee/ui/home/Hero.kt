package io.github.zekurio.matinee.ui.home

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.FeaturedTitle
import io.github.zekurio.matinee.ui.HEADER_HEIGHT
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.frame
import io.github.zekurio.matinee.ui.components.tone
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.formatRating
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.Shapes
import io.github.zekurio.matinee.ui.progressRatio
import io.github.zekurio.matinee.ui.rememberReducedMotion
import io.github.zekurio.matinee.ui.rememberTouchExploration
import io.github.zekurio.matinee.ui.tabBarHeight
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.timeLeft
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/*
 * The web's components/hero.tsx, for a window from 600 dp wide: the banner
 * at the top of Home, in the place home.tsx gives it, where a phone has the
 * card carousel (HomeCarousel.kt). It matches the iPad's (the iPhone app's
 * home/Hero.swift). How tall it is and where its parts sit for the window,
 * which facts a slide lists, how its repeating pages map to slides, and
 * which parts it shows are HomeHero.kt's, where they're tested. The name
 * and the genres come from the same helpers as the carousel's cards.
 *
 * Where it differs from the web's: the title is always its name typed out,
 * never the provider's logo, which can't be made to read on every picture
 * (the owner's call); the slides swipe as pages, the art crossfading under
 * them, where the web fades one slide into the next. Where it differs from
 * the iPad's: a tablet here has the phone's shell, so Home's header, the
 * logo, search, and the account, lies over the banner's top, under the
 * status bar, on a shade of the page's color that keeps both readable, as
 * the web's phone layout shades the status bar; the banner's window is
 * what the tab bar at the bottom leaves of the screen.
 */

/** Room under the status bar for Home's header, which a slide's text keeps clear of by 12. */
private val HEADER_ROOM = HEADER_HEIGHT + 12.dp

/** The buttons' height. */
private val BUTTONS = 44.dp

/**
 * The top of a tablet's Home, in the carousel's place: the banner over the
 * featured titles, or while they load, its place. With none, or when they
 * failed, Home's header alone, which [header] is.
 */
@Composable
internal fun HomeBanner(loaders: HomeLoaders, dev: HomeCarouselDevData?, header: @Composable () -> Unit) {
    val rowsBelow = rowsFollowBanner(loaders.resume.state, loaders.nextUp.state)
    when (val state = loaders.featured.state) {
        Load.Loading -> HeroSkeleton(rowsBelow, header)
        is Load.Failed -> header()
        is Load.Ready -> {
            val slides = dev?.slides(state.value) ?: state.value
            if (slides.isEmpty()) header()
            // Other titles start it at the first again.
            else androidx.compose.runtime.key(slides.map { it.title.id }) { Hero(slides, rowsBelow, dev, header) }
        }
    }
}

/** The window less the tab bar at its bottom, in dp, which the banner lays itself out in, as the web's in its viewport. */
@Composable
private fun bannerWindow(): Pair<Float, Float> {
    val density = LocalDensity.current
    val size = LocalWindowInfo.current.containerSize
    val bar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + tabBarHeight()
    return with(density) { size.width.toDp().value to (size.height.toDp() - bar).value }
}

/**
 * The banner: new and well-rated titles over their art, with Play starting
 * where the person is in each. It moves on every eight seconds, as the
 * web's, always forward: the pages repeat, so after the last comes the
 * first again. It holds while a finger is on it or a pointer over it,
 * while focus is in it, while a title's actions are open, while TalkBack
 * is on, with animations removed, and while Home isn't in front; a slide
 * picked by hand gets a full eight seconds again.
 *
 * It reaches up under the status bar, with [top], Home's header, lying
 * over it there.
 */
@Composable
private fun Hero(slides: List<FeaturedTitle>, rowsBelow: Boolean, dev: HomeCarouselDevData?, top: @Composable () -> Unit) {
    val count = slides.size
    val (width, height) = bannerWindow()
    val layout = HeroLayout(width, height, rowsBelow)
    val parts = BannerParts.TABLET
    val density = LocalDensity.current
    val topRoom = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + HEADER_ROOM
    val reserved = layout.buttonsBottom.dp + if (parts.buttons) BUTTONS + layout.textGap.dp else 0.dp
    // The tallest slide's text, for which large text grows the banner rather than run it up under the header.
    var textHeight by remember(layout) { mutableFloatStateOf(0f) }
    val bannerHeight = maxOf(layout.height.dp, topRoom + with(density) { textHeight.toDp() } + reserved)

    val pager = rememberPagerState(initialPage = HeroPaging.initialPage(count)) { HeroPaging.pages(count) }
    val current = HeroPaging.slide(pager.currentPage, count)
    val scope = rememberCoroutineScope()
    val actions = LocalActions.current
    val dragged by pager.interactionSource.collectIsDraggedAsState()
    var touched by remember { mutableStateOf(false) }
    var hovered by remember { mutableStateOf(false) }
    var focused by remember { mutableStateOf(false) }
    val resumed by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val exploring = rememberTouchExploration()
    val reduced = rememberReducedMotion()
    val paused = dragged || touched || hovered || focused || exploring || reduced ||
        actions.target != null || !resumed.isAtLeast(Lifecycle.State.RESUMED) ||
        dev?.startStop != null || count < 2

    // A page left halfway, as when Home went away mid-advance, settles first.
    LaunchedEffect(pager) {
        if (pager.currentPageOffsetFraction != 0f && !pager.isScrollInProgress) pager.scrollToPage(pager.currentPage)
    }
    // Waits on the page it settled on, so the advance's own scroll, which
    // moves the current page halfway through, doesn't cancel it.
    LaunchedEffect(paused, count) {
        if (paused) return@LaunchedEffect
        snapshotFlow { pager.settledPage }.collectLatest { page ->
            delay(HeroPaging.ADVANCE_MS)
            pager.animateScrollToPage(page + 1, animationSpec = tween(500, easing = Motion.Easing))
        }
    }
    // A debug folder's `stop`: resting on that slide, and holding there.
    LaunchedEffect(dev) {
        val start = dev?.startStop ?: return@LaunchedEffect
        if (count > 1) pager.scrollToPage(HeroPaging.page(start.toInt() % count, pager.currentPage, count))
    }
    val step = { by: Int -> scope.launch { pager.animateScrollToPage(pager.currentPage + by, animationSpec = Motion.move()) }; Unit }
    val pick = { index: Int ->
        scope.launch { pager.animateScrollToPage(HeroPaging.page(index, pager.currentPage, count), animationSpec = Motion.move()) }
        Unit
    }

    val featured = stringResource(R.string.tv_home_featured)
    Box(
        Modifier
            .fillMaxWidth()
            .height(bannerHeight)
            .semantics { contentDescription = featured }
            .onFocusChanged { focused = it.hasFocus }
            // Watches without taking: a finger down or a pointer over it holds it.
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        touched = event.changes.any { it.pressed }
                        when (event.type) {
                            PointerEventType.Enter -> hovered = true
                            PointerEventType.Exit -> hovered = false
                        }
                    }
                }
            },
    ) {
        HorizontalPager(pager, Modifier.fillMaxSize(), beyondViewportPageCount = 1) { page ->
            val index = HeroPaging.slide(page, count)
            HeroSlide(
                slides[index],
                dev?.art(index),
                layout,
                parts,
                topRoom,
                reserved,
                // The pages beside it are laid out for the swipe, but not there to read.
                Modifier.then(if (page != pager.currentPage) Modifier.clearAndSetSemantics {} else Modifier),
                onTextHeight = { textHeight = maxOf(textHeight, it) },
            ) {
                // How far the page sits from the middle, in pages: 1 one page off to the right.
                (page - pager.currentPage) - pager.currentPageOffsetFraction
            }
        }
        // The header's shade, then the header, over the art.
        HeaderShade(topRoom + 24.dp)
        Box(Modifier.fillMaxWidth().align(Alignment.TopStart)) { top() }
        Controls(slides[current], layout, parts, count, current, step, pick)
    }
}

/**
 * A shade of the page's color down from the top, behind the status bar and
 * Home's header, so the clock, the logo, and the buttons read on any
 * picture: dark in a dark theme and light in a light one, as the web's
 * phone layout shades its status bar. It ends a little under the header.
 */
@Composable
private fun BoxScope.HeaderShade(height: Dp) {
    Box(
        Modifier
            .align(Alignment.TopStart)
            .fillMaxWidth()
            .height(height)
            .background(
                Brush.verticalGradient(
                    0f to Palette.Background.copy(alpha = 0.8f),
                    0.55f to Palette.Background.copy(alpha = 0.45f),
                    1f to Color.Transparent,
                ),
            ),
    )
}

/**
 * Play and Details, the dots, and previous and next: on a desktop-sized
 * window all in one row, the dots at the right level with the buttons; on a
 * tablet-sized one the dots and arrows in a row of their own under the
 * buttons, as the web's.
 */
@Composable
private fun BoxScope.Controls(
    slide: FeaturedTitle,
    layout: HeroLayout,
    parts: BannerParts,
    count: Int,
    current: Int,
    step: (Int) -> Unit,
    pick: (Int) -> Unit,
) {
    Row(
        Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(start = Gutter, end = Gutter - 6.dp, bottom = layout.buttonsBottom.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (parts.buttons) HeroButtons(slide)
        if (layout.dotsBesideButtons) {
            Spacer(Modifier.weight(1f))
            Pager(count, current, step, pick)
        }
    }
    if (!layout.dotsBesideButtons) {
        Box(Modifier.align(Alignment.BottomEnd).padding(end = Gutter - 6.dp, bottom = (layout.dotsBottom - 4f).coerceAtLeast(0f).dp)) {
            Pager(count, current, step, pick)
        }
    }
}

/** The dots and previous and next, with more than one slide. */
@Composable
private fun Pager(count: Int, current: Int, step: (Int) -> Unit, pick: (Int) -> Unit) {
    if (count < 2) return
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            repeat(count) { index -> HeroDot(index == current, stringResource(R.string.home_featured_show_slide, index + 1)) { pick(index) } }
        }
        Row {
            RoundIconButton(Lucide.ChevronLeft, stringResource(R.string.home_featured_previous), { step(-1) }, size = 36.dp, background = Color.Transparent)
            RoundIconButton(Lucide.ChevronRight, stringResource(R.string.home_featured_next), { step(1) }, size = 36.dp, background = Color.Transparent)
        }
    }
}

/** One of the web's dots: which slide shows, the open one long, each a button to its slide. */
@Composable
private fun HeroDot(on: Boolean, label: String, onClick: () -> Unit) {
    val width by animateDpAsState(if (on) 20.dp else 6.dp, Motion.move(), label = "heroDot")
    Box(
        Modifier
            .heightIn(min = 44.dp)
            .clip(CircleShape)
            .clickable(onClickLabel = label, role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = label
                selected = on
            }
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(width, 6.dp)
                .clip(CircleShape)
                .background(if (on) Palette.Foreground else Palette.Foreground.copy(alpha = 0.4f)),
        )
    }
}

/**
 * One slide: its text, low on the left, over its art. The art holds still
 * and crossfades with the next one's as the pages move, as the web's
 * slides fade, rather than the pictures sliding edge to edge; the text
 * slides with the page. [offset] is how far the page is from the middle,
 * in pages, read only while drawing.
 */
@Composable
private fun HeroSlide(
    slide: FeaturedTitle,
    standIn: StandInArt?,
    layout: HeroLayout,
    parts: BannerParts,
    top: Dp,
    bottom: Dp,
    modifier: Modifier,
    onTextHeight: (Float) -> Unit,
    offset: () -> Float,
) {
    Box(modifier.fillMaxSize()) {
        HeroArt(slide, standIn, offset)
        HeroText(
            slide,
            layout,
            parts,
            Modifier
                .align(Alignment.BottomStart)
                .padding(start = Gutter, end = Gutter, top = top, bottom = bottom)
                // Its whole height, for the banner to grow to at large text sizes.
                .wrapContentHeight(Alignment.Bottom, unbounded = true)
                .onSizeChanged { onTextHeight(it.height.toFloat()) },
        )
    }
}

/**
 * A slide's picture and its shade. The backdrop, else a show's episode
 * still, else a frame from the file, as the web's; with none, the title's
 * tone. The shade is the web's, in the page's color, so in a light theme
 * the picture fades into a light page: across from the text's side,
 * `from-background/85 via-background/45 via-30% to-transparent to-65%`,
 * and up the lower half into the page, `from-background via-background/30
 * via-35%`.
 */
@Composable
private fun HeroArt(slide: FeaturedTitle, standIn: StandInArt?, offset: () -> Float) {
    val api = LocalApi.current
    val (title, item) = slide
    val server = listOfNotNull(api.art(title.images.backdrop, ArtworkSize.Large), api.art(item.episode?.still, ArtworkSize.Large)) +
        api.frame(item.id, large = true)
    val sources: List<ImageSource> = when (standIn) {
        is StandInArt.Backdrop -> listOf(standIn.source)
        // A title with only a poster: the banner, as the web's, doesn't show posters.
        is StandInArt.Poster -> server.drop(1)
        StandInArt.None -> emptyList()
        null -> server
    }
    // Pages draw left to right, so the one on the right fades over the one
    // under it, which stays whole: a crossfade without a seam or a dip to dark.
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
        Box(
            Modifier.fillMaxSize().background(
                Brush.horizontalGradient(
                    0f to Palette.Background.copy(alpha = 0.85f),
                    0.3f to Palette.Background.copy(alpha = 0.45f),
                    0.65f to Color.Transparent,
                ),
            ),
        )
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0.5f to Color.Transparent,
                    0.825f to Palette.Background.copy(alpha = 0.3f),
                    1f to Palette.Background,
                ),
            ),
        )
    }
}

/** A slide's words: the name, the facts, the genres, the overview, and how far the person is, each as the web's. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HeroText(slide: FeaturedTitle, layout: HeroLayout, parts: BannerParts, modifier: Modifier) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val density = LocalDensity.current
    val (title, item) = slide
    val ratio = progressRatio(item)
    val left = timeLeft(item, res)
    Column(modifier) {
        // `text-[clamp(…)]` bold, tight, two lines at most, as the web's name
        // where a title has no logo; three at large font sizes, for which the banner grows.
        Text(
            slide.featuredName,
            style = MaterialTheme.typography.headlineLarge.copy(
                fontSize = layout.titleSize.sp,
                lineHeight = (layout.titleSize * 1.1f).sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-0.025).em,
                shadow = Shadow(Color.Black.copy(alpha = 0.45f), blurRadius = with(density) { 24.dp.toPx() }),
            ),
            color = Palette.Foreground,
            maxLines = if (density.fontScale >= 1.5f) 3 else 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 672.dp).semantics { heading() },
        )
        if (parts.facts) {
            Gap(14.dp)
            HeroFacts(slide)
        }
        val genres = slide.shownGenres
        if (layout.showsGenres && genres.isNotEmpty() && parts.genres != BannerParts.Genres.None) {
            Gap(12.dp)
            when (parts.genres) {
                BannerParts.Genres.Badges -> FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    genres.forEach { genre -> GenreBadge(genre) { nav.genre(genre) } }
                }
                BannerParts.Genres.Line -> slide.cardLine()?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = Palette.Foreground.copy(alpha = 0.85f), maxLines = 1)
                }
                BannerParts.Genres.None -> Unit
            }
        }
        val overview = title.overview
        if (parts.overview && layout.showsOverview && overview != null) {
            Gap(8.dp)
            Text(
                overview,
                style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 24.sp),
                color = Palette.Foreground.copy(alpha = 0.7f),
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 576.dp),
            )
        }
        if (ratio != null && left != null) {
            Gap(16.dp)
            Row(Modifier.widthIn(max = 320.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.weight(1f).height(4.dp).clip(CircleShape).background(Palette.Foreground.copy(alpha = 0.25f))) {
                    Box(Modifier.fillMaxWidth(ratio).height(4.dp).clip(CircleShape).background(Palette.Foreground))
                }
                val code = episodeCode(item, res)
                Text(
                    if (code != null) "$code · $left" else left,
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Normal, fontSize = 12.sp),
                    color = Palette.Foreground.copy(alpha = 0.8f),
                    maxLines = 1,
                )
            }
        }
    }
}

/** The year and episode count, the age rating, and the score, in a line that wraps: the web's `text-base` at 80%. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HeroFacts(slide: FeaturedTitle) {
    val res = LocalResources.current
    val title = slide.title
    val facts = slide.facts { res.getQuantityString(R.plurals.media_episode_count, it, it) }
    FlowRow(
        Modifier.widthIn(max = 576.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        if (facts.isNotEmpty()) {
            Text(facts.joinToString(" · "), style = MaterialTheme.typography.bodyLarge, color = Palette.Foreground.copy(alpha = 0.8f), maxLines = 1)
        }
        title.contentRating?.let { rating ->
            Text(
                rating,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp, lineHeight = 20.sp),
                color = Palette.Foreground.copy(alpha = 0.8f),
                modifier = Modifier
                    .border(1.dp, Palette.Foreground.copy(alpha = 0.3f), Shapes.Sm)
                    .padding(horizontal = 6.dp),
            )
        }
        title.rating?.let { rating ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                LucideIcon(Lucide.Star, stringResource(R.string.media_hero_rated), size = 14.dp, tint = Palette.Star)
                Text(formatRating(rating), style = MaterialTheme.typography.bodyLarge, color = Palette.Foreground.copy(alpha = 0.8f))
            }
        }
    }
}

/** A genre over the art, as the web's: a small frosted capsule, opening the genre's titles. */
@Composable
private fun GenreBadge(genre: String, onClick: () -> Unit) {
    Text(
        genre,
        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
        color = Palette.Foreground.copy(alpha = 0.85f),
        maxLines = 1,
        modifier = Modifier
            .clip(CircleShape)
            .background(Palette.Background.copy(alpha = 0.3f))
            .border(1.dp, Palette.Foreground.copy(alpha = 0.15f), CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 2.dp),
    )
}

/**
 * Play and the title's page, for the slide showing: one row that stays in
 * place while the slides swipe under it, and reads the same for every
 * slide, as the web's. Play picks up where the person is, which the
 * slide's progress bar shows, and a show's page holds its episodes.
 */
@Composable
private fun HeroButtons(slide: FeaturedTitle) {
    val nav = LocalNavigator.current
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        MatineeButton(onClick = { nav.play(slide.item.id) }, height = BUTTONS) {
            LucideIcon(Lucide.Play, null, size = 16.dp)
            Text(stringResource(R.string.title_play))
        }
        MatineeButton(onClick = { nav.title(slide.title) }, look = ButtonLook.Frosted, height = BUTTONS) {
            LucideIcon(Lucide.Info, null, size = 16.dp)
            Text(stringResource(R.string.media_hero_details))
        }
    }
}

/** The banner's place while the featured titles load, as tall as it'll be, with Home's header over it. */
@Composable
private fun HeroSkeleton(rowsBelow: Boolean, top: @Composable () -> Unit) {
    val (width, height) = bannerWindow()
    val layout = HeroLayout(width, height, rowsBelow)
    val loading = stringResource(R.string.loading_in_progress)
    Box(Modifier.fillMaxWidth().height(layout.height.dp).background(Palette.Card).semantics { contentDescription = loading }) {
        Box(Modifier.fillMaxWidth().align(Alignment.TopStart)) { top() }
        Column(
            Modifier.align(Alignment.BottomStart).padding(start = Gutter, bottom = layout.buttonsBottom.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Box(Modifier.size(320.dp, 48.dp).clip(Shapes.Md).background(Palette.Secondary))
            Box(Modifier.size(180.dp, 20.dp).clip(Shapes.Md).background(Palette.Secondary))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.size(104.dp, BUTTONS).clip(Shapes.Lg).background(Palette.Secondary))
                Box(Modifier.size(120.dp, BUTTONS).clip(Shapes.Lg).background(Palette.Secondary))
            }
        }
    }
}
