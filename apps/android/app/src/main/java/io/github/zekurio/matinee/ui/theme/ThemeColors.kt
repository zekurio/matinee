package io.github.zekurio.matinee.ui.theme

import androidx.compose.ui.graphics.Color
import kotlin.math.cbrt
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/*
 * Color themes as the web has them (packages/ui/src/lib/theme-colors.ts and
 * theme-color-math.ts): a color per role, the bundled palettes, the
 * account's own themes with the roles they leave out filled in, and the
 * server's accent on the Matinee theme. Contrast follows WCAG relative
 * luminance; mixing happens in OKLab, so tinted ramps never pass through
 * gray.
 */

enum class Appearance(val key: String) {
    Light("light"),
    Dark("dark"),
    ;

    companion object {
        fun of(key: String?) = entries.firstOrNull { it.key == key }
    }
}

/** A color per role, as the contract's `THEME_COLOR_ROLES` name them. */
data class ThemeColors(
    val background: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val surfaceSunken: Color,
    val input: Color,
    val border: Color,
    val borderStrong: Color,
    val borderEmphasis: Color,
    val text: Color,
    val textMuted: Color,
    val textDim: Color,
    val textFaint: Color,
    val accent: Color,
    val accentForeground: Color,
    val accentHover: Color,
    val accentActive: Color,
    val accentDim: Color,
    val success: Color,
    val warning: Color,
    val danger: Color,
    val info: Color,
    val live: Color,
) {
    /** Reads like a dark background: white text contrasts better than black. */
    val isDark get() = luminance(background) < 0.179
}

data class ThemeVariant(val id: String, val label: String, val appearance: Appearance, val colors: ThemeColors)

/** The variants that belong together: a light and one or more dark palettes. */
data class ThemeFamily(val id: String, val label: String, val variants: List<ThemeVariant>, val custom: Boolean)

/** Matinee's own light and dark, which each appearance falls back to. */
object DefaultThemes {
    const val LIGHT = "matinee-light"
    const val DARK = "matinee-dark"

    fun idFor(appearance: Appearance) = if (appearance == Appearance.Light) LIGHT else DARK

    val light get() = BUILTIN_THEMES.first().variants.first { it.id == LIGHT }
    val dark get() = BUILTIN_THEMES.first().variants.first { it.id == DARK }

    fun variant(appearance: Appearance) = if (appearance == Appearance.Light) light else dark

    /** The variants the server's accent tints, and no others. */
    fun isMatinee(id: String) = id == LIGHT || id == DARK
}

private val BLACK = Color(0xFF000000)
private val WHITE = Color(0xFFFFFFFF)
private val SOFT_BLACK = Color(0xFF100E12)
private val SOFT_WHITE = Color(0xFFFAF8FC)

/** `#rrggbb`, the one form themes store colors in; null otherwise. */
fun parseHexColor(value: String?): Color? {
    val digits = value?.trim()?.removePrefix("#") ?: return null
    if (digits.length != 6) return null
    return digits.toLongOrNull(16)?.let { Color(0xFF000000 or it) }
}

/** sRGB channel, 0–1, to linear light. */
private fun linear(channel: Float): Double =
    if (channel <= 0.04045f) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)

fun luminance(color: Color): Double =
    0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue)

fun contrastRatio(first: Color, second: Color): Double {
    val a = luminance(first)
    val b = luminance(second)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)
}

private data class Oklab(val l: Double, val a: Double, val b: Double)

private fun Color.toOklab(): Oklab {
    val r = linear(red)
    val g = linear(green)
    val b = linear(blue)
    val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return Oklab(
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    )
}

private fun Oklab.toColor(): Color {
    val l = (this.l + 0.3963377774 * a + 0.2158037573 * b).pow(3)
    val m = (this.l - 0.1055613458 * a - 0.0638541728 * b).pow(3)
    val s = (this.l - 0.0894841775 * a - 1.291485548 * b).pow(3)
    // Rounded to bytes, as the web does, so both get the same colors.
    fun encode(channel: Double): Int {
        val value = if (channel <= 0.0031308) channel * 12.92 else 1.055 * channel.pow(1 / 2.4) - 0.055
        return (value.coerceIn(0.0, 1.0) * 255).roundToInt()
    }
    return Color(
        encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    )
}

