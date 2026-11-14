package io.github.zekurio.matinee.ui.tv.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.BuildConfig
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.DEFAULT_PLAYBACK_PREFERENCES
import io.github.zekurio.matinee.api.Session as AccountSession
import io.github.zekurio.matinee.api.SubtitleMode
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.api.skipBack
import io.github.zekurio.matinee.api.skipForward
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.audioFormatName
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.launchShowing
import io.github.zekurio.matinee.ui.formatBitrate
import io.github.zekurio.matinee.ui.formatInstant
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.player.AUTOMATIC
import io.github.zekurio.matinee.ui.player.Capabilities
import io.github.zekurio.matinee.ui.player.Decoders
import io.github.zekurio.matinee.ui.player.ORIGINAL_QUALITY
import io.github.zekurio.matinee.ui.player.OWN_SUBTITLE_EDGES
import io.github.zekurio.matinee.ui.player.PlayerEngine
import io.github.zekurio.matinee.ui.player.SUBTITLE_SCALES
import io.github.zekurio.matinee.ui.player.SubtitleBackground
import io.github.zekurio.matinee.ui.player.SubtitleColor
import io.github.zekurio.matinee.ui.player.SubtitleLine
import io.github.zekurio.matinee.ui.player.rememberSubtitleLook
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.audioLanguageChoices
import io.github.zekurio.matinee.ui.settings.platformIcon
import io.github.zekurio.matinee.ui.settings.platformLabel
import io.github.zekurio.matinee.ui.settings.qualityLabel
import io.github.zekurio.matinee.ui.settings.rememberPlaybackSave
import io.github.zekurio.matinee.ui.settings.rememberSpecialsSave
import io.github.zekurio.matinee.ui.settings.sessionName
import io.github.zekurio.matinee.ui.settings.skipChoices
import io.github.zekurio.matinee.ui.settings.subtitleBackgroundLabel
import io.github.zekurio.matinee.ui.settings.subtitleColorLabel
import io.github.zekurio.matinee.ui.settings.subtitleEdgeLabel
import io.github.zekurio.matinee.ui.settings.subtitleLanguageChoices
import io.github.zekurio.matinee.ui.settings.subtitleModeLabel
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.TvListHeading
import io.github.zekurio.matinee.ui.tv.TvListItem
import io.github.zekurio.matinee.ui.tv.TvListValue
import io.github.zekurio.matinee.ui.tv.TvSidePanel
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.videoCodecName
import java.text.NumberFormat

/*
 * The rows of each TV settings category, from the phone's pages. What the
 * phone has that these leave out: offline mode, appearance, downloads,
 * linking a device, the admin pages, and picture in picture, none of
 * which a TV has a use for or a way to do. The About category is in
 * TvAbout.kt.
 */

/**
 * What this TV plays and how, then the account's skip lengths, the codecs
 * for encodes, and passthrough, as the phone's Playback page.
 */
