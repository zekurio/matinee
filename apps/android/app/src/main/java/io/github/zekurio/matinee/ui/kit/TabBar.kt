package io.github.zekurio.matinee.ui.kit

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.blur.HazeBlurStyle
import dev.chrisbanes.haze.blur.HazeColorEffect
import dev.chrisbanes.haze.blur.hazeBlur
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.rememberReducedMotion
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/** A destination in the [TabBar]: its icon, and its name, which the bar shows under it and TalkBack reads. */
class TabBarItem(val key: Any, @param:DrawableRes val icon: Int, val label: String)

/** The tab bar's measures, after the iPhone's kit and Findroid's phone app. */
object TabBarDefaults {
    /** The open tab's capsule behind its icon. */
    val PillWidth = 56.dp
    val PillHeight = 32.dp

    /** How wide the tabs spread before they gather in the middle, as on a tablet or a phone on its side. */
    val Spread = 480.dp

    /** The name's line: the web's `text-xs`, 12 on 16, medium. */
    @Composable
    fun labelStyle() = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp, lineHeight = 16.sp)

    /**
     * The bar above the system's navigation bar: 6 over the capsule, the
     * capsule, 2, the name's line, and 4 under it; 60 at the default font
     * size, and taller as the name's line grows with it.
     */
    @Composable
    fun height(): Dp = 6.dp + PillHeight + 2.dp + with(LocalDensity.current) { 16.sp.toDp() } + 4.dp
}

/**
 * Which tab the bars show as open, and how far each tab's capsule has
 * grown. One for the app, kept outside the pages, so every page's copy of
 * the bar draws the same moment of a change, and a page coming back from
 * one opened over it finds its tab's capsule already grown.
 */
@Stable
class TabBarState {
    private val shown = mutableStateMapOf<Any, Animatable<Float, AnimationVector1D>>()

    /** How far [key]'s capsule has grown, from 0, closed, to 1. */
    fun progress(key: Any): Float = shown[key]?.value ?: 0f

    /** Opens [key] and closes the rest of [keys]; at once the first time, so the app doesn't start with a capsule growing. */
    internal suspend fun select(key: Any?, keys: List<Any>) {
        val first = shown.isEmpty()
        coroutineScope {
            keys.forEach { tab ->
                val target = if (tab == key) 1f else 0f
                val anim = shown.getOrPut(tab) { Animatable(if (first) target else 0f) }
                launch { anim.animateTo(target, Motion.move()) }
            }
        }
    }
}

/** The bars' state, following [selected] among [items]; null leaves the last tab open, as on a page opened over it. */
@Composable
fun rememberTabBarState(selected: Any?, items: List<Any>): TabBarState {
    val state = remember { TabBarState() }
    LaunchedEffect(selected ?: Unit, items) { if (selected != null) state.select(selected, items) }
    return state
}

/**
 * The tabs along the bottom of a tab's first page, after Findroid's phone
 * app and the iPhone's tab bar: the full width, each tab its icon over its
 * name, both always shown. The open tab's icon sits in a 56 by 32 capsule
 * of the text's color at 10%, which grows out from half its width as the
 * tab opens and fades in, and its name turns from muted to the text's
 * color. With animations removed it only fades, and only at once.
 *
 * Not Material's NavigationBar: that one is 80 tall, with a 64 by 32
 * indicator, 24 icons, and a tonal surface of its own. This one is frosted
 * as the status bar is: [page], the page it sits on, blurred under the
 * page's background at 80%, with a hairline of the border's color along
 * its top. Android 11 and older can't blur, and get the background whole.
 * It runs on under the system's navigation bar. Its tabs gather in the
 * middle past [TabBarDefaults.Spread], and names keep their own width,
 * so a long one isn't cut short.
 *
 * TalkBack reads it as a group of tabs: each tab by its name, its place
 * among them, and which is open.
 */
@Composable
fun TabBar(
    items: List<TabBarItem>,
    selected: Any?,
    onSelect: (Any) -> Unit,
    page: HazeState,
    modifier: Modifier = Modifier,
    state: TabBarState? = null,
) {
    val frost = rememberTabBarFrost()
    val hairline = Palette.Border
    val reduced = rememberReducedMotion()
    Box(
        modifier
            .fillMaxWidth()
            .hazeBlur(HazeInput.Sources(page), frost)
            .drawBehind { drawRect(hairline, size = Size(size.width, 1f)) }
            .navigationBarsPadding(),
        contentAlignment = Alignment.TopCenter,
    ) {
        Row(
            Modifier
                .widthIn(max = TabBarDefaults.Spread)
                .fillMaxWidth()
                .padding(horizontal = 8.dp)
                .selectableGroup(),
            horizontalArrangement = Arrangement.Center,
        ) {
            items.forEach { item ->
                val open = item.key == selected
                val local by animateFloatAsState(if (open) 1f else 0f, Motion.move(), label = "tab")
                Tab(
                    item,
                    open,
                    progress = { state?.progress(item.key) ?: local },
                    reduced = reduced,
                    onClick = { onSelect(item.key) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

private val PillShape = RoundedCornerShape(percent = 50)

@Composable
private fun Tab(
    item: TabBarItem,
    selected: Boolean,
    progress: () -> Float,
    reduced: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val press by animateFloatAsState(if (pressed) 0.92f else 1f, Motion.color(), label = "tabPress")
    val fill = Palette.Foreground.copy(alpha = 0.1f)
    val color = lerp(Palette.Muted, Palette.Foreground, progress())
    Column(
        modifier
            .selectable(selected, interaction, indication = null, role = Role.Tab, onClick = onClick)
            .padding(top = 6.dp, bottom = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(TabBarDefaults.PillWidth, TabBarDefaults.PillHeight)
                .graphicsLayer {
                    scaleX = press
                    scaleY = press
                }
                .focusRing(interaction, PillShape)
                .drawBehind {
                    val shown = progress()
                    if (shown <= 0f) return@drawBehind
                    // Grows out from the icon as the tab opens, as Material's indicator does.
                    val width = size.width * (if (reduced) 1f else 0.5f + 0.5f * shown)
                    drawRoundRect(
                        fill.copy(alpha = fill.alpha * shown),
                        topLeft = Offset((size.width - width) / 2, 0f),
                        size = Size(width, size.height),
                        cornerRadius = CornerRadius(size.height / 2),
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            LucideIcon(item.icon, null, size = 22.dp, tint = color)
        }
        Text(
            item.label,
            style = TabBarDefaults.labelStyle(),
            color = color,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Visible,
            // Its own width, past the tab's third of the bar if it must, rather than cut short.
            modifier = Modifier.padding(top = 2.dp).wrapContentWidth(unbounded = true),
        )
    }
}

/** The bar's frost: the page under it blurred, under the page's background at 80%, or the background whole where nothing blurs. */
@Composable
private fun rememberTabBarFrost(): HazeBlurStyle {
    val background = Palette.Background
    return remember(background) {
        HazeBlurStyle {
            blurRadius(20.dp)
            noiseFactor(0f)
            // Behind the page's own transparent parts, as on screen.
            backgroundColor(background)
            colorEffects(listOf(HazeColorEffect.tint(background.copy(alpha = 0.8f))))
            fallbackColorEffect(HazeColorEffect.tint(background))
        }
    }
}
