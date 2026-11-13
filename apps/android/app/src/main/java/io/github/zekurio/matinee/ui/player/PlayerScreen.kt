package io.github.zekurio.matinee.ui.player

import android.app.PictureInPictureParams
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.util.Rational
import android.view.WindowManager
import android.view.accessibility.AccessibilityManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemGestures
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.coerceAtMost
import androidx.compose.ui.unit.coerceIn
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.ui.compose.PlayerSurface
import androidx.media3.ui.compose.SURFACE_TYPE_SURFACE_VIEW
import androidx.media3.ui.compose.modifiers.resizeWithContentScale
import androidx.media3.ui.compose.state.rememberPresentationState
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.allowHardware
import coil3.toBitmap
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.DEFAULT_PLAYBACK_PREFERENCES
import io.github.zekurio.matinee.api.FALLBACK_PLAYBACK_OPTIONS
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.PLAYBACK_UNPLAYABLE
import io.github.zekurio.matinee.api.PlaybackDevice
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackStartInput
import io.github.zekurio.matinee.api.SubtitleDelivery
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.playbackDevice
import io.github.zekurio.matinee.api.skipBack
import io.github.zekurio.matinee.api.skipForward
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.downloads.OfflineItem
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.ControlShape
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.focusRing
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.formatClock
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.player.tv.TvPlayerScreen
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.languageName
import io.github.zekurio.matinee.ui.settings.qualityLabel
import io.github.zekurio.matinee.ui.theme.LocalTv
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.theme.Theming
import java.io.File
import java.io.IOException
import java.text.DateFormat
import java.util.Date
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** Everything the player needs before it starts. */
internal sealed interface PlayerData {
    /** A file from the server, with its first `playback.start` answer. */
    class Server(val opening: Opening.Server, val device: PlaybackDevice, val options: PlaybackOptions) : PlayerData

    /** A download, which plays instead of the server's file. */
    class Local(val item: MediaItem, val local: OfflineItem, val device: PlaybackDevice) : PlayerData

    /** The server found nothing this device plays. */
    data object Unplayable : PlayerData

    /** The server won't play the file for this account now, in [message]'s words. */
    class Refused(val refusal: Refusal, val message: String) : PlayerData
}

internal const val HIDE_AFTER_MS = 3500L
private const val UP_NEXT_SECONDS = 10

internal fun Context.activity(): ComponentActivity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is ComponentActivity) return current
        current = current.baseContext
    }
    return null
}

@Composable
fun PlayerScreen(itemId: String, start: Double?) {
    val app = LocalContext.current.app
    val downloads = app.downloads
    val prefs = app.player
    val offline = LocalOffline.current
    // Each time the player opens is a sitting of its own, which asks anew.
    val sitting = rememberSaveable { UUID.randomUUID().toString() }
    val data = rememberLoader<PlayerData>("player-$itemId-$sitting") {
        val device = withContext(Dispatchers.Default) { playbackDevice(prefs) }
        // A download plays from the phone. Online, the server says where the
        // person got to, which may be past what the download remembers.
        downloads.store.done(itemId)?.let { local ->
            val fresh = if (offline) null else try { media.get(itemId) } catch (_: IOException) { null }
            return@rememberLoader PlayerData.Local(fresh ?: local.item, local, device)
        }
        // The server says how the file plays: the source, the tracks, and
        // the next episode. The quality menu's ladder comes beside it.
        val sessionId = UUID.randomUUID().toString()
        val quality = prefs.quality
        coroutineScope {
            val options = async { try { playback.options() } catch (_: IOException) { FALLBACK_PLAYBACK_OPTIONS } }
            val input = PlaybackStartInput(itemId = itemId, sessionId = sessionId, device = device, quality = quality, position = start)
            val plan = try {
                playback.start(input)
            } catch (e: ApiException) {
                options.cancel()
                if (e.code == PLAYBACK_UNPLAYABLE) return@coroutineScope PlayerData.Unplayable
                val refusal = refusal(e) ?: throw e
                return@coroutineScope PlayerData.Refused(refusal, e.message)
            }
            PlayerData.Server(Opening.Server(plan, sessionId, quality), device, options.await())
        }
    }
    FullScreen()
    // A TV draws a player of its own, for a remote, from the same controller.
    if (LocalTv.current) {
        TvPlayerScreen(itemId, start, data.state, data::reload)
        return
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when (val state = data.state) {
            Load.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = Palette.Accent)
            is Load.Failed -> PlayerFailure(stringResource(R.string.player_load_failed), state.message, data::reload)
            is Load.Ready -> when (val value = state.value) {
                // What shows when nothing plays, as after the last source failed.
                PlayerData.Unplayable -> PlayerFailure(stringResource(R.string.player_error_lost), stringResource(R.string.player_unplayable), data::reload)
                // Asking again gets the same answer, so there's nothing to try.
                is PlayerData.Refused -> PlayerFailure(refusalTitle(value.refusal), value.message, null)
                else -> Playback(itemId, value, start)
            }
        }
    }
}

/**
 * What the player asks of the activity it plays in: to close, which the
 * system animates back to the app, turning the screen as it goes, and to
 * play the next episode in place of the one that ended.
 */
class PlayerHost(val close: () -> Unit, val playInstead: (String) -> Unit)

val LocalPlayerHost = staticCompositionLocalOf<PlayerHost> { error("no player host") }

/**
 * Without the system bars, and the screen kept on, while the player shows.
 * Its activity is in landscape already, as the manifest has it.
 */
@Composable
private fun FullScreen() {
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val activity = context.activity() ?: return@DisposableEffect onDispose {}
        val window = activity.window
        val insets = WindowCompat.getInsetsController(window, window.decorView)
        insets.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        insets.hide(WindowInsetsCompat.Type.systemBars())
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            insets.show(WindowInsetsCompat.Type.systemBars())
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

/** The heading over the server's words when it won't play the file for this account. */
@Composable
internal fun refusalTitle(refusal: Refusal) = stringResource(
    when (refusal) {
        Refusal.RESTRICTED -> R.string.player_restricted
        Refusal.BUSY -> R.string.player_busy
    },
)

@Composable
private fun PlayerFailure(title: String, message: String?, retry: (() -> Unit)?) {
    Column(Modifier.fillMaxSize().safeDrawingPadding()) {
        RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.player_back), LocalPlayerHost.current.close, Modifier.padding(8.dp), background = Color.Transparent)
        ErrorBox(title, message, retry, Modifier.weight(1f))
    }
}

private val PIP_ASPECT = Rational(16, 9)

/**
 * Shrinks the player into a small window now, and says whether it did. The
 * system can refuse, as when picture in picture is off for the app in its
 * settings.
 */
private fun ComponentActivity.enterPictureInPicture(): Boolean =
    runCatching { enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(PIP_ASPECT).build()) }.getOrDefault(false)

