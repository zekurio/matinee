package io.github.zekurio.matinee.ui.settings

import android.app.LocaleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.annotation.DrawableRes
import androidx.annotation.RequiresApi
import androidx.annotation.StringRes
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
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import io.github.zekurio.matinee.BuildConfig
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.DEFAULT_PLAYBACK_PREFERENCES
import io.github.zekurio.matinee.api.ORIGINAL_LANGUAGE
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.api.PlaybackQualityPreset
import io.github.zekurio.matinee.api.Session as AccountSession
import io.github.zekurio.matinee.api.SubtitleMode
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.api.skipBack
import io.github.zekurio.matinee.api.skipForward
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.downloads.DEFAULT_DEVICE
import io.github.zekurio.matinee.downloads.DEFAULT_ORIGINAL
import io.github.zekurio.matinee.downloads.DownloadSubtitles
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.audioFormatName
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.launchShowing
import io.github.zekurio.matinee.ui.downloads.mbps
import io.github.zekurio.matinee.ui.formatBytes
import io.github.zekurio.matinee.ui.formatInstant
import io.github.zekurio.matinee.ui.player.AUTOMATIC
import io.github.zekurio.matinee.ui.player.Capabilities
import io.github.zekurio.matinee.ui.player.Decoders
import io.github.zekurio.matinee.ui.player.ORIGINAL_QUALITY
import io.github.zekurio.matinee.ui.player.OWN_SUBTITLE_EDGES
import io.github.zekurio.matinee.ui.player.PlayerEngine
import io.github.zekurio.matinee.ui.player.PlayerPrefs
import io.github.zekurio.matinee.ui.player.SUBTITLE_SCALES
import io.github.zekurio.matinee.ui.player.SubtitleBackground
import io.github.zekurio.matinee.ui.player.SubtitleColor
import io.github.zekurio.matinee.ui.player.SubtitleEdge
import io.github.zekurio.matinee.ui.player.SubtitleLine
import io.github.zekurio.matinee.ui.player.SubtitleLook
import io.github.zekurio.matinee.ui.player.rememberSubtitleLook
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.admin.AuthenticationSettings
import io.github.zekurio.matinee.ui.settings.admin.JobsSettings
import io.github.zekurio.matinee.ui.settings.admin.LibrariesSettings
import io.github.zekurio.matinee.ui.settings.admin.ServerAppearanceSettings
import io.github.zekurio.matinee.ui.settings.admin.TranscodingSettings
import io.github.zekurio.matinee.ui.settings.admin.TrickplaySettings
import io.github.zekurio.matinee.ui.settings.admin.UsersSettings
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.videoCodecName
import java.text.NumberFormat
import java.util.Locale
import kotlinx.coroutines.delay

/**
 * A category of Settings, as Findroid and the web's phone menu list them:
 * each is a row on the first page, and opens a page of its own.
 */
enum class SettingsPage(val key: String, @param:DrawableRes val icon: Int, @param:StringRes val title: Int, val admin: Boolean = false) {
    Account("account", Lucide.UserRound, R.string.settings_page_account),
    Appearance("appearance", Lucide.Palette, R.string.settings_page_appearance),
    Playback("playback", Lucide.TvPlay, R.string.settings_page_playback),
    Subtitles("subtitles", Lucide.Captions, R.string.settings_subtitles_title),
    Downloads("downloads", Lucide.Download, R.string.downloads_title),
    App("app", Lucide.Smartphone, R.string.settings_app_title),

    // The server's settings, for admins, as the web's admin sections. Each page lives in ui/settings/admin.
    Libraries("libraries", Lucide.LibraryBig, R.string.settings_admin_libraries, admin = true),
    Users("users", Lucide.Users, R.string.settings_admin_users, admin = true),
    Authentication("authentication", Lucide.KeyRound, R.string.settings_admin_authentication, admin = true),
    Transcoding("transcoding", Lucide.Film, R.string.settings_admin_transcoding, admin = true),
    Trickplay("trickplay", Lucide.GalleryHorizontalEnd, R.string.settings_admin_trickplay, admin = true),
    Jobs("jobs", Lucide.ListChecks, R.string.settings_admin_jobs, admin = true),
    ServerAppearance("server-appearance", Lucide.Paintbrush, R.string.settings_admin_appearance, admin = true),
    ;

