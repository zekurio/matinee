package io.github.zekurio.matinee.ui.settings

import io.github.zekurio.matinee.ui.LocalNavigator
import android.app.LocaleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.annotation.RequiresApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import io.github.zekurio.matinee.BuildConfig
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.api.AccountSession
import io.github.zekurio.matinee.api.ORIGINAL_LANGUAGE
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.api.SubtitleMode
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.downloads.DEFAULT_DEVICE
import io.github.zekurio.matinee.downloads.DEFAULT_ORIGINAL
import io.github.zekurio.matinee.downloads.DownloadSubtitles
import io.github.zekurio.matinee.downloads.VIDEO_PRESETS
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.audioFormatName
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.launchShowing
import io.github.zekurio.matinee.ui.downloads.mbps
import io.github.zekurio.matinee.ui.formatBytes
import io.github.zekurio.matinee.ui.formatInstant
import io.github.zekurio.matinee.ui.player.AUTOMATIC
import io.github.zekurio.matinee.ui.player.Capabilities
import io.github.zekurio.matinee.ui.player.Decoders
import io.github.zekurio.matinee.ui.player.ORIGINAL_QUALITY
import io.github.zekurio.matinee.ui.player.PlayerPrefs
import io.github.zekurio.matinee.ui.player.QUALITIES
import io.github.zekurio.matinee.ui.player.SKIP_STEPS
import io.github.zekurio.matinee.ui.player.SUBTITLE_SCALES
import io.github.zekurio.matinee.ui.player.SubtitleBackground
import io.github.zekurio.matinee.ui.player.SubtitleColor
import io.github.zekurio.matinee.ui.player.SubtitleEdge
import io.github.zekurio.matinee.ui.player.SubtitleLine
import io.github.zekurio.matinee.ui.player.SubtitleLook
import io.github.zekurio.matinee.ui.player.rememberSubtitleLook
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.videoCodecName
import java.text.NumberFormat
import java.util.Locale

/**
 * Settings, as the web's account and playback panels, and what only an app
 * on the device can change: how subtitles look, the decoders, downloads,
 * and the app's language.
 */
@Composable
fun SettingsScreen(session: Session) {
    val api = LocalApi.current
    val user = LocalUser.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val prefs = context.app.player
    val options = rememberLoader("playbackOptions") { playbackOptions() }
    val sessions = rememberLoader("sessions") { sessions() }
    val playback = user.playback ?: PlaybackPreferences()
    val server = (session.state.value as? AuthState.SignedIn)?.server.orEmpty()
    val saveFailure = stringResource(R.string.player_error_save_preferences)
    val save = { changed: PlaybackPreferences ->
        scope.launchShowing(snackbar, saveFailure) { session.updateUser(api.setPlaybackPreferences(changed)) }
    }
    val loaded = (options.state as? Load.Ready)?.value
    val passthrough = remember { Capabilities.OPTIONAL_PASSTHROUGH.filter(Capabilities::decodesAudio) }

    Column(Modifier.fillMaxSize()) {
        val nav = LocalNavigator.current
        Box(Modifier.statusBarsPadding().fillMaxWidth().height(56.dp)) {
            RoundIconButton(
                Lucide.ArrowLeft,
                stringResource(R.string.common_back),
                nav::back,
                Modifier.align(Alignment.CenterStart).padding(start = 6.dp),
                background = Color.Transparent,
            )
            Text(stringResource(R.string.shell_settings), style = MaterialTheme.typography.titleMedium, modifier = Modifier.align(Alignment.Center))
        }
        HorizontalDivider(color = Palette.Border)
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 8.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            item(key = "profile") {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 64.dp)
                    Column(Modifier.weight(1f)) {
                        Text(user.name, style = MaterialTheme.typography.titleLarge)
                        Text("@${user.username}", style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                    }
                }
            }
            item(key = "languages") { LanguagesSection(playback, loaded, save) }
            item(key = "subtitles") { SubtitlesSection(prefs) }
            item(key = "device") { DeviceSection(prefs, loaded) }
            if (passthrough.isNotEmpty()) item(key = "passthrough") { PassthroughSection(prefs, passthrough) }
            item(key = "downloads") { DownloadsSection() }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) item(key = "app") { AppSection() }
            item(key = "sessions") {
                Section(stringResource(R.string.account_sessions_title), stringResource(R.string.account_sessions_description)) {}
            }
            when (val state = sessions.state) {
                Load.Loading -> item { Text("…", color = Palette.Muted) }
                is Load.Failed -> item {
                    Text(stringResource(R.string.account_sessions_load_failed, state.message), color = Palette.Muted, style = MaterialTheme.typography.bodyMedium)
                }
                is Load.Ready -> items(state.value, key = { it.id }) { item ->
                    SessionRow(item) {
                        scope.launchShowing(snackbar, context.getString(R.string.account_sessions_sign_out_failed)) {
                            api.revokeSession(item.id)
                            sessions.reload()
                        }
                    }
                }
            }
            item(key = "server") {
                Section(stringResource(R.string.settings_server), null) {
                    Panel {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            LucideIcon(Lucide.Server, null, tint = Palette.Muted)
                            Column(Modifier.weight(1f)) {
                                Text(server, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(stringResource(R.string.settings_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
                            }
                        }
                    }
                    Gap(12.dp)
                    MatineeButton(onClick = session::signOut, look = ButtonLook.Outline, modifier = Modifier.fillMaxWidth()) {
                        LucideIcon(Lucide.LogOut, null, size = 18.dp)
                        Text(stringResource(R.string.shell_sign_out))
                    }
                    Gap(8.dp)
                    MatineeButton(onClick = session::forgetServer, look = ButtonLook.Ghost, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.connect_change_server), color = Palette.Muted)
                    }
                }
            }
            item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
        }
    }
}