/**
 * Picture in picture follows the video: on while it plays, so leaving the
 * app keeps it on screen, unless settings turned it off.
 */
@Composable
private fun rememberPictureInPicture(controller: PlayerController, allowed: Boolean): Boolean {
    val context = LocalContext.current
    val activity = remember { context.activity() }
    var inPip by remember { mutableStateOf(activity?.isInPictureInPictureMode == true) }
    DisposableEffect(activity, allowed) {
        val listener = Consumer<PictureInPictureModeChangedInfo> { inPip = it.isInPictureInPictureMode }
        activity?.addOnPictureInPictureModeChangedListener(listener)
        val leave = Runnable {
            if (allowed && controller.playing && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                activity?.enterPictureInPicture()
            }
        }
        activity?.addOnUserLeaveHintListener(leave)
        onDispose {
            activity?.removeOnPictureInPictureModeChangedListener(listener)
            activity?.removeOnUserLeaveHintListener(leave)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                runCatching { activity?.setPictureInPictureParams(PictureInPictureParams.Builder().setAutoEnterEnabled(false).build()) }
            }
        }
    }
    val playing = controller.playing && allowed
    LaunchedEffect(playing) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching {
                activity?.setPictureInPictureParams(
                    PictureInPictureParams.Builder().setAspectRatio(PIP_ASPECT).setAutoEnterEnabled(playing).build(),
                )
            }
        }
    }
    return inPip
}

/**
 * The controller for [data], started while it shows and released after,
 * which the phone's player and the TV's both play with. A load again, as
 * when the viewer's marks change, keeps the player that plays.
 */
@Composable
internal fun rememberPlayerController(itemId: String, data: PlayerData, start: Double?, tv: Boolean = false): PlayerController {
    val context = LocalContext.current
    val app = context.app
    val api = LocalApi.current
    val user = LocalUser.current
    val prefs = app.player
    val preferences = user.playback ?: DEFAULT_PLAYBACK_PREFERENCES
    val controller = remember(itemId) {
        val (opening, device, options) = when (data) {
            is PlayerData.Server -> Triple(data.opening, data.device, data.options)
            is PlayerData.Local -> {
                val download = data.local
                val tracks = download.subtitles.map { it.track }
                val audio = downloadAudio(download.audio, preferences.audioLanguage, data.item.title?.originalLanguage)
                val opening = Opening.Local(
                    item = data.item,
                    file = app.downloads.store.file(download),
                    audio = download.audio,
                    subtitles = tracks,
                    saved = download.subtitles.associate { it.track.id to File(app.downloads.store.root, it.file) },
                    startAudio = audio,
                    startSubtitle = downloadSubtitle(tracks, audio?.language, preferences),
                    at = start ?: data.item.progress?.takeIf { !it.completed }?.positionSeconds ?: 0.0,
                )
                Triple(opening, data.device, FALLBACK_PLAYBACK_OPTIONS)
            }
            PlayerData.Unplayable, is PlayerData.Refused -> error("nothing to play")
        }
        PlayerController(
            context = context,
            api = api,
            http = app.session.http,
            opening = opening,
            options = options,
            device = device,
            prefs = prefs,
            pending = app.downloads.pending,
            serverHeaders = app.session.playerHeaders(),
            userAgent = app.session.userAgent,
            matchFrameRate = if (tv) prefs.matchFrameRate else null,
        )
    }
    DisposableEffect(controller) {
        controller.start()
        onDispose {
            controller.release()
            app.viewer.changed()
        }
    }
    return controller
}