    companion object {
        fun of(key: String) = entries.firstOrNull { it.key == key }
    }
}

/** A Settings page: its top bar, then its sections down a list. The admin pages build on it too. */
@Composable
internal fun SettingsScaffold(title: String, content: LazyListScope.() -> Unit) {
    Column(Modifier.fillMaxSize()) {
        TopBar(title)
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 8.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            content()
            item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
        }
    }
}

/** A category's row on the first page. */
@Composable
private fun PageRow(page: SettingsPage) {
    val nav = LocalNavigator.current
    LinkRow(stringResource(page.title), icon = page.icon) { nav.settingsPage(page.key) }
}

/**
 * Settings' first page: the categories, in two groups, what follows the
 * account and what stays on this device, then the server, with the ways
 * out at the bottom.
 */
@Composable
fun SettingsScreen(session: Session) {
    val server = (session.state.value as? AuthState.SignedIn)?.server.orEmpty()
    val admin = LocalUser.current.isAdmin && !LocalOffline.current
    val offline = LocalOffline.current
    SettingsScaffold(stringResource(R.string.shell_settings)) {
        // On top, as Findroid has it: the app starts with the downloads and leaves the server alone.
        item(key = "offline") {
            Panel {
                SwitchRow(stringResource(R.string.settings_offline_mode), session.offlineMode, icon = Lucide.CloudOff) {
                    session.setOfflineMode(it)
                }
            }
        }
        item(key = "account") {
            Panel {
                // The sessions live on the server.
                if (!offline) {
                    PageRow(SettingsPage.Account)
                    RowDivider()
                }
                PageRow(SettingsPage.Appearance)
                RowDivider()
                PageRow(SettingsPage.Playback)
                RowDivider()
                PageRow(SettingsPage.Subtitles)
            }
        }
        item(key = "device") {
            Panel {
                PageRow(SettingsPage.Downloads)
                // Android keeps a language per app from version 13.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    RowDivider()
                    PageRow(SettingsPage.App)
                }
            }
        }
        if (admin) {
            item(key = "admin") {
                Section(stringResource(R.string.settings_admin)) {
                    Panel {
                        SettingsPage.entries.filter { it.admin }.forEachIndexed { index, page ->
                            if (index > 0) RowDivider()
                            PageRow(page)
                        }
                    }
                }
            }
        }
        item(key = "server") {
            Section(stringResource(R.string.settings_server)) {
                Panel {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        LucideIcon(Lucide.Server, null, tint = Palette.Muted)
                        Column(Modifier.weight(1f)) {
                            Text(server, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(stringResource(R.string.settings_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
                        }
                    }
                    RowDivider()
                    // Full rows, so the two ways out are easy to hit; signing out in red, as it ends the session.
                    LinkRow(stringResource(R.string.connect_change_server), icon = Lucide.RefreshCw, onClick = session::forgetServer)
                    RowDivider()
                    LinkRow(stringResource(R.string.shell_sign_out), destructive = true, icon = Lucide.LogOut, onClick = session::signOut)
                }
            }
        }
    }
}

/** A category's page, by its key in the route. */
@Composable
fun SettingsPageScreen(session: Session, key: String) {
    val page = SettingsPage.of(key) ?: return SettingsScreen(session)
    when (page) {
        SettingsPage.Account -> AccountPage()
        SettingsPage.Appearance -> AppearancePage()
        SettingsPage.Playback -> PlaybackPage(session)
        SettingsPage.Subtitles -> SettingsScaffold(stringResource(page.title)) {
            item(key = "subtitles") { SubtitlesSection(LocalContext.current.app.player) }
        }
        SettingsPage.Downloads -> SettingsScaffold(stringResource(page.title)) {
            item(key = "downloads") { DownloadsSection() }
        }
        SettingsPage.App -> SettingsScaffold(stringResource(page.title)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) item(key = "app") { AppSection() }
        }
        SettingsPage.Libraries -> LibrariesSettings()
        SettingsPage.Users -> UsersSettings()
        SettingsPage.Authentication -> AuthenticationSettings()
        SettingsPage.Transcoding -> TranscodingSettings()
        SettingsPage.Trickplay -> TrickplaySettings()
        SettingsPage.Jobs -> JobsSettings()
        SettingsPage.ServerAppearance -> ServerAppearanceSettings()
    }
}