/** Perceptual interpolation, `amount` of the way from [first] to [second]. */
fun mix(first: Color, second: Color, amount: Double): Color {
    val start = first.toOklab()
    val end = second.toOklab()
    return Oklab(
        start.l + (end.l - start.l) * amount,
        start.a + (end.a - start.a) * amount,
        start.b + (end.b - start.b) * amount,
    ).toColor()
}

/** Paints [foreground] at [alpha] over an opaque [background]. */
private fun composite(background: Color, foreground: Color, alpha: Double): Color = Color(
    (background.red + (foreground.red - background.red) * alpha).toFloat(),
    (background.green + (foreground.green - background.green) * alpha).toFloat(),
    (background.blue + (foreground.blue - background.blue) * alpha).toFloat(),
)

private fun contrastTarget(background: Color) =
    if (contrastRatio(WHITE, background) > contrastRatio(BLACK, background)) WHITE else BLACK

private fun adjust(color: Color, target: Color, accepts: (Color) -> Boolean): Color {
    if (accepts(color)) return color
    var low = 0.0
    var high = 1.0
    repeat(16) {
        val amount = (low + high) / 2
        if (accepts(mix(color, target, amount))) high = amount else low = amount
    }
    return mix(color, target, high)
}

/** Lightens or darkens [color] just enough to reach the contrast target. */
private fun ensureContrast(color: Color, background: Color, minimum: Double) =
    adjust(color, contrastTarget(background)) { contrastRatio(it, background) >= minimum }

/** Like [ensureContrast], but also readable on its own translucent tint. */
private fun ensureTintedContrast(color: Color, background: Color, tintAlpha: Double, minimum: Double) =
    adjust(color, contrastTarget(background)) {
        contrastRatio(it, background) >= minimum && contrastRatio(it, composite(background, it, tintAlpha)) >= minimum
    }

/** The largest tint opacity, up to [preferred], that keeps [foreground] legible on it. */
fun contrastSafeTintAlpha(foreground: Color, background: Color, preferred: Double, minimum: Double = 4.55): Double {
    fun passes(alpha: Double) = contrastRatio(foreground, composite(background, foreground, alpha)) >= minimum
    if (passes(preferred)) return preferred
    var low = 0.0
    var high = preferred
    repeat(16) {
        val alpha = (low + high) / 2
        if (passes(alpha)) low = alpha else high = alpha
    }
    return low
}

private fun readableForeground(background: Color) =
    listOf(SOFT_WHITE, SOFT_BLACK, WHITE, BLACK).reduce { best, candidate ->
        if (contrastRatio(candidate, background) > contrastRatio(best, background)) candidate else best
    }

/** How strong the accent's tint is on a background of each tone, as globals.css has it. */
fun softAlpha(dark: Boolean) = if (dark) 0.22 else 0.12

private fun fitAccent(seed: Color, background: Color): Color =
    ensureTintedContrast(seed, background, softAlpha(luminance(background) < 0.179), 4.5)

private data class AccentFamily(val foreground: Color, val hover: Color, val active: Color, val dim: Color)

private fun accentFamily(accent: Color, background: Color): AccentFamily {
    val dark = luminance(background) < 0.179
    val foreground = readableForeground(accent)
    return AccentFamily(
        foreground = foreground,
        hover = ensureContrast(mix(accent, if (dark) WHITE else BLACK, if (dark) 0.12 else 0.14), foreground, 4.5),
        active = ensureContrast(mix(accent, if (dark) BLACK else WHITE, if (dark) 0.14 else 0.12), foreground, 4.5),
        dim = mix(accent, background, 0.58),
    )
}