@Composable
private fun Playback(itemId: String, data: PlayerData, start: Double?) {
    val context = LocalContext.current
    val app = context.app
    val user = LocalUser.current
    val prefs = app.player
    val preferences = user.playback ?: DEFAULT_PLAYBACK_PREFERENCES
    val controller = rememberPlayerController(itemId, data, start)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val inPip = rememberPictureInPicture(controller, allowed = prefs.pictureInPicture)
    val activity = remember(context) { context.activity() }
    // Some devices, like low-memory ones, have no picture in picture.
    val hasPip = remember(context) { context.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE) }
    val enterPip: (() -> Unit)? = if (hasPip && prefs.pictureInPicture && prefs.pictureInPictureButton && activity != null) {
        { activity.enterPictureInPicture() }
    } else {
        null
    }
    DisposableEffect(lifecycle, inPip) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP && !inPip) controller.player.pause()
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    var controls by remember { mutableStateOf(true) }
    // Locked, touches on the screen do nothing but show the way to unlock.
    var locked by remember { mutableStateOf(false) }
    // Counts touches while locked, so each shows the unlock button again.
    var lockTouched by remember { mutableIntStateOf(0) }
    var menu by remember { mutableStateOf<Menu?>(null) }
    var scrub by remember { mutableStateOf<Double?>(null) }
    var touched by remember { mutableIntStateOf(0) }
    val swipe = remember { GestureState() }
    val levels = rememberDeviceLevels()
    val gestureEdges = WindowInsets.systemGestures
    val layoutDirection = LocalLayoutDirection.current
    // The brightness the last swipe left, when settings keep it.
    LaunchedEffect(levels) {
        val saved = prefs.brightness
        if (prefs.swipeLevels && prefs.rememberBrightness && saved in 0f..1f) levels.setBrightness(saved)
    }
    // A screen reader exploring by touch reads the controls one by one, so
    // they stay until asked away; otherwise they wait as long as the
    // person's accessibility settings ask.
    val exploring = rememberTouchExploration()
    val a11y = LocalAccessibilityManager.current
    val hideAfter = remember(a11y) {
        a11y?.calculateRecommendedTimeoutMillis(HIDE_AFTER_MS, containsIcons = true, containsText = true, containsControls = true)
            ?: HIDE_AFTER_MS
    }
    LaunchedEffect(controls, controller.playing, menu, scrub, touched, exploring, hideAfter, swipe.kind) {
        if (controls && controller.playing && menu == null && scrub == null && !exploring && swipe.kind == null) {
            delay(hideAfter)
            controls = false
        }
    }
    val back = preferences.skipBack.toDouble()
    val ahead = preferences.skipForward.toDouble()
    var fill by remember { mutableStateOf(prefs.fillScreen) }
    // Counts pinches that switched, so the note shows again for each.
    var zoomNote by remember { mutableIntStateOf(0) }

    // Remotes, keyboards, and headsets: play and pause, and skip with left
    // and right while the controls are away. With them showing, the D-pad
    // moves between them.
    val keys = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { keys.requestFocus() } }
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(keys)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                touched++
                val action: (() -> Unit)? = when (event.key) {
                    Key.MediaPlayPause, Key.Spacebar -> controller::togglePlay
                    Key.MediaPlay -> controller.player::play
                    Key.MediaPause -> controller.player::pause
                    Key.MediaFastForward -> ({ controller.skip(ahead) })
                    Key.MediaRewind -> ({ controller.skip(-back) })
                    // Locked, media keys still work, and the ones that would
                    // bring up the controls show the unlock button instead.
                    in NAVIGATION_KEYS if locked -> ({ lockTouched++ })
                    Key.DirectionLeft -> if (controls) null else ({ controller.skip(-back) })
                    Key.DirectionRight -> if (controls) null else ({ controller.skip(ahead) })
                    Key.DirectionCenter, Key.Enter, Key.DirectionUp, Key.DirectionDown ->
                        if (controls) null else ({ controls = true })
                    else -> null
                }
                action?.invoke()
                action != null
            }
            .focusable(),
    ) {
        Video(controller, fill = fill && !inPip)
        PictureSubtitles(controller, fill = fill && !inPip)
        Subtitles(controller, rememberSubtitleLook(prefs), lifted = controls && !inPip, Modifier.align(Alignment.BottomCenter))
        // Taps show and hide the controls; a double tap on either side skips;
        // spreading two fingers fills the screen, and pinching shows it whole.
        // Swipes set the brightness, the volume, and the time, and a held
        // finger plays faster (VideoGestures.kt). They come last, so they see
        // each touch before the taps do and keep a swipe or a hold from
        // counting as one.
        // A screen reader gets the tap as this area's one action.
        val videoLabel = stringResource(R.string.a11y_player_video)
        val toggleLabel = stringResource(if (controls) R.string.a11y_player_hide_controls else R.string.a11y_player_show_controls)
        Box(
            Modifier.fillMaxSize().semantics {
                contentDescription = videoLabel
                onClick(toggleLabel) {
                    controls = !controls
                    touched++
                    true
                }
            }.pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    var zoom = 1f
                    var switched = false
                    do {
                        val event = awaitPointerEvent()
                        if (event.changes.count { it.pressed } >= 2) {
                            zoom *= event.calculateZoom()
                            val want = when {
                                zoom > PINCH_FILL -> true
                                zoom < 1 / PINCH_FILL -> false
                                else -> null
                            }
                            if (!switched && want != null && want != fill) {
                                switched = true
                                fill = want
                                prefs.fillScreen = want
                                zoomNote++
                            }
                            event.changes.forEach { it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                }
            }.pointerInput(controller, back, ahead) {
                detectTapGestures(
                    onTap = {
                        controls = !controls
                        touched++
                    },
                    onDoubleTap = { offset ->
                        controller.skip(if (offset.x < size.width / 2) -back else ahead)
                        touched++
                    },
                )
            }.videoGestures(
                swipe,
                controller,
                prefs,
                levels,
                gestureEdges,
                layoutDirection,
                allowed = { controller.error == null && menu == null && !locked },
                onStart = { kind ->
                    // A seek's note sits where the play button is.
                    if (kind == GestureKind.SEEK) controls = false
                    touched++
                },
            ),
        )
        if (!inPip) GestureNotes(swipe, controller)
        // Up top, clear of the play button in the middle.
        ZoomNote(zoomNote, fill, Modifier.align(Alignment.TopCenter).safeDrawingPadding().padding(top = 16.dp))
        PlayerNoticeNote(controller.notice, Modifier.align(Alignment.TopCenter).safeDrawingPadding().padding(top = 16.dp, start = 24.dp, end = 24.dp))
        if (controller.loading && controller.error == null) {
            CircularProgressIndicator(Modifier.align(Alignment.Center).size(48.dp), color = Palette.Foreground)
        }
        if (!inPip) {
            // An error has the screen to itself, with a back button of its own.
            AnimatedVisibility((controls || controller.ended) && !locked && controller.error == null, enter = Motion.fadeIn, exit = Motion.fadeOut) {
                Controls(
                    controller,
                    prefs,
                    back = back,
                    ahead = ahead,
                    scrub = scrub,
                    onScrub = {
                        scrub = it
                        touched++
                    },
                    onScrubEnd = {
                        scrub?.let(controller::seekTo)
                        scrub = null
                    },
                    onSeek = {
                        controller.seekTo(it)
                        touched++
                    },
                    onMenu = { menu = it },
                    onTouch = { touched++ },
                    onPictureInPicture = enterPip,
                    onLock = if (prefs.lockButton) {
                        {
                            locked = true
                            controls = false
                        }
                    } else {
                        null
                    },
                )
            }
            controller.error?.let { message ->
                // It takes the taps too, so none reaches the video under it.
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.8f)).pointerInput(Unit) { detectTapGestures() }) {
                    when (val refusal = controller.refusal) {
                        null -> PlayerFailure(stringResource(R.string.player_error_lost), message, controller::retry)
                        else -> PlayerFailure(refusalTitle(refusal), message, null)
                    }
                }
            }
            if (controller.ended) UpNext(controller, autoplay = prefs.autoplayNext, Modifier.align(Alignment.BottomEnd))
            // Over everything else, so no touch reaches what's under it. It
            // steps aside while an error shows, so its buttons stay in reach.
            if (locked && controller.error == null) {
                LockedScreen(
                    lockTouched,
                    hideAfter = hideAfter,
                    keep = exploring,
                    onTouch = { lockTouched++ },
                    onUnlock = {
                        locked = false
                        controls = true
                        touched++
                    },
                )
            }
        }
        PlayerPanel(menu, controller, onDismiss = { menu = null })
    }
}

internal enum class Menu { Audio, Subtitles, Settings }

/** The keys that skip or bring up the controls, which a locked player keeps from doing either. */
private val NAVIGATION_KEYS = setOf(Key.DirectionLeft, Key.DirectionRight, Key.DirectionCenter, Key.Enter, Key.DirectionUp, Key.DirectionDown)

/** Whether a screen reader explores the screen by touch, as TalkBack does. */
@Composable
private fun rememberTouchExploration(): Boolean {
    val context = LocalContext.current
    val manager = remember(context) { context.getSystemService(AccessibilityManager::class.java) }
    var exploring by remember(manager) { mutableStateOf(manager?.isTouchExplorationEnabled == true) }
    DisposableEffect(manager) {
        val listener = AccessibilityManager.TouchExplorationStateChangeListener { exploring = it }
        manager?.addTouchExplorationStateChangeListener(listener)
        onDispose { manager?.removeTouchExplorationStateChangeListener(listener) }
    }
    return exploring
}

/** How far two fingers spread, or pinch by its inverse, before the video switches. */
private const val PINCH_FILL = 1.15f

