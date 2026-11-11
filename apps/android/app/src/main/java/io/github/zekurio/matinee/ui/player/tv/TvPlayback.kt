package io.github.zekurio.matinee.ui.player.tv

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.DEFAULT_PLAYBACK_PREFERENCES
import io.github.zekurio.matinee.api.skipBack
import io.github.zekurio.matinee.api.skipForward
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.player.HIDE_AFTER_MS
import io.github.zekurio.matinee.ui.player.LocalPlayerHost
import io.github.zekurio.matinee.ui.player.Menu
import io.github.zekurio.matinee.ui.player.PictureSubtitles
import io.github.zekurio.matinee.ui.player.PlayerData
import io.github.zekurio.matinee.ui.player.PlayerNoticeNote
import io.github.zekurio.matinee.ui.player.Subtitles
import io.github.zekurio.matinee.ui.player.Video
import io.github.zekurio.matinee.ui.player.rememberPlayerController
import io.github.zekurio.matinee.ui.player.rememberSubtitleLook
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.delay

/**
 * The player on a TV: what the phone's player loads, drawn for a remote.
 * The video, its subtitles, and the controller are the phone's; the
 * controls, menus, and keys are the TV's own.
 */
@Composable
internal fun TvPlayerScreen(itemId: String, start: Double?, state: Load<PlayerData>, reload: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when (state) {
            Load.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center).size(56.dp), color = Palette.Accent)
            is Load.Failed -> TvPlayerFailure(stringResource(R.string.player_load_failed), state.message, reload)
            is Load.Ready -> when (val value = state.value) {
                PlayerData.Unplayable -> TvPlayerFailure(stringResource(R.string.player_error_lost), stringResource(R.string.player_unplayable), reload)
                else -> TvPlayback(itemId, value, start)
            }
        }
    }
}

/** Why nothing plays, with Try again focused and Back beside it. */
@Composable
private fun TvPlayerFailure(title: String, message: String?, retry: () -> Unit) {
    val host = LocalPlayerHost.current
    val again = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        withFrameNanos {}
        runCatching { again.requestFocus() }
    }
    Column(
        Modifier.fillMaxSize().padding(TvOverscan),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.headlineMedium.copy(fontSize = 30.sp, fontWeight = FontWeight.SemiBold), textAlign = TextAlign.Center)
        if (!message.isNullOrEmpty()) {
            Box(Modifier.height(8.dp))
            Text(
                message,
                style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp),
                color = Palette.Muted,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 560.dp),
            )
        }
        Box(Modifier.height(28.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            val pill = RoundedCornerShape(28.dp)
            TvButton(retry, Modifier.focusRequester(again), shape = pill, padding = PaddingValues(horizontal = 24.dp)) { tint ->
                Text(stringResource(R.string.common_retry), style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp), color = tint)
            }
            TvButton(host.close, shape = pill, padding = PaddingValues(horizontal = 24.dp)) { tint ->
                Text(stringResource(R.string.player_back), style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp), color = tint)
            }
        }
    }
}

/** Keys held across events: the arrow gliding the seek bar, and a key whose release the screen already answered. */
private class HeldKeys {
    var seeking: Key? = null
    var swallow: Key? = null
}

/**
 * Plays [data] for a remote.
 *
 * With the controls away, left and right skip and glide while held, Select,
 * up, and down bring the controls with focus on play, and the media keys
 * work at any time. With them showing, the D-pad moves focus. Back closes a
 * menu, then the controls, then the player. Every key press keeps the
 * controls up a while longer; a menu or a seek keeps them up.
 */
