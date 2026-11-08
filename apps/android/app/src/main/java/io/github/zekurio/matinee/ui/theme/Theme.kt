package io.github.zekurio.matinee.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.R

/*
 * The web app's Matinee dark theme, from the tokens in
 * packages/ui/src/styles/globals.css: a neutral ramp from the background to
 * the text, and the blue accent.
 */
object Palette {
    val Background = Color(0xFF0E0E10) // --neutral-0
    val Card = Color(0xFF161618) // --neutral-50
    val Raised = Color(0xFF1A1A1D) // --neutral-100, popovers and sheets
    val Secondary = Color(0xFF232326) // --neutral-150
    val Border = Color(0xFF27272A) // --neutral-200
    val Input = Color(0xFF3F3F46) // --neutral-300
    val Muted = Color(0xFFA1A1AA) // --neutral-600, muted text
    val Faint = Color(0xFF8E8E96) // --foreground-faint
    val Foreground = Color(0xFFFAFAFA) // --neutral-900
    val Sunken = Color(0xFF09090A) // --surface-sunken, text fields
    val Accent = Color(0xFF6D8CF5)
    val AccentDim = Color(0xFF333F66)
    val AccentSoft = Color(0x386D8CF5)
    val Danger = Color(0xFFFF6367)
    val Star = Color(0xFFFCD34D) // amber-300, the rating star

    /** The neutral gradients that stand in for missing art, as `tone()` picks them. */
    val Tones = listOf(
        Color(0xFF26262A) to Color(0xFF1A1A1D),
        Color(0xFF2B2B2F) to Color(0xFF1E1E21),
        Color(0xFF303035) to Color(0xFF1C1C1F),
        Color(0xFF2D2D32) to Color(0xFF202023),
    )
}

private fun redHat(weight: Int) = Font(
    R.font.red_hat_text,
    FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

val RedHatText = FontFamily(redHat(300), redHat(400), redHat(500), redHat(600), redHat(700))

private val colors = darkColorScheme(
    primary = Palette.Accent,
    onPrimary = Color.Black,
    primaryContainer = Palette.AccentDim,
    onPrimaryContainer = Palette.Foreground,
    secondary = Palette.Secondary,
    onSecondary = Palette.Foreground,
    secondaryContainer = Palette.Secondary,
    onSecondaryContainer = Palette.Foreground,
    tertiary = Palette.Accent,
    background = Palette.Background,
    onBackground = Palette.Foreground,
    surface = Palette.Background,
    onSurface = Palette.Foreground,
    surfaceVariant = Palette.Secondary,
    onSurfaceVariant = Palette.Muted,
    surfaceContainerLowest = Palette.Sunken,
    surfaceContainerLow = Palette.Card,
    surfaceContainer = Palette.Raised,
    surfaceContainerHigh = Palette.Raised,
    surfaceContainerHighest = Palette.Secondary,
    inverseSurface = Palette.Foreground,
    inverseOnSurface = Palette.Background,
    outline = Palette.Input,
    outlineVariant = Palette.Border,
    error = Palette.Danger,
    onError = Color.Black,
    scrim = Color.Black,
)

private fun style(size: Int, weight: Int, line: Int, tracking: Double = 0.0) = TextStyle(
    fontFamily = RedHatText,
    fontWeight = FontWeight(weight),
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.em,
)

private val typography = Typography(
    displayLarge = style(48, 700, 52, -0.025),
    displayMedium = style(40, 700, 44, -0.025),
    displaySmall = style(34, 700, 38, -0.025),
    headlineLarge = style(30, 700, 36, -0.025),
    headlineMedium = style(26, 700, 32, -0.025),
    headlineSmall = style(22, 600, 28, -0.025),
    titleLarge = style(20, 600, 28, -0.025),
    titleMedium = style(16, 600, 24),
    titleSmall = style(14, 500, 20),
    bodyLarge = style(16, 400, 24),
    bodyMedium = style(14, 400, 20),
    bodySmall = style(13, 400, 20),
    labelLarge = style(14, 500, 20),
    labelMedium = style(13, 500, 18),
    labelSmall = style(11, 500, 16),
)

@Composable
fun MatineeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
