package io.github.zekurio.matinee.ui.player

import android.app.PictureInPictureParams
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.os.Build
import android.util.Rational
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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
import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.downloads.OfflineItem
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.formatClock
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.languageName
import io.github.zekurio.matinee.ui.settings.qualityLabel
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.theme.Theming
import java.io.File
import java.io.IOException
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/** Everything the player needs before it starts. */
private class PlayerData(
    val item: MediaItem,
    val audio: List<AudioTrack>,
    val subtitles: List<SubtitleTrack>,
    val options: PlaybackOptions,
    /** The download, which plays instead of the server's file. */
    val local: OfflineItem? = null,
)

private const val HIDE_AFTER_MS = 3500L
private const val UP_NEXT_SECONDS = 10

private fun Context.activity(): ComponentActivity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is ComponentActivity) return current
        current = current.baseContext
    }
    return null
}

@Composable
fun PlayerScreen(itemId: String, start: Double?) {
    val downloads = LocalContext.current.app.downloads
    val offline = LocalOffline.current
    val data = rememberLoader("player-$itemId") {
        // A download plays from the phone. Online, the server says where the
        // person got to, which may be past what the download remembers.
        downloads.store.done(itemId)?.let { local ->
            val fresh = if (offline) null else try { media(itemId) } catch (_: IOException) { null }
            return@rememberLoader PlayerData(fresh ?: local.item, local.audio, local.subtitles.map { it.track }, PlaybackOptions(), local)
        }
        val item = media(itemId)
        // Tracks that won't load still leave the video to play.
        val audio = try { audio(itemId) } catch (_: IOException) { emptyList() }
        val subtitles = try { subtitles(itemId).tracks } catch (_: IOException) { emptyList() }
        val options = try { playbackOptions() } catch (_: IOException) { PlaybackOptions() }
        PlayerData(item, audio, subtitles, options)
    }
    FullScreen()
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when (val state = data.state) {
            Load.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = Palette.Accent)
            is Load.Failed -> PlayerFailure(stringResource(R.string.player_load_failed), state.message, data::reload)
            is Load.Ready -> Playback(state.value, start)
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

@Composable
private fun PlayerFailure(title: String, message: String?, retry: (() -> Unit)?) {
    Column(Modifier.fillMaxSize().safeDrawingPadding()) {
        RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.player_back), LocalPlayerHost.current.close, Modifier.padding(8.dp), background = Color.Transparent)
        ErrorBox(title, message, retry, Modifier.weight(1f))
    }
}

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
                runCatching { activity?.enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).build()) }
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
                    PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).setAutoEnterEnabled(playing).build(),
                )
            }
        }
    }
    return inPip
}

@Composable
private fun Playback(data: PlayerData, start: Double?) {
    val context = LocalContext.current
    val app = context.app
    val api = LocalApi.current
    val user = LocalUser.current
    val prefs = app.player
    val preferences = user.playback ?: PlaybackPreferences()
    val controller = remember(data.item.id) {
        val choice = audioChoice(data.audio, preferences.audioLanguage, data.item.title?.originalLanguage)
        val audioLanguage = choice.preferred?.language
        PlayerController(
            context = context,
            api = api,
            http = app.session.http,
            item = data.item,
            audioTracks = data.audio,
            subtitles = data.subtitles,
            options = data.options,
            initialAudio = choice.preferred,
            initialSubtitle = defaultSubtitle(data.subtitles, audioLanguage, preferences),
            initialQuality = prefs.quality,
            prefs = prefs,
            local = data.local?.let(app.downloads.store::file),
            localSubtitles = data.local?.subtitles.orEmpty().associate { it.track.id to File(app.downloads.store.root, it.file) },
            pending = app.downloads.pending,
        )
    }
    DisposableEffect(controller) {
        val resumeAt = start ?: data.item.progress?.takeIf { !it.completed }?.positionSeconds ?: 0.0
        controller.start(resumeAt)
        onDispose {
            controller.release()
            app.viewer.changed()
        }
    }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val inPip = rememberPictureInPicture(controller, allowed = prefs.pictureInPicture)
    DisposableEffect(lifecycle, inPip) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP && !inPip) controller.player.pause()
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    var controls by remember { mutableStateOf(true) }
    var menu by remember { mutableStateOf<Menu?>(null) }
    var scrub by remember { mutableStateOf<Double?>(null) }
    var touched by remember { mutableIntStateOf(0) }
    LaunchedEffect(controls, controller.playing, menu, scrub, touched) {
        if (controls && controller.playing && menu == null && scrub == null) {
            delay(HIDE_AFTER_MS)
            controls = false
        }
    }
    val skip = prefs.skipSeconds.toDouble()
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
                    Key.MediaFastForward -> ({ controller.skip(skip) })
                    Key.MediaRewind -> ({ controller.skip(-skip) })
                    Key.DirectionLeft -> if (controls) null else ({ controller.skip(-skip) })
                    Key.DirectionRight -> if (controls) null else ({ controller.skip(skip) })
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
        Subtitles(controller, rememberSubtitleLook(prefs), lifted = controls && !inPip, Modifier.align(Alignment.BottomCenter))
        // Taps show and hide the controls; a double tap on either side skips;
        // spreading two fingers fills the screen, and pinching shows it whole.
        Box(
            Modifier.fillMaxSize().pointerInput(Unit) {
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
            }.pointerInput(controller, skip) {
                detectTapGestures(
                    onTap = {
                        controls = !controls
                        touched++
                    },
                    onDoubleTap = { offset ->
                        controller.skip(if (offset.x < size.width / 2) -skip else skip)
                        touched++
                    },
                )
            },
        )
        // Up top, clear of the play button in the middle.
        ZoomNote(zoomNote, fill, Modifier.align(Alignment.TopCenter).safeDrawingPadding().padding(top = 16.dp))
        if (controller.loading && controller.error == null) {
            CircularProgressIndicator(Modifier.align(Alignment.Center).size(48.dp), color = Palette.Foreground)
        }
        if (!inPip) {
            AnimatedVisibility(controls || controller.ended, enter = fadeIn(), exit = fadeOut()) {
                Controls(
                    controller,
                    skip = skip,
                    scrub = scrub,
                    onScrub = {
                        scrub = it
                        touched++
                    },
                    onScrubEnd = {
                        scrub?.let(controller::seekTo)
                        scrub = null
                    },
                    onMenu = { menu = it },
                    onTouch = { touched++ },
                )
            }
            controller.error?.let { message ->
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.8f))) {
                    PlayerFailure(stringResource(R.string.player_error_lost), message, controller::retry)
                }
            }
            if (controller.ended) UpNext(controller, autoplay = prefs.autoplayNext, Modifier.align(Alignment.BottomEnd))
        }
        PlayerPanel(menu, controller, onDismiss = { menu = null })
    }
}