/** Says how the video now shows, for a moment after a pinch switched it. */
@Composable
private fun ZoomNote(count: Int, fill: Boolean, modifier: Modifier) {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(count) {
        if (count == 0) return@LaunchedEffect
        shown = true
        delay(1_200)
        shown = false
    }
    AnimatedVisibility(shown, modifier, enter = Motion.fadeIn, exit = Motion.fadeOut) {
        Text(
            stringResource(if (fill) R.string.player_fill else R.string.player_fit),
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
            modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 18.dp, vertical = 10.dp),
        )
    }
}

/** How long a note about the last answer stays. */
private const val NOTICE_MS = 5_000L

/** Says what the server did instead of what the viewer asked for, for a few seconds. */
@Composable
internal fun PlayerNoticeNote(notice: Notice?, modifier: Modifier) {
    var shown by remember { mutableStateOf<Notice?>(null) }
    LaunchedEffect(notice) {
        if (notice == null) return@LaunchedEffect
        shown = notice
        delay(NOTICE_MS)
        shown = null
    }
    val current = shown
    AnimatedVisibility(current != null, modifier, enter = Motion.fadeIn, exit = Motion.fadeOut) {
        // The last one stays drawn while it fades.
        var last by remember { mutableStateOf(current) }
        if (current != null) last = current
        val note = last ?: return@AnimatedVisibility
        val title = stringResource(
            when (note.kind) {
                NoticeKind.BURN_IN_FAILED -> R.string.player_notice_burn_in_failed
                NoticeKind.QUALITY_FAILED, NoticeKind.SWITCH_FAILED -> R.string.player_notice_switch_failed
            },
        )
        val detail = when (note.kind) {
            NoticeKind.BURN_IN_FAILED -> stringResource(R.string.player_notice_burn_in_failed_detail)
            NoticeKind.QUALITY_FAILED -> stringResource(R.string.player_notice_quality_failed_detail)
            NoticeKind.SWITCH_FAILED -> note.detail
        }
        Column(
            Modifier.widthIn(max = 420.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.75f))
                .padding(horizontal = 18.dp, vertical = 10.dp)
                .semantics(mergeDescendants = true) {},
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = Color.White, textAlign = TextAlign.Center)
            if (!detail.isNullOrEmpty()) {
                Text(detail, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.8f), textAlign = TextAlign.Center)
            }
        }
    }
}

/** The video, whole or filling the screen and cut at its edges. */
@Composable
internal fun Video(controller: PlayerController, fill: Boolean) {
    if (controller.usesMpv) {
        // mpv fits or fills the video in a surface the size of the screen, its subtitles with it.
        LaunchedEffect(fill) { controller.showFilled(fill) }
        PlayerSurface(player = controller.player, modifier = Modifier.fillMaxSize(), surfaceType = SURFACE_TYPE_SURFACE_VIEW)
        return
    }
    val presentation = rememberPresentationState(controller.player)
    Box(Modifier.fillMaxSize().clipToBounds(), contentAlignment = Alignment.Center) {
        PlayerSurface(
            player = controller.player,
            modifier = Modifier.resizeWithContentScale(if (fill) ContentScale.Crop else ContentScale.Fit, presentation.videoSizeDp),
            surfaceType = SURFACE_TYPE_SURFACE_VIEW,
        )
        if (presentation.coverSurface) Box(Modifier.fillMaxSize().background(Color.Black))
    }
}

/**
 * A picture track's subtitles, as ExoPlayer decodes them from the file:
 * images placed on the video where the track puts them, whole or zoomed
 * as the video shows.
 */
@Composable
internal fun PictureSubtitles(controller: PlayerController, fill: Boolean) {
    val cues = controller.pictureCues
    if (cues.isEmpty()) return
    val aspect = controller.videoAspect
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val box = maxWidth / maxHeight
        // The video's rectangle on screen: fitted, or covering when it fills.
        val wide = if (fill) aspect < box else aspect > box
        val width = if (wide) maxWidth else maxHeight * aspect
        val height = if (wide) maxWidth / aspect else maxHeight
        val left = (maxWidth - width) / 2
        val top = (maxHeight - height) / 2
        cues.forEach { cue ->
            val bitmap = cue.bitmap ?: return@forEach
            val w = if (cue.size != androidx.media3.common.text.Cue.DIMEN_UNSET) width * cue.size else width * (bitmap.width.toFloat() / bitmap.height)
            val h = if (cue.bitmapHeight != androidx.media3.common.text.Cue.DIMEN_UNSET) height * cue.bitmapHeight else w * (bitmap.height.toFloat() / bitmap.width)
            val x = left + width * cue.position.takeIf { it != androidx.media3.common.text.Cue.DIMEN_UNSET }.orZero() - w * anchor(cue.positionAnchor)
            val y = top + height * cue.line.takeIf { it != androidx.media3.common.text.Cue.DIMEN_UNSET }.orZero() - h * anchor(cue.lineAnchor)
            Image(
                bitmap.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.offset(x, y).size(w, h),
            )
        }
    }
}

private fun Float?.orZero() = this ?: 0f

/** How far along an image its anchor sits: its start, middle, or end. */
private fun anchor(type: Int): Float = when (type) {
    androidx.media3.common.text.Cue.ANCHOR_TYPE_MIDDLE -> 0.5f
    androidx.media3.common.text.Cue.ANCHOR_TYPE_END -> 1f
    else -> 0f
}

/** The cues showing now, drawn over the video, [raised] above the controls while they show. */
@Composable
internal fun Subtitles(controller: PlayerController, look: SubtitleLook, lifted: Boolean, modifier: Modifier, raised: Dp = 150.dp, rest: Dp = 28.dp) {
    // Moves with the controls rather than jumping when they come and go.
    val bottom by animateDpAsState(if (lifted) raised else rest, Motion.move(), label = "subtitle lift")
    val cues = controller.cues ?: return
    val shown = cues.at(controller.position)
    if (shown.isEmpty()) return
    Column(
        modifier.fillMaxWidth().padding(horizontal = 48.dp).padding(bottom = bottom),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        shown.forEach { cue -> SubtitleLine(cue.text, look) }
    }
}

