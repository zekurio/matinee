package io.github.zekurio.matinee.ui.tv

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.ui.theme.RedHatText

/**
 * Type for TV pages, read from three metres on a 960x540dp screen. The
 * phone's `typography` stays as it is; TV pages take their styles from here.
 */
object TvType {
    /** The focused item's name in a page's header. */
    val Display = style(34, 700, 40, -0.02)

    /** A page's own name, or a large heading. */
    val Headline = style(26, 700, 32, -0.02)

    /** A row's heading. */
    val Title = style(20, 600, 26, -0.01)

    /** The facts under a name: year, runtime, rating. */
    val Facts = style(16, 500, 22)

    /** Running text, like an overview. */
    val Body = style(16, 400, 24)

    /** A line under a card, or a drawer entry. */
    val Label = style(15, 500, 20)

    /** The least that reads from the couch. */
    val Caption = style(14, 400, 20)

    /** The clock at the top right. */
    val Clock = style(20, 500, 26)
}

private fun style(size: Int, weight: Int, line: Int, tracking: Double = 0.0) = TextStyle(
    fontFamily = RedHatText,
    fontWeight = FontWeight(weight),
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.em,
)

/**
 * Margins for what a person reads or focuses on a TV, as Wholphin keeps
 * them: 32dp at the sides, 27dp at the top and bottom. Backdrops still
 * reach the edges, rows run off the right one, and the drawer's rail sits
 * closer to the left edge, its icons centred [RailCenter] in.
 */
object Overscan {
    val Horizontal: Dp = 32.dp
    val Vertical: Dp = 27.dp

    /** Where the collapsed drawer's icons are centred, from the left edge. */
    val RailCenter: Dp = 32.dp
}