private enum class Menu { Audio, Subtitles, Settings }

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
    AnimatedVisibility(shown, modifier, enter = fadeIn(), exit = fadeOut()) {
        Text(
            stringResource(if (fill) R.string.player_fill else R.string.player_fit),
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
            modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 18.dp, vertical = 10.dp),
        )
    }
}

/** The video, whole or filling the screen and cut at its edges. */
@Composable
private fun Video(controller: PlayerController, fill: Boolean) {
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

/** The cues showing now, drawn over the video, above the controls while they show. */
@Composable
private fun Subtitles(controller: PlayerController, look: SubtitleLook, lifted: Boolean, modifier: Modifier) {
    // Moves with the controls rather than jumping when they come and go.
    val bottom by animateDpAsState(if (lifted) 150.dp else 28.dp, label = "subtitle lift")
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
    skip: Double,
    scrub: Double?,
    onScrub: (Double) -> Unit,
    onScrubEnd: () -> Unit,
    onMenu: (Menu) -> Unit,
    onTouch: () -> Unit,
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
            Modifier.align(Alignment.TopStart).safeDrawingPadding().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.player_back), LocalPlayerHost.current.close, size = 52.dp, iconSize = 26.dp, background = Color.Transparent)
            Gap(8.dp)
            Column {
                Text(label.title, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (code != null) {
                    Text("$code · ${label.showName}", style = MaterialTheme.typography.bodyMedium, color = Palette.Foreground.copy(alpha = 0.75f))
                }
            }
        }
        Row(
            Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SkipButton(Lucide.RotateCcw, skip, stringResource(R.string.player_skip_back, skip.toInt())) {
                controller.skip(-skip)
                onTouch()
            }
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
            SkipButton(Lucide.RotateCw, skip, stringResource(R.string.player_skip_forward, skip.toInt())) {
                controller.skip(skip)
                onTouch()
            }
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().safeDrawingPadding().padding(horizontal = 20.dp, vertical = 10.dp)) {
            SeekBar(controller, scrub, onScrub, onScrubEnd)
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
                RoundIconButton(Lucide.AudioLines, stringResource(R.string.player_menu_audio), { onMenu(Menu.Audio) }, size = 52.dp, iconSize = 26.dp, background = Color.Transparent)
                Box {
                    RoundIconButton(Lucide.Captions, stringResource(R.string.player_menu_subtitles), { onMenu(Menu.Subtitles) }, size = 52.dp, iconSize = 26.dp, background = Color.Transparent)
                    if (controller.subtitle != null) {
                        Box(Modifier.align(Alignment.BottomCenter).offset(y = (-8).dp).width(20.dp).height(2.dp).clip(CircleShape).background(Palette.Accent))
                    }
                }
                RoundIconButton(Lucide.Settings, stringResource(R.string.player_menu_settings), { onMenu(Menu.Settings) }, size = 52.dp, iconSize = 26.dp, background = Color.Transparent)
            }
        }
    }
}