@Composable
private fun Controls(
    controller: PlayerController,
    prefs: PlayerPrefs,
    back: Double,
    ahead: Double,
    scrub: Double?,
    onScrub: (Double) -> Unit,
    onScrubEnd: () -> Unit,
    onSeek: (Double) -> Unit,
    onMenu: (Menu) -> Unit,
    onTouch: () -> Unit,
    onPictureInPicture: (() -> Unit)?,
    onLock: (() -> Unit)?,
) {
    val res = LocalResources.current
    val item = controller.item
    val label = itemLabel(item, res)
    val code = label.code
    Box(Modifier.fillMaxSize()) {
        // Shade the top and bottom so the controls read over bright video.
        Box(
            Modifier.fillMaxWidth().height(160.dp).align(Alignment.TopCenter)
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.75f), Color.Transparent))),
        )
        Box(
            Modifier.fillMaxWidth().height(220.dp).align(Alignment.BottomCenter)
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f)))),
        )
        Row(
            Modifier.align(Alignment.TopStart).fillMaxWidth().safeDrawingPadding().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.player_back), LocalPlayerHost.current.close, size = 52.dp, iconSize = 26.dp, background = Color.Transparent)
            Gap(8.dp)
            Column(Modifier.weight(1f)) {
                Text(label.title, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (code != null) {
                    Text("$code · ${label.showName}", style = MaterialTheme.typography.bodyMedium, color = Palette.Foreground.copy(alpha = 0.75f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Gap(8.dp)
            if (onPictureInPicture != null) {
                RoundIconButton(Lucide.PictureInPicture, stringResource(R.string.player_pip), onPictureInPicture, size = 52.dp, iconSize = 26.dp, background = Color.Transparent)
            }
            // The unlock button shows where this one is.
            if (onLock != null) {
                RoundIconButton(Lucide.Lock, stringResource(R.string.player_lock), onLock, size = 52.dp, iconSize = 26.dp, background = Color.Transparent)
            }
        }
        Row(
            Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (prefs.skipButtons) {
                SkipButton(Lucide.RotateCcw, back, stringResource(R.string.player_skip_back, back.toInt())) {
                    controller.skip(-back)
                    onTouch()
                }
            }
            // The loading spinner is drawn at the screen's center, even when
            // controls are hidden. Keep its slot without an overlapping button.
            Box(Modifier.size(96.dp), contentAlignment = Alignment.Center) {
                if (!controller.loading) {
                    RoundIconButton(
                        if (controller.playing) Lucide.Pause else Lucide.Play,
                        stringResource(if (controller.playing) R.string.player_pause else R.string.player_play),
                        {
                            controller.togglePlay()
                            onTouch()
                        },
                        // Bare, like the skip buttons beside it, and a little bigger
                        // than them to lead without a circle.
                        size = 96.dp,
                        iconSize = 48.dp,
                        background = Color.Transparent,
                    )
                }
            }
            if (prefs.skipButtons) {
                SkipButton(Lucide.RotateCw, ahead, stringResource(R.string.player_skip_forward, ahead.toInt())) {
                    controller.skip(ahead)
                    onTouch()
                }
            }
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().safeDrawingPadding().padding(horizontal = 20.dp, vertical = 10.dp)) {
            SeekBar(controller, scrub, back, ahead, onScrub, onScrubEnd, onSeek)
            Row(verticalAlignment = Alignment.CenterVertically) {
                val duration = controller.duration
                if (duration > 0) {
                    val ends = remember(controller.position.toInt() / 30, duration, controller.speed) {
                        val left = (duration - controller.position) / controller.speed
                        DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(System.currentTimeMillis() + (left * 1000).toLong()))
                    }
                    Text(stringResource(R.string.player_ends_at, ends), style = MaterialTheme.typography.bodyMedium, color = Palette.Foreground.copy(alpha = 0.8f))
                }
                Box(Modifier.weight(1f))
                if (prefs.audioButton) {
                    RoundIconButton(Lucide.AudioLines, stringResource(R.string.player_menu_audio), { onMenu(Menu.Audio) }, size = 52.dp, iconSize = 26.dp, background = Color.Transparent)
                }
                if (prefs.subtitlesButton) SubtitlesButton(controller, onMenu)
                RoundIconButton(Lucide.Settings, stringResource(R.string.player_menu_settings), { onMenu(Menu.Settings) }, size = 52.dp, iconSize = 26.dp, background = Color.Transparent)
            }
        }
    }
}

/** Opens the subtitles menu, with a line under it while subtitles are on. */
@Composable
private fun SubtitlesButton(controller: PlayerController, onMenu: (Menu) -> Unit) {
    Box {
        // The line under the icon shows subtitles are on; a screen reader hears which.
        val subtitleState = controller.subtitle?.let { subtitleLabel(it, controller.subtitles) }
            ?: stringResource(R.string.player_subtitles_off)
        RoundIconButton(
            Lucide.Captions,
            stringResource(R.string.player_menu_subtitles),
            { onMenu(Menu.Subtitles) },
            Modifier.semantics { stateDescription = subtitleState },
            size = 52.dp,
            iconSize = 26.dp,
            background = Color.Transparent,
        )
        if (controller.subtitle != null) {
            Box(Modifier.align(Alignment.BottomCenter).offset(y = (-8).dp).width(20.dp).height(2.dp).clip(CircleShape).background(Palette.Accent))
        }
    }
}

/**
 * Covers the player while it's locked and takes every touch, so none
 * reaches the controls or the gestures under it. A touch shows the unlock
 * button, up where the lock button was, for [hideAfter] ms; with [keep], as
 * while a screen reader explores by touch, it stays. [touches] counts the
 * touches, and each change shows it again.
 */
@Composable
private fun LockedScreen(touches: Int, hideAfter: Long, keep: Boolean, onTouch: () -> Unit, onUnlock: () -> Unit) {
    var shown by remember { mutableStateOf(true) }
    LaunchedEffect(touches, keep, hideAfter) {
        shown = true
        if (keep) return@LaunchedEffect
        delay(hideAfter)
        shown = false
    }
    val currentTouch by rememberUpdatedState(onTouch)
    Box(
        Modifier.fillMaxSize().pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false)
                currentTouch()
                // The unlock button hears its tap first; this keeps the rest.
                do {
                    val event = awaitPointerEvent()
                    event.changes.forEach { it.consume() }
                } while (event.changes.any { it.pressed })
            }
        },
    ) {
        AnimatedVisibility(
            shown,
            Modifier.align(Alignment.TopEnd).safeDrawingPadding().padding(horizontal = 12.dp, vertical = 8.dp),
            enter = Motion.fadeIn,
            exit = Motion.fadeOut,
        ) {
            // Shaded like the notes over the video, so it reads over a bright scene.
            MatineeButton(
                onUnlock,
                Modifier.clip(ControlShape).background(Color.Black.copy(alpha = 0.6f)),
                look = ButtonLook.Frosted,
                height = 52.dp,
            ) {
                LucideIcon(Lucide.LockOpen, null, size = 22.dp)
                Text(stringResource(R.string.player_unlock))
            }
        }
    }
}