/** The account's languages, which every device of the account plays by. */
@Composable
private fun LanguagesSection(playback: PlaybackPreferences, options: PlaybackOptions?, save: (PlaybackPreferences) -> Unit) {
    Section(stringResource(R.string.playback_languages_title), stringResource(R.string.playback_languages_description)) {
        Panel {
            val audioOptions = buildList {
                add(null to stringResource(R.string.playback_audio_file_default))
                add(ORIGINAL_LANGUAGE to stringResource(R.string.playback_audio_original))
                options?.audioLanguages?.forEach { add(it to languageName(it)) }
            }
            PickerRow(
                stringResource(R.string.playback_audio_title),
                stringResource(R.string.playback_audio_description),
                audioOptions,
                playback.audioLanguage,
            ) { save(playback.copy(audioLanguage = it)) }
            RowDivider()
            PickerRow(
                stringResource(R.string.playback_subtitles_title),
                null,
                SubtitleMode.all.map { it to subtitleModeLabel(it) },
                playback.subtitleMode,
            ) { save(playback.copy(subtitleMode = it)) }
            // With subtitles off, which language they'd be in doesn't matter.
            if (playback.subtitleMode != SubtitleMode.OFF) {
                RowDivider()
                PickerRow(
                    stringResource(R.string.playback_subtitles_language),
                    null,
                    buildList {
                        add(null to stringResource(R.string.playback_subtitles_device_language, languageName(Locale.getDefault().language)))
                        options?.subtitleLanguages?.forEach { add(it to languageName(it)) }
                    },
                    playback.subtitleLanguage,
                ) { save(playback.copy(subtitleLanguage = it)) }
            }
            RowDivider()
            SwitchRow(
                stringResource(R.string.playback_subtitles_remember),
                stringResource(R.string.playback_subtitles_remember_description),
                playback.rememberSubtitles,
            ) { save(playback.copy(rememberSubtitles = it)) }
        }
    }
}

/** How subtitles look here: the system's caption style, or the app's own, with a sample. */
@Composable
private fun SubtitlesSection(prefs: PlayerPrefs) {
    val context = LocalContext.current
    Section(stringResource(R.string.settings_subtitles_title), stringResource(R.string.settings_subtitles_description)) {
        SubtitlePreview(rememberSubtitleLook(prefs))
        Gap(12.dp)
        Panel {
            SwitchRow(
                stringResource(R.string.settings_subtitles_system),
                stringResource(R.string.settings_subtitles_system_description),
                prefs.subtitleSystemStyle,
            ) { prefs.subtitleSystemStyle = it }
            RowDivider()
            if (prefs.subtitleSystemStyle) {
                LinkRow(stringResource(R.string.settings_subtitles_system_open), null) {
                    context.openSettings(Intent(Settings.ACTION_CAPTIONING_SETTINGS))
                }
            } else {
                val percent = remember { NumberFormat.getPercentInstance() }
                PickerRow(
                    stringResource(R.string.settings_subtitles_size),
                    null,
                    SUBTITLE_SCALES.map { it to percent.format(it.toDouble()) },
                    prefs.subtitleScale,
                ) { prefs.subtitleScale = it }
                RowDivider()
                PickerRow(
                    stringResource(R.string.settings_subtitles_color),
                    null,
                    SubtitleColor.entries.map { it to subtitleColorLabel(it) },
                    prefs.subtitleColor,
                ) { prefs.subtitleColor = it }
                RowDivider()
                PickerRow(
                    stringResource(R.string.settings_subtitles_background),
                    null,
                    SubtitleBackground.entries.map { it to subtitleBackgroundLabel(it) },
                    prefs.subtitleBackground,
                ) { prefs.subtitleBackground = it }
                RowDivider()
                PickerRow(
                    stringResource(R.string.settings_subtitles_edge),
                    null,
                    SubtitleEdge.entries.map { it to subtitleEdgeLabel(it) },
                    prefs.subtitleEdge,
                ) { prefs.subtitleEdge = it }
            }
        }
    }
}

