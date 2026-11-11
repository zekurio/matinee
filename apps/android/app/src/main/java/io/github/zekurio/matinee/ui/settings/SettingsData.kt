package io.github.zekurio.matinee.ui.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ORIGINAL_LANGUAGE
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.api.Session as AccountSession
import io.github.zekurio.matinee.api.SubtitleMode
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.launchShowing
import io.github.zekurio.matinee.ui.player.SubtitleBackground
import io.github.zekurio.matinee.ui.player.SubtitleColor
import io.github.zekurio.matinee.ui.player.SubtitleEdge
import java.util.Locale

/* What Settings offers and saves, apart from how it's laid out, for the phone's pages and the TV's. */

/**
 * Saves the account's playback preferences, which every device of the
 * account plays by, and shows a message when the server refuses.
 */
@Composable
fun rememberPlaybackSave(session: Session): (PlaybackPreferences) -> Unit {
    val api = LocalApi.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val saveFailure = stringResource(R.string.player_error_save_preferences)
    return { changed: PlaybackPreferences ->
        scope.launchShowing(snackbar, saveFailure) { session.updateUser(api.account.playback.setPreferences(changed)) }
    }
}

/** The audio languages to pick from: the file's default, the original, then the server's. */
@Composable
fun audioLanguageChoices(options: PlaybackOptions?): List<Pair<String?, String>> = buildList {
    add(null to stringResource(R.string.playback_audio_file_default))
    add(ORIGINAL_LANGUAGE to stringResource(R.string.playback_audio_original))
    options?.audioLanguages?.forEach { add(it to languageName(it)) }
}

/** The subtitle languages to pick from: this device's, then the server's. */
@Composable
fun subtitleLanguageChoices(options: PlaybackOptions?): List<Pair<String?, String>> = buildList {
    add(null to stringResource(R.string.playback_subtitles_device_language, languageName(Locale.getDefault().language)))
    options?.subtitleLanguages?.forEach { add(it to languageName(it)) }
}

/** The skip lengths to pick from, with [current] too when another app set one the steps don't have. */
@Composable
fun skipChoices(current: Int, options: PlaybackOptions?) = (options?.skipSteps.orEmpty() + current).distinct().sorted()
    .map { it to pluralStringResource(R.plurals.playback_skip_seconds, it, it) }

/** What a session in the list is called: the device's name, the browser, or the kind of app. */
@Composable
fun sessionName(session: AccountSession): String = session.deviceName
    ?: session.browser
    ?: session.platform?.let { stringResource(R.string.account_device_app, platformLabel(it)) }
    ?: stringResource(R.string.account_device_browser)

@Composable
fun subtitleModeLabel(mode: String): String = stringResource(
    when (mode) {
        SubtitleMode.ALWAYS -> R.string.playback_subtitles_mode_always
        SubtitleMode.FOREIGN -> R.string.playback_subtitles_mode_foreign
        SubtitleMode.FORCED -> R.string.playback_subtitles_mode_forced
        SubtitleMode.OFF -> R.string.playback_subtitles_mode_off
        else -> R.string.playback_subtitles_mode_default
    },
)

@Composable
fun subtitleColorLabel(color: SubtitleColor): String = stringResource(
    when (color) {
        SubtitleColor.WHITE -> R.string.settings_subtitles_color_white
        SubtitleColor.YELLOW -> R.string.settings_subtitles_color_yellow
        SubtitleColor.CYAN -> R.string.settings_subtitles_color_cyan
        SubtitleColor.GREEN -> R.string.settings_subtitles_color_green
    },
)

@Composable
fun subtitleBackgroundLabel(background: SubtitleBackground): String = stringResource(
    when (background) {
        SubtitleBackground.NONE -> R.string.settings_subtitles_background_none
        SubtitleBackground.SHADED -> R.string.settings_subtitles_background_shaded
        SubtitleBackground.BLACK -> R.string.settings_subtitles_background_black
    },
)

@Composable
fun subtitleEdgeLabel(edge: SubtitleEdge): String = stringResource(
    when (edge) {
        SubtitleEdge.SHADOW -> R.string.settings_subtitles_edge_shadow
        SubtitleEdge.OUTLINE -> R.string.settings_subtitles_edge_outline
        SubtitleEdge.NONE -> R.string.settings_subtitles_edge_none
        // Only the system's style asks for these, and it isn't picked here.
        SubtitleEdge.RAISED, SubtitleEdge.DEPRESSED -> R.string.settings_subtitles_edge_shadow
    },
)
