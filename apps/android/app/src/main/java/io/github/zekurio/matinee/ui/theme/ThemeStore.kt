package io.github.zekurio.matinee.ui.theme

import android.content.Context
import android.os.Build
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.edit
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.ThemeAccents
import kotlinx.serialization.json.Json

/** System follows the device; light and dark stay as picked. */
enum class ThemeMode(val key: String) {
    System("system"),
    Light("light"),
    Dark("dark"),
    ;

    companion object {
        fun of(key: String?) = entries.firstOrNull { it.key == key } ?: System
    }
}

/** The theme as it stands: the choice, and the colors each appearance shows. */
data class ThemeState(
    val mode: ThemeMode,
    /** The wallpaper's colors instead of Matinee's, on Android 12 and later. */
    val materialYou: Boolean,
    val light: ThemeColors,
    val dark: ThemeColors,
    /** The appearance on screen now. */
    val appearance: Appearance,
) {
    fun colorsFor(appearance: Appearance) = if (appearance == Appearance.Light) light else dark

    val colors get() = colorsFor(appearance)
}

/**
 * The live theme, as the web's theme engine keeps it: Matinee's light and
 * dark, the mode picked on this device, the device's dark mode, and the
 * accent the server's admins chose. On Android 12 and later, the wallpaper's
 * colors can stand in for Matinee's.
 */
class ThemeStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("theme", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    private var systemDark = true
    private var accents: ThemeAccents = readAccents()

    var state by mutableStateOf(run { migrate(); build() })
        private set

    init {
        publish()
    }

    /** Whether this device has Material You. */
    val materialYouAvailable get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    /**
     * The device's dark mode, from the activity's configuration. Reads the
     * wallpaper's colors again too, which a new configuration may bring.
     */
    fun setSystemDark(dark: Boolean) {
        systemDark = dark
        refresh()
    }

    fun setMode(mode: ThemeMode) {
        prefs.edit { putString("mode", mode.key) }
        refresh()
    }

    fun setMaterialYou(on: Boolean) {
        prefs.edit { putBoolean("material_you", on) }
        refresh()
    }

    fun setAccents(value: ThemeAccents) {
        if (value == accents) return
        accents = value
        prefs.edit { putString("accents", json.encodeToString(ThemeAccents.serializer(), value)) }
        refresh()
    }

    /** The server's accents, read again. */
    suspend fun pull(api: MatineeApi) {
        runCatching { api.authConfig() }.getOrNull()?.let { setAccents(it.themeAccents) }
    }

    /**
     * The choice as it was kept when there were themes to pick: Material You
     * picked for either appearance turns its switch on, and the rest goes.
     */
    private fun migrate() {
        if (!prefs.contains("light") && !prefs.contains("dark")) return
        val picked = listOf("light", "dark").any { prefs.getString(it, null)?.startsWith("material-you") == true }
        prefs.edit {
            if (picked) putBoolean("material_you", true)
            listOf("light", "dark", "sync", "account", "custom").forEach(::remove)
        }
    }

    private fun readAccents(): ThemeAccents = prefs.getString("accents", null)
        ?.let { runCatching { json.decodeFromString(ThemeAccents.serializer(), it) }.getOrNull() }
        ?: ThemeAccents()

    private fun refresh() {
        state = build()
        publish()
    }

    private fun publish() {
        Theming.resolved = state.colors
        Theming.dark = state.dark
    }

    private fun build(): ThemeState {
        val mode = ThemeMode.of(prefs.getString("mode", null))
        val materialYou = materialYouAvailable && prefs.getBoolean("material_you", false)
        fun colors(appearance: Appearance): ThemeColors {
            if (materialYou && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val scheme = if (appearance == Appearance.Light) dynamicLightColorScheme(context) else dynamicDarkColorScheme(context)
                return scheme.toThemeColors(appearance)
            }
            // The server's accent tints Matinee's own palettes.
            val accent = parseHexColor(if (appearance == Appearance.Light) accents.light else accents.dark)
            return accent?.let { matinee(appearance).withAccent(it) } ?: matinee(appearance)
        }
        val appearance = when (mode) {
            ThemeMode.System -> if (systemDark) Appearance.Dark else Appearance.Light
            ThemeMode.Light -> Appearance.Light
            ThemeMode.Dark -> Appearance.Dark
        }
        return ThemeState(mode, materialYou, colors(Appearance.Light), colors(Appearance.Dark), appearance)
    }
}

/**
 * Material's roles on the web's: surfaces from its containers, the accent
 * from its primary. Borders are left to the ramp between background and
 * text, as for any theme: Material's outlines are far stronger than
 * Matinee's hairlines, and the ramp keeps the wallpaper's tint anyway.
 */
private fun ColorScheme.toThemeColors(appearance: Appearance): ThemeColors = completeThemeColors(
    appearance,
    mapOf(
        "background" to surface,
        "surface" to surfaceContainerLow,
        "surfaceRaised" to surfaceContainer,
        "surfaceSunken" to surfaceContainerLowest,
        "input" to surfaceContainerHighest,
        "text" to onSurface,
        "textMuted" to onSurfaceVariant,
        "accent" to primary,
        "accentForeground" to onPrimary,
        "accentDim" to primaryContainer,
        "danger" to error,
    ),
)

/** The colors on screen, as snapshot state, so everything that reads them follows the theme. */
object Theming {
    /** The theme's colors for the appearance on screen. */
    var resolved by mutableStateOf(MATINEE_DARK)

    /** The theme's dark colors, which the player keeps to. */
    var dark by mutableStateOf(MATINEE_DARK)

    /** Set while the player shows: video plays on black, whichever theme the app shows. */
    var forceDark by mutableStateOf(false)

    val colors get() = if (forceDark) dark else resolved
}