/** A line of subtitles over a stand-in for a bright frame, as the player would draw it. */
@Composable
private fun SubtitlePreview(look: SubtitleLook) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        Modifier
            .fillMaxWidth()
            .height(140.dp)
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF9DB3D1), Color(0xFF55657F), Color(0xFF2B2622), Color(0xFF6E5A45))))
            .border(1.dp, Palette.Border, shape),
        contentAlignment = Alignment.BottomCenter,
    ) {
        SubtitleLine(AnnotatedString(stringResource(R.string.settings_subtitles_preview)), look, Modifier.padding(horizontal = 16.dp, vertical = 14.dp), size = 16f)
    }
}

/** What stays with this device: quality, codecs, decoders, and how the player behaves. */
@Composable
private fun DeviceSection(prefs: PlayerPrefs, options: PlaybackOptions?) {
    val context = LocalContext.current
    Section(stringResource(R.string.playback_device_title), stringResource(R.string.playback_device_description)) {
        Panel {
            PickerRow(
                stringResource(R.string.playback_quality_title),
                stringResource(R.string.playback_quality_description),
                buildList {
                    add(ORIGINAL_QUALITY to stringResource(R.string.player_quality_original))
                    QUALITIES.forEach { add(it.id to qualityLabel(it.id)) }
                },
                prefs.quality,
            ) { prefs.quality = it }
            // A codec shows only when there's a choice: what the server encodes and this device decodes.
            val video = Capabilities.encodeVideoChoices(options?.videoCodecs ?: listOf("h264"))
            if (video.size > 1) {
                RowDivider()
                PickerRow(
                    stringResource(R.string.playback_video_codec_title),
                    stringResource(R.string.playback_video_codec_description),
                    listOf(AUTOMATIC to stringResource(R.string.playback_codec_automatic, videoCodecName("h264"))) +
                        video.map { it to videoCodecName(it) },
                    prefs.videoCodec.takeIf { it in video } ?: AUTOMATIC,
                ) { prefs.videoCodec = it }
            }
            val audio = Capabilities.convertAudioCodecs(options?.audioCodecs ?: listOf("aac"))
            if (audio.size > 1) {
                RowDivider()
                PickerRow(
                    stringResource(R.string.playback_audio_codec_title),
                    stringResource(R.string.playback_audio_codec_description),
                    listOf(AUTOMATIC to stringResource(R.string.playback_codec_automatic, audioFormatName(audio.first()))) +
                        audio.map { it to audioFormatName(it) },
                    prefs.audioCodec.takeIf { it in audio } ?: AUTOMATIC,
                ) { prefs.audioCodec = it }
            }
            RowDivider()
            PickerRow(
                stringResource(R.string.playback_decoders_title),
                stringResource(R.string.playback_decoders_description),
                listOf(
                    Decoders.HARDWARE to stringResource(R.string.playback_decoders_hardware),
                    Decoders.SOFTWARE to stringResource(R.string.playback_decoders_software),
                ),
                prefs.decoders,
            ) { prefs.decoders = it }
            RowDivider()
            PickerRow(
                stringResource(R.string.playback_skip_title),
                stringResource(R.string.playback_skip_description),
                SKIP_STEPS.map { it to pluralStringResource(R.plurals.playback_skip_seconds, it, it) },
                prefs.skipSeconds,
            ) { prefs.skipSeconds = it }
            RowDivider()
            SwitchRow(
                stringResource(R.string.playback_autoplay_title),
                stringResource(R.string.playback_autoplay_description),
                prefs.autoplayNext,
            ) { prefs.autoplayNext = it }
            if (remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE) }) {
                RowDivider()
                SwitchRow(
                    stringResource(R.string.playback_pip_title),
                    stringResource(R.string.playback_pip_description),
                    prefs.pictureInPicture,
                ) { prefs.pictureInPicture = it }
            }
        }
    }
}