/**
 * Replaces the accent with [seed], adjusted for contrast against the
 * background: the server's accent on the Matinee theme, which an admin
 * picks without seeing every background it lands on.
 */
fun ThemeColors.withAccent(seed: Color): ThemeColors {
    val accent = fitAccent(seed, background)
    val family = accentFamily(accent, background)
    return copy(
        accent = accent,
        accentForeground = family.foreground,
        accentHover = family.hover,
        accentActive = family.active,
        accentDim = family.dim,
    )
}

private enum class Ramp { Surface, SurfaceRaised, Input, Border, BorderStrong, BorderEmphasis, TextFaint, TextDim, TextMuted }

/** Where each derived step sits between background (0) and text (1), off Matinee's own ramps. */
private val RAMP_POSITIONS = mapOf(
    true to mapOf(
        Ramp.Surface to 0.046, Ramp.SurfaceRaised to 0.092, Ramp.Input to 0.144, Ramp.Border to 0.184,
        Ramp.BorderStrong to 0.264, Ramp.BorderEmphasis to 0.391, Ramp.TextFaint to 0.598, Ramp.TextDim to 0.655,
        Ramp.TextMuted to 0.782,
    ),
    false to mapOf(
        Ramp.Surface to 0.019, Ramp.SurfaceRaised to 0.038, Ramp.Input to 0.063, Ramp.Border to 0.114,
        Ramp.BorderStrong to 0.19, Ramp.BorderEmphasis to 0.367, Ramp.TextFaint to 0.62, Ramp.TextDim to 0.62,
        Ramp.TextMuted to 0.747,
    ),
)

/** Matinee's own anchors for what a theme leaves out. */
private fun anchors(appearance: Appearance) = when (appearance) {
    Appearance.Dark -> DefaultThemes.dark.colors
    Appearance.Light -> DefaultThemes.light.colors
}

/**
 * Fills in every role [overrides] leaves out, as the web's
 * `completeThemeColors`: text from the background, the ramp between the
 * two, and the accent family from the accent.
 */
fun completeThemeColors(appearance: Appearance, overrides: Map<String, Color>): ThemeColors {
    val base = anchors(appearance)
    val background = overrides["background"] ?: base.background
    val dark = luminance(background) < 0.179
    val text = overrides["text"] ?: ensureContrast(
        mix(background, if (dark) WHITE else BLACK, if (dark) 0.97 else 0.82),
        background,
        7.0,
    )
    val positions = RAMP_POSITIONS.getValue(dark)
    fun ramp(role: String, step: Ramp) = overrides[role] ?: mix(background, text, positions.getValue(step))
    val input = ramp("input", Ramp.Input)
    val accent = overrides["accent"] ?: base.accent
    val family = accentFamily(accent, background)
    fun status(role: String, anchor: Color) = overrides[role] ?: ensureContrast(anchor, background, 3.0)
    return ThemeColors(
        background = background,
        surface = ramp("surface", Ramp.Surface),
        surfaceRaised = ramp("surfaceRaised", Ramp.SurfaceRaised),
        surfaceSunken = overrides["surfaceSunken"] ?: if (dark) mix(background, BLACK, 0.36) else input,
        input = input,
        border = ramp("border", Ramp.Border),
        borderStrong = ramp("borderStrong", Ramp.BorderStrong),
        borderEmphasis = ramp("borderEmphasis", Ramp.BorderEmphasis),
        text = text,
        textMuted = ramp("textMuted", Ramp.TextMuted),
        textDim = ramp("textDim", Ramp.TextDim),
        textFaint = ramp("textFaint", Ramp.TextFaint),
        accent = accent,
        accentForeground = overrides["accentForeground"] ?: family.foreground,
        accentHover = overrides["accentHover"] ?: family.hover,
        accentActive = overrides["accentActive"] ?: family.active,
        accentDim = overrides["accentDim"] ?: family.dim,
        success = status("success", base.success),
        warning = status("warning", base.warning),
        danger = status("danger", base.danger),
        info = status("info", base.info),
        live = status("live", base.live),
    )
}