/**
 * Signing in another device, then the places the account is signed in,
 * each but this one with a way to sign it out.
 */
@Composable
private fun AccountPage() {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val sessions = rememberLoader("sessions") { account.sessions.list() }
    // Back from signing in a device: show it. The page was disposed
    // meanwhile, but its loader wasn't, so a ready list means a return. The
    // device gets its session on its next poll, up to five seconds after
    // the approval, so ask once more after that.
    val lifecycle by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    LaunchedEffect(lifecycle) {
        if (lifecycle != Lifecycle.State.RESUMED || sessions.state !is Load.Ready) return@LaunchedEffect
        sessions.reload()
        delay(DEVICE_POLL_MS)
        sessions.reload()
    }
    SettingsScaffold(stringResource(R.string.settings_page_account)) {
        item(key = "link") {
            Panel {
                LinkRow(
                    stringResource(R.string.link_title),
                    icon = Lucide.ScanQrCode,
                    description = stringResource(R.string.link_row_description),
                    onClick = nav::linkDevice,
                )
            }
        }
        item(key = "sessionsTitle") {
            Text(stringResource(R.string.account_sessions_title), style = MaterialTheme.typography.titleLarge)
        }
        when (val state = sessions.state) {
            Load.Loading -> item(key = "loading") { Text("…", color = Palette.Muted) }
            is Load.Failed -> item(key = "failed") {
                Text(stringResource(R.string.account_sessions_load_failed, state.message), color = Palette.Muted, style = MaterialTheme.typography.bodyMedium)
            }
            is Load.Ready -> items(state.value, key = { it.id }) { item ->
                SessionRow(item) {
                    scope.launchShowing(snackbar, context.getString(R.string.account_sessions_sign_out_failed)) {
                        api.account.sessions.revoke(item.id)
                        sessions.reload()
                    }
                }
            }
        }
    }
}

/** A little more than the server's poll interval for devices signing in with a code. */
private const val DEVICE_POLL_MS = 6_000L

/** The account's languages, then what this device plays and how. */
@Composable
private fun PlaybackPage(session: Session) {
    val api = LocalApi.current
    val user = LocalUser.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val prefs = LocalContext.current.app.player
    val options = rememberLoader("playbackOptions") { playback.options() }
    val playback = user.playback ?: DEFAULT_PLAYBACK_PREFERENCES
    val saveFailure = stringResource(R.string.player_error_save_preferences)
    val save = { changed: PlaybackPreferences ->
        scope.launchShowing(snackbar, saveFailure) { session.updateUser(api.account.playback.setPreferences(changed)) }
    }
    val loaded = (options.state as? Load.Ready)?.value
    val passthrough = remember { Capabilities.passthrough }
    SettingsScaffold(stringResource(R.string.settings_page_playback)) {
        item(key = "languages") { LanguagesSection(playback, loaded, save) }
        item(key = "skips") { SkipsSection(playback, loaded, save) }
        item(key = "device") { DeviceSection(prefs, loaded) }
        item(key = "transcoding") { TranscodingSection(prefs, loaded) }
        if (passthrough.isNotEmpty()) item(key = "passthrough") { PassthroughSection(prefs, passthrough) }
        item(key = "diagnostics") { PlaybackDiagnosticsSection() }
    }
}