/** Skips back or forward, with how far in the middle of its arrow. */
@Composable
private fun SkipButton(icon: Int, seconds: Double, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(72.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = label, onClick = onClick, indication = ripple(), interactionSource = null),
        contentAlignment = Alignment.Center,
    ) {
        LucideIcon(icon, label, size = 40.dp)
        Text(
            seconds.toInt().toString(),
            style = MaterialTheme.typography.labelMedium.copy(fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}

@Composable
private fun SeekBar(controller: PlayerController, scrub: Double?, onScrub: (Double) -> Unit, onScrubEnd: () -> Unit) {
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
                fraction = if (duration > 0) (shown / duration).toFloat() else 0f,
                buffered = if (duration > 0) (controller.buffered / duration).toFloat() else 0f,
                enabled = duration > 0,
                scrubbing = scrub != null,
                onScrub = { onScrub(it * duration) },
                onScrubEnd = onScrubEnd,
                modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
            )
            Text(
                "-" + formatClock((duration - shown).coerceAtLeast(0.0)),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.End,
                modifier = Modifier.widthIn(min = 64.dp),
            )
        }
    }
}

/**
 * The seek bar as the web player draws it: a thin line, what's buffered in
 * a lighter shade, what's played in the accent, and a dot to drag.
 */
@Composable
private fun SeekTrack(
    fraction: Float,
    buffered: Float,
    enabled: Boolean,
    scrubbing: Boolean,
    onScrub: (Float) -> Unit,
    onScrubEnd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var width by remember { mutableIntStateOf(1) }
    val at = { x: Float -> (x / width).coerceIn(0f, 1f) }
    // The dot grows under the finger.
    val thumb by animateDpAsState(if (scrubbing) 11.dp else 8.dp, label = "seek thumb")
    Box(
        modifier
            .height(44.dp)
            .onSizeChanged { width = it.width.coerceAtLeast(1) }
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectTapGestures { offset ->
                    onScrub(at(offset.x))
                    onScrubEnd()
                }
            }
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectHorizontalDragGestures(
                    onDragStart = { offset -> onScrub(at(offset.x)) },
                    onDragEnd = onScrubEnd,
                    onDragCancel = onScrubEnd,
                ) { change, _ -> onScrub(at(change.position.x)) }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        Canvas(Modifier.fillMaxWidth().height(24.dp)) {
            val y = size.height / 2
            val stroke = 5.dp.toPx()
            val played = size.width * fraction.coerceIn(0f, 1f)
            fun line(to: Float, color: Color) = drawLine(color, Offset(0f, y), Offset(to, y), stroke, StrokeCap.Round)
            line(size.width, Palette.Foreground.copy(alpha = 0.2f))
            line(size.width * buffered.coerceIn(0f, 1f), Palette.Foreground.copy(alpha = 0.35f))
            line(played, Palette.Accent)
            drawCircle(Palette.Accent, radius = thumb.toPx(), center = Offset(played, y))
        }
    }
}