/** A switch per format this device plays that the server could convert, as the web's passthrough. */
@Composable
private fun PassthroughSection(prefs: PlayerPrefs, codecs: List<String>) {
    Section(stringResource(R.string.playback_passthrough_title), stringResource(R.string.playback_passthrough_description)) {
        Panel {
            codecs.forEachIndexed { index, codec ->
                if (index > 0) RowDivider()
                SwitchRow(audioFormatName(codec), passthroughNote(codec), codec !in prefs.convertAudio) { on ->
                    prefs.convertAudio = if (on) prefs.convertAudio - codec else prefs.convertAudio + codec
                }
            }
        }
    }
}

@Composable
private fun DownloadsSection() {
    val context = LocalContext.current
    val api = LocalApi.current
    val downloads = context.app.downloads
    val items by downloads.store.items.collectAsState()
    var unmetered by remember { mutableStateOf(downloads.unmeteredOnly) }
    var version by remember { mutableStateOf(downloads.defaultVersion) }
    var subtitles by remember { mutableStateOf(downloads.subtitles) }
    var confirm by remember { mutableStateOf(false) }
    val total = formatBytes(items.values.sumOf { it.bytes })
    Section(stringResource(R.string.downloads_title), null) {
        Panel {
            SwitchRow(
                stringResource(R.string.downloads_unmetered),
                stringResource(R.string.downloads_unmetered_description),
                unmetered,
            ) {
                unmetered = it
                downloads.unmeteredOnly = it
            }
            RowDivider()
            PickerRow(
                stringResource(R.string.downloads_default_title),
                stringResource(R.string.downloads_default_description),
                buildList {
                    add(DEFAULT_DEVICE to stringResource(R.string.downloads_choice_device))
                    VIDEO_PRESETS.forEach { add(it.height.toString() to stringResource(R.string.downloads_choice_preset, it.height, mbps(it.bitrate))) }
                    add(DEFAULT_ORIGINAL to stringResource(R.string.downloads_choice_original))
                },
                version,
            ) {
                version = it
                downloads.defaultVersion = it
            }
            RowDivider()
            PickerRow(
                stringResource(R.string.downloads_subtitles_title),
                stringResource(R.string.downloads_subtitles_description),
                listOf(
                    DownloadSubtitles.USED to stringResource(R.string.downloads_subtitles_used),
                    DownloadSubtitles.ALL to stringResource(R.string.downloads_subtitles_all),
                    DownloadSubtitles.NONE to stringResource(R.string.downloads_subtitles_none),
                ),
                subtitles,
            ) {
                subtitles = it
                downloads.subtitles = it
            }
            if (items.isNotEmpty()) {
                RowDivider()
                LinkRow(
                    stringResource(R.string.downloads_remove_all),
                    stringResource(R.string.downloads_total, total),
                    destructive = true,
                ) { confirm = true }
            }
        }
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            containerColor = Palette.Raised,
            title = { Text(stringResource(R.string.downloads_remove_all_confirm)) },
            text = { Text(stringResource(R.string.downloads_remove_all_body, total), color = Palette.Muted) },
            confirmButton = {
                TextButton(onClick = {
                    confirm = false
                    downloads.removeAll(api)
                }) { Text(stringResource(R.string.common_remove), color = Palette.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { confirm = false }) { Text(stringResource(R.string.common_cancel), color = Palette.Foreground) }
            },
        )
    }
}

/** The app's own language, which Android keeps per app from version 13. */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
@Composable
private fun AppSection() {
    val context = LocalContext.current
    // Read again on coming back from the system's page.
    val lifecycle by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val system = stringResource(R.string.settings_app_language_system)
    val language = remember(lifecycle) {
        val locales = context.getSystemService(LocaleManager::class.java)?.applicationLocales
        locales?.takeIf { !it.isEmpty }?.get(0)?.let { it.getDisplayName(it).replaceFirstChar { c -> c.titlecase(it) } } ?: system
    }
    Section(stringResource(R.string.settings_app_title), null) {
        Panel {
            LinkRow(
                stringResource(R.string.settings_app_language),
                stringResource(R.string.settings_app_language_description),
                value = language,
            ) {
                context.openSettings(Intent(Settings.ACTION_APP_LOCALE_SETTINGS, Uri.fromParts("package", context.packageName, null)))
            }
        }
    }
}