/** Skips back or forward, with how far in the middle of its arrow. */
@Composable
private fun SkipButton(icon: Int, seconds: Double, label: String, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier.size(72.dp).clip(CircleShape).focusRing(interaction, CircleShape)
            .clickable(interaction, indication = ripple(), role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        LucideIcon(icon, label, size = 40.dp)
        // The label says how far already.
        Text(
            seconds.toInt().toString(),
            style = MaterialTheme.typography.labelMedium.copy(fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
            modifier = Modifier.padding(top = 2.dp).clearAndSetSemantics {},
        )
    }
}

@Composable
private fun SeekBar(
    controller: PlayerController,
    scrub: Double?,
    back: Double,
    ahead: Double,
    onScrub: (Double) -> Unit,
    onScrubEnd: () -> Unit,
    onSeek: (Double) -> Unit,
) {
    val duration = controller.duration.coerceAtLeast(0.0)
    val shown = scrub ?: controller.position
    Column {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val trickplay = controller.trickplay
            if (scrub != null && trickplay != null && duration > 0) {
                val fraction = (scrub / duration).toFloat().coerceIn(0f, 1f)
                val width = 176.dp
                val x = (maxWidth * fraction - width / 2).coerceIn(0.dp, maxWidth - width)
                TrickplayPreview(controller, scrub, Modifier.offset(x = x).width(width))
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(formatClock(shown), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.widthIn(min = 56.dp))
            SeekTrack(
                position = shown,
                duration = duration,
                buffered = controller.buffered,
                back = back,
                ahead = ahead,
                scrubbing = scrub != null,
                onScrub = onScrub,
                onScrubEnd = onScrubEnd,
                onSeek = onSeek,
                modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
            )
            val remaining = formatClock((duration - shown).coerceAtLeast(0.0))
            val remainingLabel = stringResource(R.string.a11y_player_remaining, remaining)
            Text(
                "-$remaining",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.End,
                modifier = Modifier.widthIn(min = 64.dp).semantics { contentDescription = remainingLabel },
            )
        }
    }
}

/**
 * The seek bar as the web player draws it: a thin line, what's buffered in
 * a lighter shade, what's played in the accent, and a dot to drag.
 *
 * A finger taps or drags it, scrubbing until it lifts. A remote or keyboard
 * focuses it and scrubs by [back] with left and [ahead] with right, seeking
 * when the key comes up. A screen reader hears it as a seek bar it can set,
 * and its swipes move it by about [ahead], seeking at once through [onSeek].
 */
@Composable
private fun SeekTrack(
    position: Double,
    duration: Double,
    buffered: Double,
    back: Double,
    ahead: Double,
    scrubbing: Boolean,
    onScrub: (Double) -> Unit,
    onScrubEnd: () -> Unit,
    onSeek: (Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    val enabled = seekable(duration)
    // Gestures and keys outlive a composition, so they read these as they are now.
    val length by rememberUpdatedState(duration)
    val now by rememberUpdatedState(position)
    val scrubTo by rememberUpdatedState(onScrub)
    val scrubEnd by rememberUpdatedState(onScrubEnd)
    // Where held arrow keys got to, so each repeat steps on from there
    // before a recomposition catches up.
    var keyed by remember { mutableStateOf<Double?>(null) }
    fun endKeys() {
        if (keyed == null) return
        keyed = null
        scrubEnd()
    }
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    // The dot grows under the finger, and while focused.
    val thumb by animateDpAsState(if (scrubbing || focused) 11.dp else 8.dp, Motion.color(), label = "seek thumb")
    val label = stringResource(R.string.a11y_player_seek)
    val action = stringResource(R.string.a11y_player_seek_action)
    val state = if (enabled) {
        stringResource(R.string.a11y_player_position, formatClock(position), formatClock(duration))
    } else {
        formatClock(position)
    }
    Box(
        modifier
            .height(48.dp)
            .semantics {
                contentDescription = label
                stateDescription = state
                progressBarRangeInfo = if (enabled) {
                    ProgressBarRangeInfo(seekClamp(position, duration).toFloat(), 0f..duration.toFloat(), seekSteps(duration, ahead))
                } else {
                    ProgressBarRangeInfo(0f, 0f..1f)
                }
                setProgress(action) { target ->
                    if (!seekable(length)) return@setProgress false
                    onSeek(seekClamp(target.toDouble(), length))
                    true
                }
                if (!enabled) disabled()
            }
            .onFocusChanged { if (!it.isFocused) endKeys() }
            .onKeyEvent { event ->
                val direction = when (event.key) {
                    Key.DirectionLeft -> -1
                    Key.DirectionRight -> 1
                    else -> return@onKeyEvent false
                }
                if (!seekable(length)) return@onKeyEvent false
                when (event.type) {
                    KeyEventType.KeyDown -> {
                        val to = seekStepped(keyed ?: now, direction, if (direction < 0) back else ahead, length)
                        keyed = to
                        scrubTo(to)
                        true
                    }
                    KeyEventType.KeyUp -> {
                        endKeys()
                        true
                    }
                    else -> false
                }
            }
            .focusRing(interaction, RoundedCornerShape(8.dp))
            .focusable(enabled, interaction)
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectTapGestures { offset ->
                    scrubTo(seekAt(offset.x, size.width.toFloat(), length))
                    scrubEnd()
                }
            }
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectHorizontalDragGestures(
                    onDragStart = { offset -> scrubTo(seekAt(offset.x, size.width.toFloat(), length)) },
                    onDragEnd = { scrubEnd() },
                    onDragCancel = { scrubEnd() },
                ) { change, _ -> scrubTo(seekAt(change.position.x, size.width.toFloat(), length)) }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        val fraction = seekFraction(position, duration)
        val loaded = seekFraction(buffered, duration)
        Canvas(Modifier.fillMaxWidth().height(24.dp)) {
            val y = size.height / 2
            val stroke = 5.dp.toPx()
            val played = size.width * fraction
            fun line(to: Float, color: Color) = drawLine(color, Offset(0f, y), Offset(to, y), stroke, StrokeCap.Round)
            line(size.width, Palette.Foreground.copy(alpha = 0.2f))
            line(size.width * loaded, Palette.Foreground.copy(alpha = 0.35f))
            line(played, Palette.Accent)
            drawCircle(Palette.Accent, radius = thumb.toPx(), center = Offset(played, y))
        }
    }
}

/** The frame at the scrubbed time, cut from the server's trickplay tiles. */
@Composable
private fun TrickplayPreview(controller: PlayerController, seconds: Double, modifier: Modifier) {
    val images = controller.trickplay ?: return
    val density = LocalDensity.current
    Column(modifier.padding(bottom = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        TrickplayFrame(
            controller,
            seconds,
            Modifier.fillMaxWidth().height(with(density) { 176.dp * images.height / images.width })
                .clip(RoundedCornerShape(6.dp)).background(Color.Black).border(1.dp, Palette.Foreground.copy(alpha = 0.3f), RoundedCornerShape(6.dp)),
        )
        Gap(4.dp)
        Text(formatClock(seconds), style = MaterialTheme.typography.labelMedium)
    }
}

/** The trickplay frame at [seconds], drawn to fill [modifier]'s box; the box shows while its tile loads. */
@Composable
internal fun TrickplayFrame(controller: PlayerController, seconds: Double, modifier: Modifier) {
    val images = controller.trickplay ?: return
    val api = LocalApi.current
    val context = LocalContext.current
    val perTile = images.columns * images.rows
    val index = (seconds / images.intervalSeconds).toInt().coerceIn(0, images.count - 1)
    val tile = index / perTile
    val cell = index % perTile
    val bitmap by produceState<ImageBitmap?>(null, tile, images.key) {
        val request = ImageRequest.Builder(context)
            .data(api.paths.trickplayTile(controller.item.id, images.key, tile))
            .allowHardware(false)
            .build()
        value = SingletonImageLoader.get(context).execute(request).image?.toBitmap()?.asImageBitmap()
    }
    Box(modifier) {
        val image = bitmap
        if (image != null) {
            Canvas(Modifier.fillMaxSize()) {
                drawImage(
                    image,
                    srcOffset = IntOffset((cell % images.columns) * images.width, (cell / images.columns) * images.height),
                    srcSize = IntSize(images.width, images.height),
                    dstSize = IntSize(size.width.toInt(), size.height.toInt()),
                )
            }
        }
    }
}

/** The next episode once one ended, and how far its countdown got. */
@Stable
internal class UpNextState(val item: MediaItem, autoplay: Boolean) {
    /** Seconds until it starts by itself. */
    var left by mutableIntStateOf(UP_NEXT_SECONDS)

    /** The countdown stopped, or never ran, so it waits for Play. */
    var cancelled by mutableStateOf(!autoplay)
}

/**
 * The episode after the one that ended, counting down to it and starting
 * it unless cancelled, or null when there's none. A file the server plays
 * has it in the answer; a download asks.
 */
@Composable
internal fun rememberUpNext(controller: PlayerController, autoplay: Boolean): UpNextState? {
    val host = LocalPlayerHost.current
    val upcoming = (if (controller.isLocal) downloadNext(controller.item) else controller.next) ?: return null
    val state = remember(upcoming.id) { UpNextState(upcoming, autoplay) }
    LaunchedEffect(upcoming.id, state.cancelled) {
        while (!state.cancelled && state.left > 0) {
            delay(1000)
            state.left--
        }
        if (!state.cancelled) host.playInstead(upcoming.id)
    }
    return state
}

/**
 * The next episode when one ended, starting by itself after a countdown,
 * or waiting for Play when settings turned [autoplay] off.
 */
@Composable
private fun UpNext(controller: PlayerController, autoplay: Boolean, modifier: Modifier) {
    val host = LocalPlayerHost.current
    val res = LocalResources.current
    val next = rememberUpNext(controller, autoplay) ?: return
    val upcoming = next.item
    val left = next.left
    val cancelled = next.cancelled
    val label = itemLabel(upcoming, res)
    Column(
        modifier.safeDrawingPadding().padding(24.dp).widthIn(max = 360.dp)
            .clip(RoundedCornerShape(12.dp)).background(Palette.Raised.copy(alpha = 0.95f)).padding(16.dp),
    ) {
        Text(stringResource(R.string.player_up_next), style = MaterialTheme.typography.labelLarge, color = Palette.Muted)
        Gap(4.dp)
        val code = episodeCode(upcoming, res)
        Text(
            if (code != null) stringResource(R.string.media_code_title, code, label.title) else label.title,
            style = MaterialTheme.typography.titleMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Gap(12.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MatineeButton(onClick = { host.playInstead(upcoming.id) }, height = 40.dp) {
                LucideIcon(Lucide.Play, null, size = 14.dp)
                Text(if (cancelled) stringResource(R.string.player_play) else stringResource(R.string.player_up_next_in, left))
            }
            if (!cancelled) {
                MatineeButton(onClick = { next.cancelled = true }, look = ButtonLook.Frosted, height = 40.dp) {
                    Text(stringResource(R.string.player_up_next_cancel))
                }
            }
        }
    }
}

/**
 * The episode after a download's, from the server when it answers. A file
 * the server plays has it in the answer from `playback.start`.
 */
@Composable
private fun downloadNext(item: MediaItem): MediaItem? {
    val api = LocalApi.current
    val title = item.title
    val next by produceState<MediaItem?>(null, item.id) {
        if (title?.kind != TitleKind.SHOW) return@produceState
        value = try {
            val all = api.titleItems(title.id)
            // Not in the list, as a file just removed, has no next.
            val index = all.indexOfFirst { it.id == item.id }
            if (index < 0) null else all.getOrNull(index + 1)
        } catch (_: IOException) {
            null
        }
    }
    return next
}

/**
 * A menu's panel at the side, drawn in the player's own window. A sheet
 * would be a window of its own, which brings the system bars back and moves
 * everything laid out around them.
 */
@Composable
private fun PlayerPanel(open: Menu?, controller: PlayerController, onDismiss: () -> Unit) {
    // The menu that was open stays drawn while the panel slides away.
    var last by remember { mutableStateOf(open) }
    if (open != null) last = open
    BackHandler(enabled = open != null, onBack = onDismiss)
    // A remote or keyboard has nothing to point with, so focus goes into the
    // panel, to what's picked, once its rows are laid out.
    val inputs = LocalInputModeManager.current
    val picked = remember { FocusRequester() }
    LaunchedEffect(open) {
        if (open == null || inputs.inputMode != InputMode.Keyboard) return@LaunchedEffect
        withFrameNanos {}
        runCatching { picked.requestFocus() }
    }
    val closeLabel = stringResource(R.string.a11y_player_close_menu)
    BoxWithConstraints(Modifier.fillMaxSize()) {
        AnimatedVisibility(open != null, enter = Motion.fadeIn, exit = Motion.fadeOut) {
            Box(
                Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)).semantics {
                    contentDescription = closeLabel
                    role = Role.Button
                    onClick {
                        onDismiss()
                        true
                    }
                }.pointerInput(Unit) {
                    detectTapGestures { onDismiss() }
                },
            )
        }
        val width = (maxWidth * 0.42f).coerceIn(300.dp, 420.dp).coerceAtMost(maxWidth)
        AnimatedVisibility(
            open != null,
            modifier = Modifier.align(Alignment.CenterEnd),
            enter = slideInHorizontally(Motion.slide()) { it } + Motion.fadeIn,
            exit = slideOutHorizontally(Motion.slide()) { it } + Motion.fadeOut,
        ) {
            val menu = last ?: return@AnimatedVisibility
            val entries = menuEntries(menu, controller)
            LazyColumn(
                Modifier
                    .fillMaxHeight()
                    .width(width)
                    .clip(RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp))
                    .background(Palette.Raised)
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.End + WindowInsetsSides.Vertical))
                    .padding(vertical = 12.dp),
            ) {
                items(entries, key = { it.key }) { entry ->
                    when (entry) {
                        is MenuEntry.Heading -> MenuHeading(entry.text)
                        is MenuEntry.Note -> MenuNote(entry.text)
                        is MenuEntry.Divider -> HorizontalDivider(Modifier.padding(vertical = 8.dp), color = Palette.Border)
                        is MenuEntry.Choice -> MenuRow(entry.title, entry.detail, entry.selected, entry.enabled, picked) {
                            entry.pick()
                            onDismiss()
                        }
                    }
                }
            }
        }
    }
}