/** The frame at the scrubbed time, cut from the server's trickplay tiles. */
@Composable
private fun TrickplayPreview(controller: PlayerController, seconds: Double, modifier: Modifier) {
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
    val density = LocalDensity.current
    Column(modifier.padding(bottom = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.fillMaxWidth().height(with(density) { 176.dp * images.height / images.width })
                .clip(RoundedCornerShape(6.dp)).background(Color.Black).border(1.dp, Palette.Foreground.copy(alpha = 0.3f), RoundedCornerShape(6.dp)),
        ) {
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
        Gap(4.dp)
        Text(formatClock(seconds), style = MaterialTheme.typography.labelMedium)
    }
}

/**
 * The next episode when one ended, starting by itself after a countdown,
 * or waiting for Play when settings turned [autoplay] off.
 */
@Composable
private fun UpNext(controller: PlayerController, autoplay: Boolean, modifier: Modifier) {
    val api = LocalApi.current
    val host = LocalPlayerHost.current
    val res = LocalResources.current
    val item = controller.item
    val title = item.title
    if (title?.kind != TitleKind.SHOW) return
    val next by produceState<MediaItem?>(null, item.id) {
        value = try {
            val all = api.titleItems(title.id)
            // Not in the list, as a file just removed, has no next.
            val index = all.indexOfFirst { it.id == item.id }
            if (index < 0) null else all.getOrNull(index + 1)
        } catch (_: IOException) {
            null
        }
    }
    val upcoming = next ?: return
    var left by remember(upcoming.id) { mutableIntStateOf(UP_NEXT_SECONDS) }
    var cancelled by remember(upcoming.id) { mutableStateOf(!autoplay) }
    LaunchedEffect(upcoming.id, cancelled) {
        while (!cancelled && left > 0) {
            delay(1000)
            left--
        }
        if (!cancelled) host.playInstead(upcoming.id)
    }
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
                MatineeButton(onClick = { cancelled = true }, look = ButtonLook.Frosted, height = 40.dp) {
                    Text(stringResource(R.string.player_up_next_cancel))
                }
            }
        }
    }
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
    BoxWithConstraints(Modifier.fillMaxSize()) {
        AnimatedVisibility(open != null, enter = fadeIn(), exit = fadeOut()) {
            Box(
                Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)).pointerInput(Unit) {
                    detectTapGestures { onDismiss() }
                },
            )
        }
        val width = (maxWidth * 0.42f).coerceIn(300.dp, 420.dp).coerceAtMost(maxWidth)
        AnimatedVisibility(
            open != null,
            modifier = Modifier.align(Alignment.CenterEnd),
            enter = slideInHorizontally { it } + fadeIn(),
            exit = slideOutHorizontally { it } + fadeOut(),
        ) {
            val menu = last ?: return@AnimatedVisibility
            LazyColumn(
                Modifier
                    .fillMaxHeight()
                    .width(width)
                    .clip(RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp))
                    .background(Palette.Raised)
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.End + WindowInsetsSides.Vertical))
                    .padding(vertical = 12.dp),
            ) {
                menuItems(menu, controller, onDismiss)
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.menuItems(menu: Menu, controller: PlayerController, onDismiss: () -> Unit) {
    when (menu) {
        Menu.Audio -> {
            item { MenuHeading(stringResource(R.string.player_menu_audio)) }
            if (controller.audioTracks.isEmpty()) {
                item { MenuNote(stringResource(R.string.player_audio_no_tracks)) }
            }
            items(controller.audioTracks, key = { it.index }) { track ->
                MenuRow(
                    audioLabel(track),
                    listOfNotNull(track.format, track.layout).joinToString(" · "),
                    selected = track == controller.audio,
                ) {
                    controller.pickAudio(track)
                    onDismiss()
                }
            }
        }
        Menu.Subtitles -> {
            item { MenuHeading(stringResource(R.string.player_menu_subtitles)) }
            item {
                MenuRow(stringResource(R.string.player_subtitles_off), null, selected = controller.subtitle == null) {
                    controller.pickSubtitle(null)
                    onDismiss()
                }
            }
            items(controller.subtitles, key = { it.id }) { track ->
                MenuRow(
                    subtitleLabel(track, controller.subtitles),
                    subtitleDetail(track),
                    selected = track == controller.subtitle,
                    enabled = track.delivery != null,
                ) {
                    controller.pickSubtitle(track)
                    onDismiss()
                }
            }
            if (controller.subtitleError) item { MenuNote(stringResource(R.string.player_error_subtitles)) }
        }
        Menu.Settings -> {
            if (!controller.isLocal) {
                item { MenuHeading(stringResource(R.string.player_quality)) }
                item {
                    MenuRow(stringResource(R.string.player_quality_original), null, selected = controller.quality == ORIGINAL_QUALITY) {
                        controller.pickQuality(ORIGINAL_QUALITY)
                        onDismiss()
                    }
                }
                items(QUALITIES, key = { it.id }) { quality ->
                    MenuRow(qualityLabel(quality.id), null, selected = controller.quality == quality.id) {
                        controller.pickQuality(quality.id)
                        onDismiss()
                    }
                }
                item { HorizontalDivider(Modifier.padding(vertical = 8.dp), color = Palette.Border) }
            }
            item { MenuHeading(stringResource(R.string.player_speed)) }
            items(listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f)) { rate ->
                MenuRow(
                    if (rate == 1f) stringResource(R.string.player_speed_normal) else stringResource(R.string.player_speed_rate, rate.toString().removeSuffix(".0")),
                    null,
                    selected = controller.speed == rate,
                ) {
                    controller.pickSpeed(rate)
                    onDismiss()
                }
            }
        }
    }
}

@Composable
private fun MenuHeading(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
}

@Composable
private fun MenuNote(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp))
}

@Composable
private fun MenuRow(title: String, detail: String?, selected: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick).padding(horizontal = 20.dp, vertical = 14.dp),
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

@Composable
internal fun subtitleDetail(track: SubtitleTrack): String = listOfNotNull(
    if (track.forced) stringResource(R.string.player_subtitles_forced) else null,
    if (track.sdh) "SDH" else null,
    track.format,
    if (track.delivery != null && !drawable(track)) stringResource(R.string.player_subtitles_burned_in) else null,
).joinToString(" · ")