/** Opens one of the system's settings pages, if this device has it. */
private fun Context.openSettings(intent: Intent) {
    runCatching { startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

@Composable
private fun SessionRow(session: AccountSession, onSignOut: () -> Unit) {
    val name = session.deviceName ?: session.browser ?: session.platform ?: stringResource(R.string.account_device_browser)
    Row(
        Modifier.fillMaxWidth().clip(PanelShape).background(Palette.Card).border(1.dp, Palette.Border, PanelShape).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(Palette.Secondary),
            contentAlignment = Alignment.Center,
        ) {
            LucideIcon(if (session.client == "app") Lucide.Smartphone else Lucide.Monitor, null, tint = Palette.Muted)
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (session.current) {
                    Text(
                        stringResource(R.string.account_sessions_this_device),
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(Palette.Secondary).padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
            }
            Text(
                listOfNotNull(
                    session.platform?.let { stringResource(R.string.account_device_app, it.replaceFirstChar(Char::titlecase)) },
                    stringResource(R.string.account_sessions_signed_in, formatInstant(session.createdAt)),
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (!session.current) {
            RoundIconButton(Lucide.LogOut, stringResource(R.string.account_sessions_sign_out_named, name), onSignOut, background = Color.Transparent, size = 40.dp, iconSize = 18.dp)
        }
    }
}

@Composable
private fun subtitleModeLabel(mode: String): String = stringResource(
    when (mode) {
        SubtitleMode.ALWAYS -> R.string.playback_subtitles_mode_always
        SubtitleMode.FOREIGN -> R.string.playback_subtitles_mode_foreign
        SubtitleMode.FORCED -> R.string.playback_subtitles_mode_forced
        SubtitleMode.OFF -> R.string.playback_subtitles_mode_off
        else -> R.string.playback_subtitles_mode_default
    },
)

@Composable
private fun subtitleColorLabel(color: SubtitleColor): String = stringResource(
    when (color) {
        SubtitleColor.WHITE -> R.string.settings_subtitles_color_white
        SubtitleColor.YELLOW -> R.string.settings_subtitles_color_yellow
        SubtitleColor.CYAN -> R.string.settings_subtitles_color_cyan
        SubtitleColor.GREEN -> R.string.settings_subtitles_color_green
    },
)

@Composable
private fun subtitleBackgroundLabel(background: SubtitleBackground): String = stringResource(
    when (background) {
        SubtitleBackground.NONE -> R.string.settings_subtitles_background_none
        SubtitleBackground.SHADED -> R.string.settings_subtitles_background_shaded
        SubtitleBackground.BLACK -> R.string.settings_subtitles_background_black
    },
)

@Composable
private fun subtitleEdgeLabel(edge: SubtitleEdge): String = stringResource(
    when (edge) {
        SubtitleEdge.SHADOW -> R.string.settings_subtitles_edge_shadow
        SubtitleEdge.OUTLINE -> R.string.settings_subtitles_edge_outline
        SubtitleEdge.NONE -> R.string.settings_subtitles_edge_none
    },
)

@Composable
private fun passthroughNote(codec: String): String? = when (codec) {
    "ac3" -> stringResource(R.string.playback_passthrough_ac3)
    "eac3" -> stringResource(R.string.playback_passthrough_eac3)
    "flac" -> stringResource(R.string.playback_passthrough_flac)
    "alac" -> stringResource(R.string.playback_passthrough_alac)
    else -> null
}

/** "German" for `de`, in the device's language. */
fun languageName(tag: String): String {
    val locale = Locale.forLanguageTag(tag)
    return locale.getDisplayName(Locale.getDefault()).replaceFirstChar { it.titlecase(Locale.getDefault()) }.ifEmpty { tag }
}

/** "1080p, 20 Mbps" for an encode. */
@Composable
fun qualityLabel(id: String): String {
    val quality = QUALITIES.firstOrNull { it.id == id } ?: return stringResource(R.string.player_quality_original)
    val mbps = quality.bitrate / 1_000_000
    return stringResource(R.string.playback_quality_preset, quality.height, stringResource(R.string.player_bitrate_mbps, mbps))
}