/** One line of a player menu: a heading, a note, a divider, or a choice. */
internal sealed interface MenuEntry {
    /** Unique in its menu, for the list's keys. */
    val key: String

    class Heading(val text: String, override val key: String) : MenuEntry

    class Note(val text: String, override val key: String) : MenuEntry

    class Divider(override val key: String) : MenuEntry

    /** A choice, current when [selected]; [pick] makes it so. */
    class Choice(
        val title: String,
        val detail: String?,
        val selected: Boolean,
        val enabled: Boolean = true,
        override val key: String,
        val pick: () -> Unit,
    ) : MenuEntry
}

/**
 * What [menu] offers: the tracks and qualities the server answered and the
 * speeds, each marked when it's the current one. The phone's panel and the
 * TV's draw the same list.
 */
@Composable
internal fun menuEntries(menu: Menu, controller: PlayerController): List<MenuEntry> = buildList {
    when (menu) {
        Menu.Audio -> {
            add(MenuEntry.Heading(stringResource(R.string.player_menu_audio), "heading"))
            if (controller.audioTracks.isEmpty()) {
                add(MenuEntry.Note(stringResource(R.string.player_audio_no_tracks), "none"))
            }
            controller.audioTracks.forEach { track ->
                add(
                    MenuEntry.Choice(
                        audioLabel(track),
                        listOfNotNull(track.format, track.layout).joinToString(" · "),
                        selected = track == controller.audio,
                        key = "audio-${track.index}",
                    ) { controller.pickAudio(track) },
                )
            }
        }
        Menu.Subtitles -> {
            add(MenuEntry.Heading(stringResource(R.string.player_menu_subtitles), "heading"))
            add(
                MenuEntry.Choice(stringResource(R.string.player_subtitles_off), null, selected = controller.subtitle == null, key = "off") {
                    controller.pickSubtitle(null)
                },
            )
            controller.subtitles.forEach { track ->
                add(
                    MenuEntry.Choice(
                        subtitleLabel(track, controller.subtitles),
                        subtitleDetail(track, burns = controller.burnsIn(track)),
                        selected = track == controller.subtitle,
                        enabled = track.delivery != null,
                        key = "subtitle-${track.id}",
                    ) { controller.pickSubtitle(track) },
                )
            }
            if (controller.subtitleError) add(MenuEntry.Note(stringResource(R.string.player_error_subtitles), "error"))
        }
        Menu.Settings -> {
            if (!controller.isLocal) {
                add(MenuEntry.Heading(stringResource(R.string.player_quality), "quality"))
                // A file over the account's bit rate limit plays only as an encode.
                if (controller.offersOriginal) {
                    add(
                        MenuEntry.Choice(
                            stringResource(R.string.player_quality_original),
                            null,
                            selected = controller.quality == ORIGINAL_QUALITY,
                            key = "quality-original",
                        ) { controller.pickQuality(ORIGINAL_QUALITY) },
                    )
                }
                controller.qualities.forEach { quality ->
                    add(
                        MenuEntry.Choice(qualityLabel(quality), null, selected = controller.quality == quality.id, key = "quality-${quality.id}") {
                            controller.pickQuality(quality.id)
                        },
                    )
                }
                add(MenuEntry.Divider("quality-end"))
            }
            add(MenuEntry.Heading(stringResource(R.string.player_speed), "speed"))
            PLAYER_SPEEDS.forEach { rate ->
                add(
                    MenuEntry.Choice(
                        if (rate == 1f) stringResource(R.string.player_speed_normal) else stringResource(R.string.player_speed_rate, rate.toString().removeSuffix(".0")),
                        null,
                        selected = controller.speed == rate,
                        key = "speed-$rate",
                    ) { controller.pickSpeed(rate) },
                )
            }
        }
    }
}

