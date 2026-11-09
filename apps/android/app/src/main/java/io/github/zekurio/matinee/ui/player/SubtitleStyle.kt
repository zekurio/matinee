package io.github.zekurio.matinee.ui.player

import android.view.accessibility.CaptioningManager
import android.view.accessibility.CaptioningManager.CaptionStyle
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState

/** How the player draws a line of subtitles. */
data class SubtitleLook(
    val color: Color,
    /** Behind the text, transparent for none. */
    val background: Color,
    val edge: SubtitleEdge,
    val edgeColor: Color,
    /** On top of the size the player picks for the screen. */
    val scale: Float,
    val font: FontFamily? = null,
    /** Behind the whole cue, around the text's background, as Android's caption window. */
    val window: Color = Color.Transparent,
)

private val COLORS = mapOf(
    SubtitleColor.WHITE to Color.White,
    SubtitleColor.YELLOW to Color(0xFFFFE14D),
    SubtitleColor.CYAN to Color(0xFF6CE5FF),
    SubtitleColor.GREEN to Color(0xFF7CF29A),
)

fun SubtitleColor.color(): Color = COLORS.getValue(this)

/**
 * The look [prefs] asks for: the system's caption style when it says to,
 * which Settings > Accessibility > Caption preferences sets, else the app's
 * own choices.
 */
@Composable
fun rememberSubtitleLook(prefs: PlayerPrefs): SubtitleLook {
    val context = LocalContext.current
    val system = prefs.subtitleSystemStyle
    val own = SubtitleLook(
        color = prefs.subtitleColor.color(),
        background = when (prefs.subtitleBackground) {
            SubtitleBackground.NONE -> Color.Transparent
            SubtitleBackground.SHADED -> Color.Black.copy(alpha = 0.45f)
            SubtitleBackground.BLACK -> Color.Black
        },
        edge = prefs.subtitleEdge,
        edgeColor = Color.Black,
        scale = prefs.subtitleScale,
    )
    // The system's style is read again on coming back, as from its settings page.
    val lifecycle by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    return remember(system, own, lifecycle) {
        if (!system) return@remember own
        val captions = context.getSystemService(CaptioningManager::class.java) ?: return@remember own
        systemLook(captions.userStyle, captions.fontScale)
    }
}

/**
 * The system's caption style as Android draws it. Its getters stand in
 * Android's own defaults for what the style leaves open, white on black
 * with no edge, as its "set by app" style leaves everything, so captions
 * look as they do in every other app that follows the setting.
 */
private fun systemLook(style: CaptionStyle, scale: Float): SubtitleLook = SubtitleLook(
    color = Color(style.foregroundColor),
    background = Color(style.backgroundColor),
    edge = when (style.edgeType) {
        CaptionStyle.EDGE_TYPE_OUTLINE -> SubtitleEdge.OUTLINE
        CaptionStyle.EDGE_TYPE_DROP_SHADOW -> SubtitleEdge.SHADOW
        CaptionStyle.EDGE_TYPE_RAISED -> SubtitleEdge.RAISED
        CaptionStyle.EDGE_TYPE_DEPRESSED -> SubtitleEdge.DEPRESSED
        else -> SubtitleEdge.NONE
    },
    edgeColor = Color(style.edgeColor),
    scale = scale,
    font = style.typeface?.let(::FontFamily),
    window = Color(style.windowColor),
)

/**
 * One cue, centered, at [size] times the look's scale: the text over its
 * background, inside the window, with a shadow or an outline drawn under
 * the fill.
 */
@Composable
fun SubtitleLine(text: AnnotatedString, look: SubtitleLook, modifier: Modifier = Modifier, size: Float = 20f) {
    val fontSize = (size * look.scale).sp
    val base = TextStyle(
        color = look.color,
        fontSize = fontSize,
        lineHeight = fontSize * 1.3f,
        fontWeight = FontWeight.Medium,
        fontFamily = look.font,
        textAlign = TextAlign.Center,
        shadow = when (look.edge) {
            SubtitleEdge.SHADOW -> Shadow(look.edgeColor, Offset(0f, 2f), blurRadius = 6f)
            // A hard edge below and to the right, or above and to the left, as Android draws them.
            SubtitleEdge.RAISED -> Shadow(look.edgeColor, Offset(-2f, -2f), blurRadius = 0f)
            SubtitleEdge.DEPRESSED -> Shadow(look.edgeColor, Offset(2f, 2f), blurRadius = 0f)
            else -> null
        },
    )
    val padding: Dp = if (look.background.alpha > 0f) 8.dp else 0.dp
    val windowPadding: Dp = if (look.window.alpha > 0f) 6.dp else 0.dp
    Box(modifier.background(look.window, RoundedCornerShape(6.dp)).padding(windowPadding)) {
        Box(
            Modifier
                .background(look.background, RoundedCornerShape(4.dp))
                .padding(horizontal = padding, vertical = 2.dp),
        ) {
            if (look.edge == SubtitleEdge.OUTLINE) {
                val stroke = with(LocalDensity.current) { fontSize.toPx() } * 0.14f
                Text(text, style = base.copy(color = look.edgeColor, drawStyle = Stroke(width = stroke, join = StrokeJoin.Round)))
            }
            Text(text, style = base)
        }
    }
}
