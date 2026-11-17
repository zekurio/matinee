package io.github.zekurio.matinee.ui.kit

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.layout.layout
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette

/*
 * The search field's pill, which is also the round search button it grows
 * out of. At 40 across a pill is a circle, and its leading icon sits in a
 * 40 square at its start, so the circle's middle is the icon's: Home's
 * search button is the pill at its narrowest, and Media's field the same
 * pill gutter to gutter. Drawn at a fraction between the two, the button
 * widening into the field is one shape with nothing to swap.
 */

object SearchPillDefaults {
    /** The pill's height and the button's width: 40, which Compose's touch handling widens to 48. */
    val Height = 40.dp

    /** The square at the pill's start that holds its icon, as wide as the button. */
    val IconSlot = 40.dp

    /** The icon, as Home's header's other icons. */
    val IconSize = 20.dp

    /** From the icon's square to the text: 12 from the icon itself, as the field had. */
    val TextGap = 2.dp
}

/**
 * The pill, at [open] (read while drawing) between 0, the round button,
 * and 1, the field. The button is filled with Secondary, as round icon
 * buttons are; the field with the text's color at 6% over the page and a
 * hairline of it at 12%, as the web's search input. Both are drawn
 * opaque, the field's fill worked out over the page's background, which
 * is what it lies on: on its way between them the pill passes over Home's
 * logo and account as they fade, and they mustn't show through it. Its
 * fill goes from one to the other and the hairline fades in.
 */
@Composable
fun SearchPill(open: () -> Float, modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    val button = Palette.Secondary.compositeOver(Palette.Background)
    val field = Palette.Foreground.copy(alpha = 0.06f).compositeOver(Palette.Background)
    val hairline = Palette.Foreground
    Row(
        modifier
            .heightIn(min = SearchPillDefaults.Height)
            .drawBehind {
                val t = open().coerceIn(0f, 1f)
                val radius = CornerRadius(size.height / 2)
                drawRoundRect(lerp(button, field, t), cornerRadius = radius)
                if (t > 0f) {
                    val inset = 0.5.dp.toPx()
                    drawRoundRect(
                        hairline.copy(alpha = 0.12f * t),
                        topLeft = Offset(inset, inset),
                        size = Size(size.width - inset * 2, size.height - inset * 2),
                        cornerRadius = CornerRadius(size.height / 2 - inset),
                        style = Stroke(1.dp.toPx()),
                    )
                }
            }
            .clip(CircleShape),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/**
 * The pill's leading icon in its 40 square: the magnifier, the text's
 * color on the button and muted on the field, by [open]; or, as [back]
 * comes to 1, the Back arrow an open search shows: the magnifier out over
 * the first half, the arrow in over the second, each shrinking a little
 * as it goes and growing as it comes, so the two never blur into one
 * shape. Both are read while drawing. With [onBack] the square is the
 * arrow's button, named [backLabel], a circle as wide as the pill is tall.
 */
@Composable
fun SearchPillIcon(
    open: () -> Float,
    back: () -> Float = { 0f },
    onBack: (() -> Unit)? = null,
    backLabel: String? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val muted = Palette.Muted
    Box(
        Modifier
            .size(SearchPillDefaults.IconSlot)
            .then(
                if (onBack == null) {
                    Modifier
                } else {
                    Modifier
                        .clip(CircleShape)
                        .focusRing(interaction, CircleShape)
                        .clickable(interaction, LocalIndication.current, role = Role.Button, onClick = onBack)
                        .semantics { if (backLabel != null) contentDescription = backLabel }
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        LucideIcon(
            Lucide.Search,
            null,
            Modifier
                .graphicsLayer {
                    val out = (back() * 2f).coerceIn(0f, 1f)
                    alpha = 1f - out
                    scaleX = 1f - 0.2f * out
                    scaleY = scaleX
                    compositingStrategy = CompositingStrategy.Offscreen
                }
                // The text's color, turning muted as the pill opens: the muted color laid over the icon's own pixels.
                .drawWithContent {
                    drawContent()
                    drawRect(muted.copy(alpha = muted.alpha * open().coerceIn(0f, 1f)), blendMode = BlendMode.SrcAtop)
                },
            size = SearchPillDefaults.IconSize,
            tint = Palette.Foreground,
        )
        LucideIcon(
            Lucide.ArrowLeft,
            null,
            Modifier.graphicsLayer {
                val shown = (back() * 2f - 1f).coerceIn(0f, 1f)
                alpha = shown
                scaleX = 0.8f + 0.2f * shown
                scaleY = scaleX
            },
            size = SearchPillDefaults.IconSize,
            tint = Palette.Foreground,
        )
    }
}

/**
 * How open a pill is, worked out from its own width as it lays out: 0 when
 * it's as wide as it's tall, the round button, and 1 at the width it has
 * at rest. The width at rest is what a shared transition's lookahead lays
 * it out at, so while the transition stretches or shrinks the pill between
 * the button's bounds and its own, this follows the bounds themselves, on
 * the frames they're drawn, whatever clock moves them: a page's
 * transition, or the back gesture's finger. Out of a transition it's 1.
 */
@Stable
class SearchPillOpenness {
    private var rest = 0
    private val measured = mutableFloatStateOf(1f)

    /** Read while drawing. */
    val value: Float get() = measured.floatValue

    /** On the pill, inside whatever animates its bounds, so it's measured at the size it's drawn. */
    fun Modifier.measureOpenness(): Modifier = layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        if (isLookingAhead) {
            rest = placeable.width
        } else {
            val span = rest - placeable.height
            measured.floatValue = if (span <= 0) 1f else ((placeable.width - placeable.height).toFloat() / span).coerceIn(0f, 1f)
        }
        layout(placeable.width, placeable.height) { placeable.place(0, 0) }
    }
}

/**
 * Home's search button: the pill at its narrowest, a 40 circle of
 * Secondary with the magnifier. [modifier] is the circle's, so a shared
 * transition can take its bounds as the field's start.
 */
@Composable
fun SearchPillButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val interaction = remember { MutableInteractionSource() }
    SearchPill(
        { 0f },
        modifier
            .size(SearchPillDefaults.Height)
            .clip(CircleShape)
            .focusRing(interaction, CircleShape)
            .clickable(interaction, LocalIndication.current, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
    ) {
        SearchPillIcon({ 0f })
    }
}
