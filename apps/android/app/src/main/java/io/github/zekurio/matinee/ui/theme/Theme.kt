package io.github.zekurio.matinee.ui.theme

import android.content.pm.PackageManager
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.R

/*
 * The colors on screen, by the names the app's screens use, from the theme
 * the person picked (see ThemeStore): the web's roles, as its globals.css
 * turns them into tokens. Each read goes through snapshot state, so a
 * screen follows a change of theme without being told.
 */
object Palette {
    private val colors get() = Theming.colors

    val Background get() = colors.background // --neutral-0
    val Card get() = colors.surface // --neutral-50
    val Raised get() = colors.surfaceRaised // --neutral-100, popovers and sheets
    val Secondary get() = colors.input // --neutral-150
    val Border get() = colors.border // --neutral-200
    val Input get() = colors.borderStrong // --neutral-300
    val Muted get() = colors.textDim // --neutral-600, muted text
    val Faint get() = colors.textFaint // --foreground-faint
    val Foreground get() = colors.text // --neutral-900
    val Accent get() = colors.accent
    val AccentForeground get() = colors.accentForeground

    /** The accent's tint behind it, as faint as it must be for the accent to read on it (--accent-soft). */
    val AccentSoft: Color
        get() = colors.accent.copy(
            alpha = contrastSafeTintAlpha(colors.accent, colors.background, softAlpha(colors.isDark)).toFloat(),
        )
    val Danger get() = colors.danger
    val Star = Color(0xFFFCD34D) // amber-300, the rating star

    /** Whether the theme on screen is dark, for what sits on it, like the system bars. */
    val isDark get() = colors.isDark

    /** The gradients that stand in for missing art, as `tone()` picks them: the surfaces, a step apart. */
    val Tones: List<Pair<Color, Color>>
        get() = listOf(0.07, 0.09, 0.11, 0.10).map { lift ->
            mix(colors.surfaceRaised, colors.text, lift) to mix(colors.surfaceRaised, colors.text, lift / 3)
        }
}

private fun redHat(weight: Int) = Font(
    R.font.red_hat_text,
    FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

val RedHatText = FontFamily(redHat(300), redHat(400), redHat(500), redHat(600), redHat(700))

/** Material's roles from the theme, for the components that still read them. */
private fun colorScheme(): ColorScheme {
    val colors = Theming.colors
    val base = if (colors.isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = colors.accent,
        onPrimary = colors.accentForeground,
        primaryContainer = colors.accentDim,
        onPrimaryContainer = colors.text,
        secondary = colors.input,
        onSecondary = colors.text,
        secondaryContainer = colors.input,
        onSecondaryContainer = colors.text,
        tertiary = colors.accent,
        onTertiary = colors.accentForeground,
        background = colors.background,
        onBackground = colors.text,
        surface = colors.background,
        onSurface = colors.text,
        surfaceVariant = colors.input,
        onSurfaceVariant = colors.textDim,
        surfaceContainerLowest = colors.surfaceSunken,
        surfaceContainerLow = colors.surface,
        surfaceContainer = colors.surfaceRaised,
        surfaceContainerHigh = colors.surfaceRaised,
        surfaceContainerHighest = colors.input,
        surfaceBright = colors.surfaceRaised,
        surfaceDim = colors.background,
        inverseSurface = colors.text,
        inverseOnSurface = colors.background,
        inversePrimary = colors.accentDim,
        outline = colors.borderStrong,
        outlineVariant = colors.border,
        error = colors.danger,
        onError = if (colors.isDark) Color.Black else Color.White,
        scrim = Color.Black,
    )
}

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

/**
 * The app is on a TV: a remote instead of fingers, read from the couch. The
 * theme provides it, so the app's pages and the player get the same answer
 * as `Session.isTv`.
 */
val LocalTv = staticCompositionLocalOf { false }

@Composable
fun MatineeTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val tv = remember(context) { context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK) }
    CompositionLocalProvider(LocalTv provides tv) {
        MaterialTheme(colorScheme = colorScheme(), typography = typography, content = content)
    }
}