/** The account's languages, which every device of the account plays by. */
@Composable
private fun LanguagesSection(playback: PlaybackPreferences, options: PlaybackOptions?, save: (PlaybackPreferences) -> Unit) {
    Section(stringResource(R.string.playback_languages_title)) {
        Panel {
            val audioOptions = buildList {
                add(null to stringResource(R.string.playback_audio_file_default))
                add(ORIGINAL_LANGUAGE to stringResource(R.string.playback_audio_original))
                options?.audioLanguages?.forEach { add(it to languageName(it)) }
            }
            PickerRow(
                stringResource(R.string.playback_audio_title),
                audioOptions,
                playback.audioLanguage,
            ) { save(playback.copy(audioLanguage = it)) }
            RowDivider()
            PickerRow(
                stringResource(R.string.playback_subtitles_title),
                SubtitleMode.all.map { it to subtitleModeLabel(it) },
                playback.subtitleMode,
            ) { save(playback.copy(subtitleMode = it)) }
            // With subtitles off, which language they'd be in doesn't matter.
            if (playback.subtitleMode != SubtitleMode.OFF) {
                RowDivider()
                PickerRow(
                    stringResource(R.string.playback_subtitles_language),
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
                playback.rememberSubtitles,
            ) { save(playback.copy(rememberSubtitles = it)) }
        }
    }
}

/** How far the player skips each way, which every device of the account uses. */
@Composable
private fun SkipsSection(playback: PlaybackPreferences, options: PlaybackOptions?, save: (PlaybackPreferences) -> Unit) {
    Section(stringResource(R.string.playback_skip_title)) {
        Panel {
            PickerRow(
                stringResource(R.string.playback_skip_back),
                skipChoices(playback.skipBack, options),
                playback.skipBack,
            ) { save(playback.copy(skipBackSeconds = it)) }
            RowDivider()
            PickerRow(
                stringResource(R.string.playback_skip_forward),
                skipChoices(playback.skipForward, options),
                playback.skipForward,
            ) { save(playback.copy(skipForwardSeconds = it)) }
        }
    }
}

/** The skip lengths to pick from, with [current] too when another app set one the steps don't have. */
@Composable
private fun skipChoices(current: Int, options: PlaybackOptions?) = (options?.skipSteps.orEmpty() + current).distinct().sorted()
    .map { it to pluralStringResource(R.plurals.playback_skip_seconds, it, it) }

/**
 * How subtitles look here, with a sample: the system's caption style, which
 * leaves only the way to its settings, or the app's own choices.
 */
@Composable
private fun SubtitlesSection(prefs: PlayerPrefs) {
    val context = LocalContext.current
    Column {
        SubtitlePreview(rememberSubtitleLook(prefs))
        Gap(12.dp)
        Panel {
            SwitchRow(
                stringResource(R.string.settings_subtitles_system),
                prefs.subtitleSystemStyle,
            ) { prefs.subtitleSystemStyle = it }
            RowDivider()
            if (prefs.subtitleSystemStyle) {
                LinkRow(stringResource(R.string.settings_subtitles_system_open)) {
                    context.openSettings(Intent(Settings.ACTION_CAPTIONING_SETTINGS))
                }
            } else {
                OwnSubtitleLook(prefs)
            }
        }
    }
}

/** The app's own subtitle look. */
@Composable
private fun OwnSubtitleLook(prefs: PlayerPrefs) {
    val percent = remember { NumberFormat.getPercentInstance() }
    PickerRow(
        stringResource(R.string.settings_subtitles_size),
        SUBTITLE_SCALES.map { it to percent.format(it.toDouble()) },
        prefs.subtitleScale,
    ) { prefs.subtitleScale = it }
    RowDivider()
    PickerRow(
        stringResource(R.string.settings_subtitles_color),
        SubtitleColor.entries.map { it to subtitleColorLabel(it) },
        prefs.subtitleColor,
    ) { prefs.subtitleColor = it }
    RowDivider()
    PickerRow(
        stringResource(R.string.settings_subtitles_background),
        SubtitleBackground.entries.map { it to subtitleBackgroundLabel(it) },
        prefs.subtitleBackground,
    ) { prefs.subtitleBackground = it }
    RowDivider()
    PickerRow(
        stringResource(R.string.settings_subtitles_edge),
        OWN_SUBTITLE_EDGES.map { it to subtitleEdgeLabel(it) },
        prefs.subtitleEdge,
    ) { prefs.subtitleEdge = it }
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
    Section(stringResource(R.string.playback_device_title)) {
        Panel {
            PickerRow(
                stringResource(R.string.playback_quality_title),
                buildList {
                    add(ORIGINAL_QUALITY to stringResource(R.string.player_quality_original))
                    // The server's ladder, once `playback.options` answers.
                    options?.qualities?.forEach { add(it.id to qualityLabel(it)) }
                },
                prefs.quality,
            ) { prefs.quality = it }
            RowDivider()
            PickerRow(
                stringResource(R.string.playback_engine_title),
                listOf(PlayerEngine.EXOPLAYER to "ExoPlayer", PlayerEngine.MPV to "mpv"),
                prefs.engine,
            ) { prefs.engine = it }
            RowDivider()
            PickerRow(
                stringResource(R.string.playback_decoders_title),
                listOf(
                    Decoders.HARDWARE to stringResource(R.string.playback_decoders_hardware),
                    Decoders.SOFTWARE to stringResource(R.string.playback_decoders_software),
                ),
                prefs.decoders,
            ) { prefs.decoders = it }
            RowDivider()
            SwitchRow(
                stringResource(R.string.playback_autoplay_title),
                prefs.autoplayNext,
            ) { prefs.autoplayNext = it }
            if (remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE) }) {
                RowDivider()
                SwitchRow(
                    stringResource(R.string.playback_pip_title),
                    prefs.pictureInPicture,
                ) { prefs.pictureInPicture = it }
            }
        }
    }
}