/** The speeds the menu offers. */
private val PLAYER_SPEEDS = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f)

@Composable
private fun MenuHeading(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp).semantics { heading() },
    )
}

@Composable
private fun MenuNote(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp))
}

/**
 * One choice in a menu, heard as a radio button that's checked when
 * [selected]. A picked row takes [picked], so focus can start on it.
 */
@Composable
private fun MenuRow(
    title: String,
    detail: String?,
    selected: Boolean,
    enabled: Boolean = true,
    picked: FocusRequester? = null,
    onClick: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth()
            .then(if (selected && enabled && picked != null) Modifier.focusRequester(picked) else Modifier)
            .selectable(selected, enabled = enabled, role = Role.RadioButton, onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = if (enabled) Palette.Foreground else Palette.Faint)
            if (!detail.isNullOrEmpty()) Text(detail, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
        if (selected) LucideIcon(Lucide.Check, null, size = 18.dp, tint = Palette.Accent)
    }
}

/** A track's language, plus its own title when that adds something. */
@Composable
private fun trackLabel(language: String?, title: String?, unnamed: String): String {
    val name = language?.let(::languageName)
    if (title.isNullOrBlank()) return name ?: unnamed
    if (name == null || title.contains(name, ignoreCase = true)) return title
    return stringResource(R.string.player_track_with_title, name, title)
}

@Composable
internal fun audioLabel(track: AudioTrack): String =
    trackLabel(track.language, track.title, stringResource(R.string.player_track_unnamed, track.index))

@Composable
internal fun subtitleLabel(track: SubtitleTrack, tracks: List<SubtitleTrack>): String {
    if (track.source != "embedded") return trackLabel(track.language, track.title, stringResource(R.string.player_track_unknown_language))
    val position = tracks.filter { it.source == "embedded" }.indexOf(track) + 1
    return trackLabel(track.language, track.title, stringResource(R.string.player_track_unnamed, position))
}

/**
 * A track's flags and format, and whether it is burned into the picture.
 * Left out, [burns] says so for every track the screen can't draw, as the
 * download sheet has it.
 */
@Composable
internal fun subtitleDetail(track: SubtitleTrack, burns: Boolean = track.delivery != SubtitleDelivery.WEBVTT): String = listOfNotNull(
    if (track.forced) stringResource(R.string.player_subtitles_forced) else null,
    if (track.sdh) "SDH" else null,
    track.format,
    if (track.delivery != null && burns) stringResource(R.string.player_subtitles_burned_in) else null,
).joinToString(" · ")