@Composable
internal fun ColumnScope.PlaybackRows(session: Session, panels: SettingsPanels, first: Modifier) {
    val prefs = LocalContext.current.app.player
    val user = LocalUser.current
    val playback = user.playback ?: DEFAULT_PLAYBACK_PREFERENCES
    val save = rememberPlaybackSave(session)
    val options = (rememberLoader("playbackOptions") { this.playback.options() }.state as? Load.Ready)?.value
    val passthrough = remember { Capabilities.passthrough }

    TvListHeading(stringResource(R.string.tv_settings_this_tv))
    // The qualities this account may stream, once `playback.options` answers.
    val qualities = buildList {
        add(ORIGINAL_QUALITY to stringResource(R.string.player_quality_original))
        options?.qualities?.forEach { add(it.id to qualityLabel(it)) }
    }
    PickRow(
        stringResource(R.string.playback_quality_title),
        qualities,
        // One the account may no longer use shows as the original, the best the server
        // allows; it stays saved, so a lifted limit brings it back.
        if (options == null || qualities.any { it.first == prefs.quality }) prefs.quality else ORIGINAL_QUALITY,
        panels,
        first,
        description = options?.maxBitrate?.let { stringResource(R.string.playback_quality_limit, formatBitrate(it, LocalResources.current)) },
    ) { prefs.quality = it }
    SwitchRow(
        stringResource(R.string.tv_settings_frame_rate),
        prefs.matchFrameRate,
        description = stringResource(R.string.tv_settings_frame_rate_description),
    ) { prefs.matchFrameRate = it }
    SwitchRow(stringResource(R.string.playback_autoplay_title), prefs.autoplayNext) { prefs.autoplayNext = it }
    PickRow(
        stringResource(R.string.playback_engine_title),
        listOf(PlayerEngine.EXOPLAYER to "ExoPlayer", PlayerEngine.MPV to "mpv"),
        prefs.engine,
        panels,
    ) { prefs.engine = it }
    PickRow(
        stringResource(R.string.playback_decoders_title),
        listOf(
            Decoders.HARDWARE to stringResource(R.string.playback_decoders_hardware),
            Decoders.SOFTWARE to stringResource(R.string.playback_decoders_software),
        ),
        prefs.decoders,
        panels,
    ) { prefs.decoders = it }

    GroupGap()
    TvListHeading(stringResource(R.string.playback_skip_title))
    PickRow(stringResource(R.string.playback_skip_back), skipChoices(playback.skipBack, options), playback.skipBack, panels) {
        save(playback.copy(skipBackSeconds = it))
    }
    PickRow(stringResource(R.string.playback_skip_forward), skipChoices(playback.skipForward, options), playback.skipForward, panels) {
        save(playback.copy(skipForwardSeconds = it))
    }

    // A codec shows only when there's a choice: what the server encodes and this TV decodes.
    val video = Capabilities.encodeVideoChoices(options?.videoCodecs ?: listOf("h264"))
    val audio = Capabilities.convertAudioCodecs(options?.audioCodecs ?: listOf("aac"))
    if (video.size > 1 || audio.size > 1) {
        GroupGap()
        TvListHeading(stringResource(R.string.playback_transcoding_title))
        if (video.size > 1) {
            PickRow(
                stringResource(R.string.playback_video_codec_title),
                listOf(AUTOMATIC to stringResource(R.string.playback_codec_automatic, videoCodecName("h264"))) + video.map { it to videoCodecName(it) },
                prefs.videoCodec.takeIf { it in video } ?: AUTOMATIC,
                panels,
            ) { prefs.videoCodec = it }
        }
        if (audio.size > 1) {
            PickRow(
                stringResource(R.string.playback_audio_codec_title),
                listOf(AUTOMATIC to stringResource(R.string.playback_codec_automatic, audioFormatName(audio.first()))) + audio.map { it to audioFormatName(it) },
                prefs.audioCodec.takeIf { it in audio } ?: AUTOMATIC,
                panels,
            ) { prefs.audioCodec = it }
        }
        RowNote(stringResource(R.string.tv_settings_transcoding_note))
    }

    if (passthrough.isNotEmpty()) {
        GroupGap()
        TvListHeading(stringResource(R.string.playback_passthrough_title))
        passthrough.forEach { codec ->
            SwitchRow(audioFormatName(codec), codec !in prefs.convertAudio) { on ->
                prefs.convertAudio = if (on) prefs.convertAudio - codec else prefs.convertAudio + codec
            }
        }
    }
}

