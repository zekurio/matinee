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
import io.github.zekurio.matinee.api.SyncedTheme
import io.github.zekurio.matinee.api.ThemeAccents
import io.github.zekurio.matinee.api.User
import io.github.zekurio.matinee.api.UserTheme
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/** System follows the device; light and dark each show their chosen theme. */
enum class ThemeMode(val key: String) {
    System("system"),
    Light("light"),
    Dark("dark"),
    ;

    companion object {
        fun of(key: String?) = entries.firstOrNull { it.key == key } ?: System
    }
}

/** The theme as it stands: the choice, every theme to choose from, and what each appearance shows. */
data class ThemeState(
    val mode: ThemeMode,
    val sync: Boolean,
    /** Bundled themes, then Material You where the device has it, then the account's own. */
    val families: List<ThemeFamily>,
    val light: ThemeVariant,
    val dark: ThemeVariant,
    /** The appearance on screen now. */
    val appearance: Appearance,
    val accents: ThemeAccents,
) {
    fun variant(appearance: Appearance) = if (appearance == Appearance.Light) light else dark

    /** The colors [variant] paints with: the server's accent tints Matinee's own. */
    fun colorsOf(variant: ThemeVariant): ThemeColors {
        val accent = if (DefaultThemes.isMatinee(variant.id)) {
            parseHexColor(if (variant.appearance == Appearance.Light) accents.light else accents.dark)
        } else {
            null
        }
        return accent?.let { variant.colors.withAccent(it) } ?: variant.colors
    }

    val colors get() = colorsOf(variant(appearance))
}

/**
 * The live theme, as the web's theme engine keeps it: the choice stored on
 * this device, the account's themes, the server's accents, and the
 * device's dark mode. The choice follows the account while sync is on; a
 * change made here is saved to it, and one made elsewhere comes with the
 * next session. Material You lives on this device only: the account keeps
 * the theme it had for that appearance.
 */
class ThemeStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("theme", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var pending: Job? = null

    /** Where saves go: the signed-in session's client, if there is one. */
    var api: () -> MatineeApi? = { null }

    private var systemDark = true
    private var customThemes: List<UserTheme> = readCustomThemes()
    private var accents: ThemeAccents = readAccents()

    var state by mutableStateOf(build())
        private set

    init {
        publish()
    }

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
        edited()
    }

    /** One variant takes over its appearance. */
    fun selectVariant(variant: ThemeVariant) {
        prefs.edit { putString(variant.appearance.key, variant.id) }
        edited()
    }

    /** A whole theme takes over every appearance it has. */
    fun selectFamily(family: ThemeFamily) {
        prefs.edit {
            for (appearance in Appearance.entries) {
                family.variants.firstOrNull { it.appearance == appearance }?.let { putString(appearance.key, it.id) }
            }
        }
        edited()
    }

    /** Turning sync on shares this device's theme with the account. */
    fun setSync(on: Boolean) {
        prefs.edit { putBoolean("sync", on) }
        edited()
    }

    fun setAccents(value: ThemeAccents) {
        if (value == accents) return
        accents = value
        prefs.edit { putString("accents", json.encodeToString(ThemeAccents.serializer(), value)) }
        refresh()
    }

    /**
     * Takes the account's choice and themes. A choice is adopted only when it
     * changed since this device last saw it, so a pick kept here, like
     * Material You, outlasts the next session.
     */
    fun adopt(user: User, themes: List<UserTheme>?) {
        if (themes != null && themes != customThemes) {
            customThemes = themes
            prefs.edit { putString("custom", json.encodeToString(ListSerializer(UserTheme.serializer()), themes)) }
        }
        val account = user.theme
        if (state.sync && pending == null) {
            when {
                account == null -> save(synced())
                account != lastAccount() -> {
                    prefs.edit {
                        putString("mode", account.mode)
                        putString("light", account.light)
                        putString("dark", account.dark)
                        putString("account", json.encodeToString(SyncedTheme.serializer(), account))
                    }
                }
            }
        }
        refresh()
    }

    /** The account's choice and themes, and the server's accents, read again. */
    suspend fun pull(api: MatineeApi, user: User) {
        val themes = try {
            api.accountThemes()
        } catch (e: IOException) {
            null
        }
        runCatching { api.authConfig() }.getOrNull()?.let { setAccents(it.themeAccents) }
        adopt(user, themes)
    }

    private fun edited() {
        refresh()
        if (state.sync) save(synced())
    }

    /** What the account gets: this device's choice, with its own themes left as the account had them. */
    private fun synced(): SyncedTheme {
        val before = lastAccount()
        fun pick(appearance: Appearance, kept: String?): String {
            val id = state.variant(appearance).id
            return if (id.startsWith(MATERIAL_YOU)) kept ?: DefaultThemes.idFor(appearance) else id
        }
        return SyncedTheme(state.mode.key, pick(Appearance.Light, before?.light), pick(Appearance.Dark, before?.dark))
    }

    /** Coalesces a burst of picks into one save. */
    private fun save(theme: SyncedTheme) {
        prefs.edit { putString("account", json.encodeToString(SyncedTheme.serializer(), theme)) }
        pending?.cancel()
        pending = scope.launch {
            delay(SAVE_DELAY_MS)
            // The theme still applies here; the next change tries the save again.
            runCatching { api()?.setThemePreferences(theme) }
            pending = null
        }
    }

    private fun lastAccount(): SyncedTheme? =
        prefs.getString("account", null)?.let { runCatching { json.decodeFromString(SyncedTheme.serializer(), it) }.getOrNull() }

    private fun readCustomThemes(): List<UserTheme> = prefs.getString("custom", null)
        ?.let { runCatching { json.decodeFromString(ListSerializer(UserTheme.serializer()), it) }.getOrNull() }
        .orEmpty()

    private fun readAccents(): ThemeAccents = prefs.getString("accents", null)
        ?.let { runCatching { json.decodeFromString(ThemeAccents.serializer(), it) }.getOrNull() }
        ?: ThemeAccents()

    private fun refresh() {
        state = build()
        publish()
    }

    private fun publish() {
        Theming.resolved = state.colors
        Theming.dark = state.colorsOf(state.dark)
    }

    private fun build(): ThemeState {
        val families = BUILTIN_THEMES + listOfNotNull(materialYou()) + customThemes.map(::customFamily)
        val mode = ThemeMode.of(prefs.getString("mode", null))
        fun resolve(appearance: Appearance): ThemeVariant {
            val id = prefs.getString(appearance.key, null) ?: DefaultThemes.idFor(appearance)
            return families.firstNotNullOfOrNull { family ->
                family.variants.firstOrNull { it.id == id && it.appearance == appearance }
            } ?: DefaultThemes.variant(appearance)
        }
        val appearance = when (mode) {
            ThemeMode.System -> if (systemDark) Appearance.Dark else Appearance.Light
            ThemeMode.Light -> Appearance.Light
            ThemeMode.Dark -> Appearance.Dark
        }
        return ThemeState(
            mode = mode,
            sync = prefs.getBoolean("sync", true),
            families = families,
            light = resolve(Appearance.Light),
            dark = resolve(Appearance.Dark),
            appearance = appearance,
            accents = accents,
        )
    }

    /** The wallpaper's colors, on Android 12 and later. */
    private fun materialYou(): ThemeFamily? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
        return ThemeFamily(
            id = MATERIAL_YOU,
            label = "Material You",
            custom = false,
            variants = listOf(
                ThemeVariant("$MATERIAL_YOU-light", "", Appearance.Light, dynamicLightColorScheme(context).toThemeColors(Appearance.Light)),
                ThemeVariant("$MATERIAL_YOU-dark", "", Appearance.Dark, dynamicDarkColorScheme(context).toThemeColors(Appearance.Dark)),
            ),
        )
    }

    /** An account theme, its variants named `<theme>:<variant>` and its colors filled in. */
    private fun customFamily(theme: UserTheme) = ThemeFamily(
        id = theme.id,
        label = theme.name,
        custom = true,
        variants = theme.variants.mapNotNull { variant ->
            val appearance = Appearance.of(variant.appearance) ?: return@mapNotNull null
            val colors = variant.colors.mapNotNull { (role, value) -> parseHexColor(value)?.let { role to it } }.toMap()
            ThemeVariant("${theme.id}:${variant.id}", variant.name?.trim().orEmpty(), appearance, completeThemeColors(appearance, colors))
        },
    )

    companion object {
        const val MATERIAL_YOU = "material-you"
        private const val SAVE_DELAY_MS = 800L
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
    var resolved by mutableStateOf(DefaultThemes.dark.colors)

    /** The theme's dark colors, which the player keeps to. */
    var dark by mutableStateOf(DefaultThemes.dark.colors)

    /** Set while the player shows: video plays on black, whichever theme the app shows. */
    var forceDark by mutableStateOf(false)

    val colors get() = if (forceDark) dark else resolved
}
