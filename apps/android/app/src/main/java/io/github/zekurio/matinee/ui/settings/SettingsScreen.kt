package io.github.zekurio.matinee.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.BuildConfig
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.AccountSession
import io.github.zekurio.matinee.api.ORIGINAL_LANGUAGE
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.api.SubtitleMode
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
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
import io.github.zekurio.matinee.ui.formatInstant
import io.github.zekurio.matinee.ui.player.ORIGINAL_QUALITY
import io.github.zekurio.matinee.ui.player.PlayerPrefs
import io.github.zekurio.matinee.ui.player.QUALITIES
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import java.util.Locale

private val Panel = RoundedCornerShape(12.dp)

/** Settings, as the web's account and playback panels: what this app can change. */
@Composable
fun SettingsScreen(session: Session) {
    val nav = LocalNavigator.current
    val api = LocalApi.current
    val user = LocalUser.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val prefs = remember { PlayerPrefs(context) }
    val options = rememberLoader("playbackOptions") { playbackOptions() }
    val sessions = rememberLoader("sessions") { sessions() }
    val playback = user.playback ?: PlaybackPreferences()
    var quality by remember { mutableStateOf(prefs.quality) }
    val server = (session.state.value as? AuthState.SignedIn)?.server.orEmpty()
    val saveFailure = stringResource(R.string.player_error_save_preferences)
    val save = { changed: PlaybackPreferences ->
        scope.launchShowing(snackbar, saveFailure) { session.updateUser(api.setPlaybackPreferences(changed)) }
    }
    val languages = (options.state as? Load.Ready)?.value

    Column(Modifier.fillMaxSize()) {
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
            contentPadding = PaddingValues(horizontal = Gutter, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 64.dp)
                    Column(Modifier.weight(1f)) {
                        Text(user.name, style = MaterialTheme.typography.titleLarge)
                        Text("@${user.username}", style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                    }
                }
            }
            item {
                Section(stringResource(R.string.playback_languages_title), stringResource(R.string.playback_languages_description)) {
                    Panel {
                        val audioOptions = buildList {
                            add(null to stringResource(R.string.playback_audio_file_default))
                            add(ORIGINAL_LANGUAGE to stringResource(R.string.playback_audio_original))
                            languages?.audioLanguages?.forEach { add(it to languageName(it)) }
                        }
                        PickerRow(
                            stringResource(R.string.playback_audio_title),
                            stringResource(R.string.playback_audio_description),
                            audioOptions,
                            playback.audioLanguage,
                        ) { save(playback.copy(audioLanguage = it)) }
                        Divider()
                        PickerRow(
                            stringResource(R.string.playback_subtitles_title),
                            null,
                            SubtitleMode.all.map { it to subtitleModeLabel(it) },
                            playback.subtitleMode,
                        ) { save(playback.copy(subtitleMode = it)) }
                        Divider()
                        PickerRow(
                            stringResource(R.string.playback_subtitles_language),
                            null,
                            buildList {
                                add(null to stringResource(R.string.playback_subtitles_device_language, languageName(Locale.getDefault().language)))
                                languages?.subtitleLanguages?.forEach { add(it to languageName(it)) }
                            },
                            playback.subtitleLanguage,
                        ) { save(playback.copy(subtitleLanguage = it)) }
                        Divider()
                        SwitchRow(
                            stringResource(R.string.playback_subtitles_remember),
                            stringResource(R.string.playback_subtitles_remember_description),
                            playback.rememberSubtitles,
                        ) { save(playback.copy(rememberSubtitles = it)) }
                    }
                }
            }
            item {
                Section(stringResource(R.string.playback_device_title), stringResource(R.string.playback_device_description)) {
                    Panel {
                        PickerRow(
                            stringResource(R.string.playback_quality_title),
                            stringResource(R.string.playback_quality_description),
                            buildList {
                                add(ORIGINAL_QUALITY to stringResource(R.string.player_quality_original))
                                QUALITIES.forEach { add(it.id to qualityLabel(it.id)) }
                            },
                            quality,
                        ) {
                            val picked = it
                            prefs.quality = picked
                            quality = picked
                        }
                    }
                }
            }
            item {
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
            item {
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
            item { Box(Modifier.navigationBarsPadding()) }
        }
    }
}

@Composable
private fun Section(title: String, description: String?, content: @Composable ColumnScope.() -> Unit) {
    Column {
        Text(title, style = MaterialTheme.typography.titleLarge)
        if (description != null) {
            Gap(4.dp)
            Text(description, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
        }
        Gap(14.dp)
        content()
    }
}

@Composable
private fun Panel(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(Panel).background(Palette.Card).border(1.dp, Palette.Border, Panel),
        content = content,
    )
}

@Composable
private fun Divider() = HorizontalDivider(color = Palette.Border)

@Composable
private fun <T> PickerRow(title: String, description: String?, options: List<Pair<T, String>>, current: T, onPick: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge)
                if (description != null) Text(description, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
            }
            Gap(12.dp)
            Text(
                options.firstOrNull { it.first == current }?.second ?: current.toString(),
                style = MaterialTheme.typography.bodyMedium,
                color = Palette.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(0.8f, fill = false),
            )
            LucideIcon(Lucide.ChevronDown, null, size = 16.dp, tint = Palette.Muted, modifier = Modifier.padding(start = 4.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = Palette.Raised) {
            options.forEach { (value, label) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    trailingIcon = if (value == current) ({ LucideIcon(Lucide.Check, null, size = 16.dp) }) else null,
                    onClick = {
                        open = false
                        if (value != current) onPick(value)
                    },
                )
            }
        }
    }
}

@Composable
private fun SwitchRow(title: String, description: String?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (description != null) Text(description, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
        Gap(12.dp)
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = Palette.Accent, checkedThumbColor = Color.Black),
        )
    }
}

@Composable
private fun SessionRow(session: AccountSession, onSignOut: () -> Unit) {
    val name = session.deviceName ?: session.browser ?: session.platform ?: stringResource(R.string.account_device_browser)
    Row(
        Modifier.fillMaxWidth().clip(Panel).background(Palette.Card).border(1.dp, Palette.Border, Panel).padding(14.dp),
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