/** How subtitles look on this TV, over a sample: the system's caption style, or the app's own. */
@Composable
internal fun ColumnScope.SubtitleRows(panels: SettingsPanels, first: Modifier) {
    val context = LocalContext.current
    val prefs = context.app.player
    SubtitlePreview(prefs)
    SwitchRow(stringResource(R.string.settings_subtitles_system), prefs.subtitleSystemStyle, first) { prefs.subtitleSystemStyle = it }
    if (prefs.subtitleSystemStyle) {
        TvListItem(
            stringResource(R.string.settings_subtitles_system_open),
            onClick = { context.openSystemSettings(CAPTION_SETTINGS) },
            quiet = true,
            trailing = { TvListValue("") },
        )
        return
    }
    val percent = remember { NumberFormat.getPercentInstance() }
    PickRow(
        stringResource(R.string.settings_subtitles_size),
        SUBTITLE_SCALES.map { it to percent.format(it.toDouble()) },
        prefs.subtitleScale,
        panels,
    ) { prefs.subtitleScale = it }
    PickRow(
        stringResource(R.string.settings_subtitles_color),
        SubtitleColor.entries.map { it to subtitleColorLabel(it) },
        prefs.subtitleColor,
        panels,
    ) { prefs.subtitleColor = it }
    PickRow(
        stringResource(R.string.settings_subtitles_background),
        SubtitleBackground.entries.map { it to subtitleBackgroundLabel(it) },
        prefs.subtitleBackground,
        panels,
    ) { prefs.subtitleBackground = it }
    PickRow(
        stringResource(R.string.settings_subtitles_edge),
        OWN_SUBTITLE_EDGES.map { it to subtitleEdgeLabel(it) },
        prefs.subtitleEdge,
        panels,
    ) { prefs.subtitleEdge = it }
}

/** A line of subtitles over a stand-in for a frame, drawn as the player draws them, at the player's size on a TV. */
@Composable
private fun SubtitlePreview(prefs: io.github.zekurio.matinee.ui.player.PlayerPrefs) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        Modifier
            .padding(start = 20.dp, end = 20.dp, bottom = 16.dp)
            .fillMaxWidth()
            .height(128.dp)
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF9DB3D1), Color(0xFF55657F), Color(0xFF2B2622), Color(0xFF6E5A45)))),
        contentAlignment = Alignment.BottomCenter,
    ) {
        SubtitleLine(
            AnnotatedString(stringResource(R.string.settings_subtitles_preview)),
            rememberSubtitleLook(prefs),
            Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
            size = 18f,
        )
    }
}

/** The account's languages, which every device of the account plays by. */
@Composable
internal fun ColumnScope.LanguageRows(session: Session, panels: SettingsPanels, first: Modifier) {
    val user = LocalUser.current
    val playback = user.playback ?: DEFAULT_PLAYBACK_PREFERENCES
    val save = rememberPlaybackSave(session)
    val options = (rememberLoader("playbackOptions") { this.playback.options() }.state as? Load.Ready)?.value
    PickRow(stringResource(R.string.playback_audio_title), audioLanguageChoices(options), playback.audioLanguage, panels, first) {
        save(playback.copy(audioLanguage = it))
    }
    PickRow(
        stringResource(R.string.playback_subtitles_title),
        SubtitleMode.all.map { it to subtitleModeLabel(it) },
        playback.subtitleMode,
        panels,
    ) { save(playback.copy(subtitleMode = it)) }
    // With subtitles off, which language they'd be in doesn't matter.
    if (playback.subtitleMode != SubtitleMode.OFF) {
        PickRow(stringResource(R.string.playback_subtitles_language), subtitleLanguageChoices(options), playback.subtitleLanguage, panels) {
            save(playback.copy(subtitleLanguage = it))
        }
    }
    SwitchRow(stringResource(R.string.playback_subtitles_remember), playback.rememberSubtitles) {
        save(playback.copy(rememberSubtitles = it))
    }
    SwitchRow(
        stringResource(R.string.playback_specials_title),
        user.library.showSpecials,
        description = stringResource(R.string.playback_specials_note),
        onChange = rememberSpecialsSave(session),
    )
    RowNote(stringResource(R.string.tv_settings_languages_note))
}