/**
 * The codecs the server converts to when this device can't play a file as
 * it is. Downloads don't use them; they have a codec of their own.
 */
@Composable
private fun TranscodingSection(prefs: PlayerPrefs, options: PlaybackOptions?) {
    // A codec shows only when there's a choice: what the server encodes and this device decodes.
    val video = Capabilities.encodeVideoChoices(options?.videoCodecs ?: listOf("h264"))
    val audio = Capabilities.convertAudioCodecs(options?.audioCodecs ?: listOf("aac"))
    if (video.size <= 1 && audio.size <= 1) return
    Section(stringResource(R.string.playback_transcoding_title)) {
        Panel {
            if (video.size > 1) {
                PickerRow(
                    stringResource(R.string.playback_video_codec_title),
                    listOf(AUTOMATIC to stringResource(R.string.playback_codec_automatic, videoCodecName("h264"))) +
                        video.map { it to videoCodecName(it) },
                    prefs.videoCodec.takeIf { it in video } ?: AUTOMATIC,
                ) { prefs.videoCodec = it }
            }
            if (audio.size > 1) {
                if (video.size > 1) RowDivider()
                PickerRow(
                    stringResource(R.string.playback_audio_codec_title),
                    listOf(AUTOMATIC to stringResource(R.string.playback_codec_automatic, audioFormatName(audio.first()))) +
                        audio.map { it to audioFormatName(it) },
                    prefs.audioCodec.takeIf { it in audio } ?: AUTOMATIC,
                ) { prefs.audioCodec = it }
            }
        }
        Gap(8.dp)
        Text(stringResource(R.string.playback_transcoding_note), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
    }
}

/** A switch per format this device plays that the server could convert, as the web's passthrough. */
@Composable
private fun PassthroughSection(prefs: PlayerPrefs, codecs: List<String>) {
    Section(stringResource(R.string.playback_passthrough_title)) {
        Panel {
            codecs.forEachIndexed { index, codec ->
                if (index > 0) RowDivider()
                SwitchRow(audioFormatName(codec), codec !in prefs.convertAudio) { on ->
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
    val options = rememberLoader("downloadOptions") { playback.options() }
    val loaded = (options.state as? Load.Ready)?.value
    val downloads = context.app.downloads
    val items by downloads.store.items.collectAsState()
    var unmetered by remember { mutableStateOf(downloads.unmeteredOnly) }
    var version by remember { mutableStateOf(downloads.defaultVersion) }
    var codec by remember { mutableStateOf(downloads.videoCodec) }
    var subtitles by remember { mutableStateOf(downloads.subtitles) }
    var confirm by remember { mutableStateOf(false) }
    val total = formatBytes(items.values.sumOf { it.bytes })
    val free = remember(items.size) { formatBytes(context.filesDir.usableSpace) }
    Column {
        Panel {
            ValueRow(stringResource(R.string.downloads_storage), stringResource(R.string.downloads_storage_value, total, free))
            RowDivider()
            SwitchRow(
                stringResource(R.string.downloads_unmetered),
                unmetered,
            ) {
                unmetered = it
                downloads.unmeteredOnly = it
            }
        }
        Gap(28.dp)
        // What the download sheet starts on.
        Section(stringResource(R.string.downloads_defaults)) {
            Panel {
                PickerRow(
                    stringResource(R.string.downloads_default_title),
                    buildList {
                        add(DEFAULT_DEVICE to stringResource(R.string.downloads_choice_device))
                        loaded?.downloadVideoPresets?.forEach { add(it.height.toString() to stringResource(R.string.downloads_choice_preset, it.height, mbps(it.bitrate))) }
                        add(DEFAULT_ORIGINAL to stringResource(R.string.downloads_choice_original))
                    },
                    version,
                ) {
                    version = it
                    downloads.defaultVersion = it
                }
                RowDivider()
                PickerRow(
                    stringResource(R.string.downloads_default_subtitles),
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
                // What an encoded download comes in: of the server's codecs, those this device decodes.
                val codecs = Capabilities.encodeVideoChoices(loaded?.videoCodecs ?: listOf("h264"))
                if (codecs.size > 1) {
                    RowDivider()
                    PickerRow(
                        stringResource(R.string.downloads_codec),
                        listOf(AUTOMATIC to stringResource(R.string.playback_codec_automatic, videoCodecName("h264"))) +
                            codecs.map { it to videoCodecName(it) },
                        codec.takeIf { it in codecs } ?: AUTOMATIC,
                    ) {
                        codec = it
                        downloads.videoCodec = it
                    }
                }
            }
            Gap(8.dp)
            Text(stringResource(R.string.downloads_codec_note), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
        if (items.isNotEmpty()) {
            Gap(28.dp)
            Panel {
                LinkRow(stringResource(R.string.downloads_remove_all), destructive = true) { confirm = true }
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
    Column {
        Panel {
            LinkRow(
                stringResource(R.string.settings_app_language),
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
    val name = session.deviceName
        ?: session.browser
        ?: session.platform?.let { stringResource(R.string.account_device_app, platformLabel(it)) }
        ?: stringResource(R.string.account_device_browser)
    Row(
        Modifier.fillMaxWidth().clip(PanelShape).background(Palette.Card).border(1.dp, Palette.Border, PanelShape).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(Palette.Secondary),
            contentAlignment = Alignment.Center,
        ) {
            LucideIcon(platformIcon(session.platform), null, tint = Palette.Muted)
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
                    session.platform?.let { stringResource(R.string.account_device_app, platformLabel(it)) },
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
        // Only the system's style asks for these, and it isn't picked here.
        SubtitleEdge.RAISED, SubtitleEdge.DEPRESSED -> R.string.settings_subtitles_edge_shadow
    },
)

/** "German" for `de`, in the device's language. */
fun languageName(tag: String): String {
    val locale = Locale.forLanguageTag(tag)
    return locale.getDisplayName(Locale.getDefault()).replaceFirstChar { it.titlecase(Locale.getDefault()) }.ifEmpty { tag }
}

/** "1080p, 20 Mbps" for an encode. */
@Composable
fun qualityLabel(quality: PlaybackQualityPreset): String {
    val mbps = quality.bitrate / 1_000_000
    return stringResource(R.string.playback_quality_preset, quality.height, stringResource(R.string.player_bitrate_mbps, mbps))
}