@Composable
private fun TvPlayback(itemId: String, data: PlayerData, start: Double?) {
    val app = LocalContext.current.app
    val prefs = app.player
    val preferences = LocalUser.current.playback ?: DEFAULT_PLAYBACK_PREFERENCES
    val host = LocalPlayerHost.current
    val controller = rememberPlayerController(itemId, data, start, tv = true)
    MatchDisplayMode(controller.item.probe?.video?.frameRate, enabled = prefs.matchFrameRate)

    // A TV has no picture in picture: leaving pauses.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, controller) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) controller.player.pause()
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    var controls by remember { mutableStateOf(true) }
    var menu by remember { mutableStateOf<Menu?>(null) }
    var openedFrom by remember { mutableStateOf<Menu?>(null) }
    var scrub by remember { mutableStateOf<Double?>(null) }
    var touched by remember { mutableIntStateOf(0) }
    // The controls came up for a held arrow, so focus goes to the seek bar.
    var focusSeek by remember { mutableStateOf(false) }
    var upNextShown by remember { mutableStateOf(false) }
    val visible = controls || controller.ended
    val targets = remember { TvTargets() }
    val root = remember { FocusRequester() }
    val held = remember { HeldKeys() }
    val keySeek = remember(controller) { KeySeek() }
    val back = preferences.skipBack.toDouble()
    val ahead = preferences.skipForward.toDouble()

    val a11y = LocalAccessibilityManager.current
    val hideAfter = remember(a11y) {
        a11y?.calculateRecommendedTimeoutMillis(HIDE_AFTER_MS, containsIcons = true, containsText = true, containsControls = true)
            ?: HIDE_AFTER_MS
    }
    LaunchedEffect(controls, controller.playing, menu, scrub, touched, hideAfter) {
        if (controls && controller.playing && menu == null && scrub == null) {
            delay(hideAfter)
            controls = false
        }
    }

    val seekKeys = remember(controller, keySeek, back, ahead) {
        TvSeekKeys(
            press = { direction, repeat, at ->
                val step = if (direction < 0) back else ahead
                keySeek.press(scrub ?: controller.position, direction, step, controller.duration, repeat, at)?.let { scrub = it }
            },
            release = {
                keySeek.release()?.let(controller::seekTo)
                scrub = null
            },
        )
    }

    // Focus follows the controls: on play, or the seek bar after a held
    // arrow, as they come; on the screen itself, which takes the keys, as they go.
    LaunchedEffect(visible) {
        if (!visible) {
            runCatching { root.requestFocus() }
            return@LaunchedEffect
        }
        withFrameNanos {}
        if (menu != null || upNextShown) return@LaunchedEffect
        val target = if (focusSeek) targets.seek else targets.play
        focusSeek = false
        runCatching { target.requestFocus() }
    }
    // A menu that closes gives focus back to its button.
    LaunchedEffect(menu) {
        val open = menu
        if (open != null) {
            openedFrom = open
            return@LaunchedEffect
        }
        val from = openedFrom ?: return@LaunchedEffect
        openedFrom = null
        withFrameNanos {}
        runCatching { targets.menus.getValue(from).requestFocus() }
    }

    fun openMenu(which: Menu) {
        controls = true
        menu = which
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(root)
            .onPreviewKeyEvent { event ->
                val key = event.key
                val down = event.type == KeyEventType.KeyDown
                if (down) touched++
                if (!down && held.swallow == key) {
                    held.swallow = null
                    return@onPreviewKeyEvent true
                }
                val media: (() -> Unit)? = when (key) {
                    Key.MediaPlayPause, Key.Spacebar -> controller::togglePlay
                    Key.MediaPlay -> controller.player::play
                    Key.MediaPause -> controller.player::pause
                    Key.MediaFastForward, Key.MediaSkipForward -> ({ controller.skip(ahead) })
                    Key.MediaRewind, Key.MediaSkipBackward -> ({ controller.skip(-back) })
                    Key.MediaNext -> controller.next?.let { next -> { host.playInstead(next.id) } }
                    Key.Captions -> ({ openMenu(Menu.Subtitles) })
                    Key.MediaAudioTrack -> ({ openMenu(Menu.Audio) })
                    else -> null
                }
                if (media != null) {
                    if (down) media()
                    return@onPreviewKeyEvent true
                }
                if (menu != null) return@onPreviewKeyEvent false
                val direction = when (key) {
                    Key.DirectionLeft -> -1
                    Key.DirectionRight -> 1
                    else -> 0
                }
                // Left and right skip while the controls are away, and glide
                // on while held, which brings the controls to show where to.
                if (direction != 0 && (held.seeking == key || !visible)) {
                    if (down) {
                        held.seeking = key
                        val repeat = event.nativeKeyEvent.repeatCount
                        seekKeys.press(direction, repeat, event.nativeKeyEvent.eventTime)
                        if (repeat > 0 && !controls) {
                            focusSeek = true
                            controls = true
                        }
                    } else if (event.type == KeyEventType.KeyUp) {
                        held.seeking = null
                        seekKeys.release()
                    }
                    return@onPreviewKeyEvent true
                }
                if (!visible && down) {
                    when (key) {
                        Key.DirectionCenter, Key.Enter, Key.NumPadEnter, Key.DirectionUp, Key.DirectionDown -> {
                            held.swallow = key
                            controls = true
                            return@onPreviewKeyEvent true
                        }
                        else -> Unit
                    }
                }
                false
            }
            .focusable(),
    ) {
        val fill = prefs.fillScreen
        Video(controller, fill = fill)
        PictureSubtitles(controller, fill = fill)
        PlayerNoticeNote(controller.notice, Modifier.align(Alignment.TopCenter).padding(TvOverscan))
        if (controller.loading && controller.error == null) {
            CircularProgressIndicator(Modifier.align(Alignment.Center).size(56.dp), color = Palette.Foreground)
        }
        // Back hides the controls before it leaves; a menu's Back, composed later, comes first.
        BackHandler(enabled = controls && menu == null) { controls = false }
        AnimatedVisibility(visible, enter = Motion.fadeIn, exit = Motion.fadeOut) {
            TvOverlay(controller, targets, back = back, ahead = ahead, scrub = scrub, keys = seekKeys, onMenu = ::openMenu)
        }
        // Over the scrim, so it doesn't dim them; they rise clear of the controls.
        Subtitles(
            controller,
            rememberSubtitleLook(prefs),
            lifted = visible,
            modifier = Modifier.align(Alignment.BottomCenter),
            raised = TV_OVERLAY_HEIGHT,
            rest = 40.dp,
        )
        controller.error?.let { message ->
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.85f))) {
                TvPlayerFailure(stringResource(R.string.player_error_lost), message, controller::retry)
            }
        }
        if (controller.ended) {
            TvUpNext(
                controller,
                autoplay = prefs.autoplayNext,
                menuOpen = menu != null,
                onShown = { upNextShown = it },
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 48.dp, bottom = TV_OVERLAY_HEIGHT + 8.dp),
            )
        }
        TvMenuPanel(menu, controller, prefs, onDismiss = { menu = null })
    }
}