/** The places the account is signed in; Select on one but this TV asks to sign it out. */
@Composable
internal fun ColumnScope.DeviceRows(panels: SettingsPanels, first: Modifier) {
    val api = LocalApi.current
    val snackbar = LocalSnackbar.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val sessions = rememberLoader("sessions") { account.sessions.list() }
    // Opening the category asks again, so a device signed in meanwhile shows.
    androidx.compose.runtime.LaunchedEffect(Unit) { sessions.refreshIfStale(0) }
    when (val state = sessions.state) {
        Load.Loading -> Spinner(Modifier.padding(start = 20.dp, top = 12.dp), size = 28.dp, color = Palette.Muted)
        is Load.Failed -> {
            RowNote(stringResource(R.string.account_sessions_load_failed, state.message))
            TvListItem(stringResource(R.string.common_retry), onClick = sessions::reload, modifier = first, icon = Lucide.RefreshCw, quiet = true)
        }
        is Load.Ready -> state.value.forEachIndexed { index, item ->
            val name = sessionName(item)
            val signOutFailed = stringResource(R.string.account_sessions_sign_out_failed)
            val row = remember { FocusRequester() }
            SessionRow(item, name, (if (index == 0) first else Modifier).focusRequester(row)) {
                panels.show(row) { open ->
                    TvSidePanel(
                        open,
                        stringResource(R.string.tv_settings_sign_out_device, name),
                        onBack = panels::close,
                        returnFocus = panels::restore,
                        description = stringResource(R.string.tv_settings_sign_out_device_description),
                    ) {
                        item(key = "signOut") {
                            TvListItem(
                                stringResource(R.string.shell_sign_out),
                                onClick = {
                                    panels.close()
                                    scope.launchShowing(snackbar, signOutFailed) {
                                        api.account.sessions.revoke(item.id)
                                        sessions.reload()
                                    }
                                },
                                icon = Lucide.LogOut,
                                quiet = true,
                                destructive = true,
                            )
                        }
                        item(key = "cancel") {
                            TvListItem(stringResource(R.string.common_cancel), onClick = panels::close, icon = Lucide.X, quiet = true)
                        }
                    }
                }
            }
        }
    }
}

/** A signed-in device: what it is, since when, and this TV marked; the others open a way to sign them out. */
@Composable
private fun SessionRow(session: AccountSession, name: String, modifier: Modifier, onSignOut: () -> Unit) {
    val facts = listOfNotNull(
        session.platform?.let { stringResource(R.string.account_device_app, platformLabel(it)) },
        stringResource(R.string.account_sessions_signed_in, formatInstant(session.createdAt)),
    ).joinToString(" · ")
    TvListItem(
        name,
        // This TV stays focusable, so the list scrolls past it, but has nothing to do.
        onClick = { if (!session.current) onSignOut() },
        modifier = modifier,
        subtitle = facts,
        icon = platformIcon(session.platform),
        quiet = true,
        minHeight = 68.dp,
        trailing = {
            if (session.current) {
                Text(
                    stringResource(R.string.account_sessions_this_device),
                    style = TvType.Label,
                    color = LocalContentColor.current.copy(alpha = 0.7f),
                )
            } else {
                TvListValue(stringResource(R.string.shell_sign_out))
            }
        },
    )
}

/** Who's signed in and to which server, and the ways out: another server, or signing out. */
@Composable
internal fun ColumnScope.AccountRows(session: Session, panels: SettingsPanels, first: Modifier) {
    val api = LocalApi.current
    val user = LocalUser.current
    val server = (session.state.value as? AuthState.SignedIn)?.server.orEmpty()
    TvListItem(
        user.name,
        onClick = {},
        modifier = first,
        subtitle = listOfNotNull(
            user.displayName?.let { "@${user.username}" },
            if (user.isAdmin) stringResource(R.string.profile_admin) else null,
        ).joinToString(" · ").ifEmpty { null },
        quiet = true,
        minHeight = 76.dp,
        leading = { Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 44.dp) },
    )
    TvListItem(
        server.substringAfter("://"),
        onClick = {},
        subtitle = stringResource(R.string.settings_version, BuildConfig.VERSION_NAME),
        icon = Lucide.Server,
        quiet = true,
    )
    GroupGap()
    // The saved servers, in the panel at the right edge.
    val change = remember { FocusRequester() }
    TvListItem(
        stringResource(R.string.connect_change_server),
        onClick = {
            panels.show(change) { open ->
                io.github.zekurio.matinee.ui.tv.auth.TvServerPanel(open, session, panels::close, panels::restore)
            }
        },
        modifier = Modifier.focusRequester(change),
        icon = Lucide.RefreshCw,
        quiet = true,
    )
    TvListItem(stringResource(R.string.shell_sign_out), onClick = session::signOut, icon = Lucide.LogOut, quiet = true, destructive = true)
}
