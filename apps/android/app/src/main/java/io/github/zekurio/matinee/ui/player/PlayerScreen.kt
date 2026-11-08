package io.github.zekurio.matinee.ui.player

import android.app.PictureInPictureParams
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.os.Build
import android.util.Rational
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
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
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
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
import java.io.IOException
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.delay

/** Everything the player needs before it starts. */
private class PlayerData(
    val item: MediaItem,
    val audio: List<AudioTrack>,
    val subtitles: List<SubtitleTrack>,
    val options: PlaybackOptions,
)

private const val SKIP_SECONDS = 10.0
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
    val data = rememberLoader("player-$itemId") {
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

/** Landscape, without the system bars, and the screen kept on, while the player shows. */
@Composable
private fun FullScreen() {
    val context = LocalContext.current
    DisposableEffect(Unit) {
        val activity = context.activity() ?: return@DisposableEffect onDispose {}
        val window = activity.window
        val insets = WindowCompat.getInsetsController(window, window.decorView)
        val orientation = activity.requestedOrientation
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        insets.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        insets.hide(WindowInsetsCompat.Type.systemBars())
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            activity.requestedOrientation = orientation
            insets.show(WindowInsetsCompat.Type.systemBars())
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

@Composable
private fun PlayerFailure(title: String, message: String?, retry: (() -> Unit)?) {
    val nav = LocalNavigator.current
    Column(Modifier.fillMaxSize().safeDrawingPadding()) {
        RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.player_back), nav::back, Modifier.padding(8.dp), background = Color.Transparent)
        ErrorBox(title, message, retry, Modifier.weight(1f))
    }
}

/** Picture in picture follows the video: on while it plays, so leaving the app keeps it on screen. */
@Composable
private fun rememberPictureInPicture(controller: PlayerController): Boolean {
    val context = LocalContext.current
    val activity = remember { context.activity() }
    var inPip by remember { mutableStateOf(activity?.isInPictureInPictureMode == true) }
    DisposableEffect(activity) {
        val listener = Consumer<PictureInPictureModeChangedInfo> { inPip = it.isInPictureInPictureMode }
        activity?.addOnPictureInPictureModeChangedListener(listener)
        val leave = Runnable {
            if (controller.playing && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
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
    val playing = controller.playing
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
            initialQuality = PlayerPrefs(context).quality,
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
    val inPip = rememberPictureInPicture(controller)
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

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Video(controller)
        Subtitles(controller, lifted = controls && !inPip, Modifier.align(Alignment.BottomCenter))
        // Taps show and hide the controls; a double tap on either side skips.
        Box(
            Modifier.fillMaxSize().pointerInput(controller) {
                detectTapGestures(
                    onTap = {
                        controls = !controls
                        touched++
                    },
                    onDoubleTap = { offset ->
                        controller.skip(if (offset.x < size.width / 2) -SKIP_SECONDS else SKIP_SECONDS)
                        touched++
                    },
                )
            },
        )
        if (controller.loading && controller.error == null) {
            CircularProgressIndicator(Modifier.align(Alignment.Center).size(48.dp), color = Palette.Foreground)
        }
        if (!inPip) {
            AnimatedVisibility(controls || controller.ended, enter = fadeIn(), exit = fadeOut()) {
                Controls(
                    controller,
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
            if (controller.ended) UpNext(controller, Modifier.align(Alignment.BottomEnd))
        }
    }

    menu?.let { open ->
        PlayerMenu(open, controller, onDismiss = { menu = null })
    }
}

private enum class Menu { Audio, Subtitles, Settings }

@Composable
private fun Video(controller: PlayerController) {
    val presentation = rememberPresentationState(controller.player)
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        PlayerSurface(
            player = controller.player,
            modifier = Modifier.resizeWithContentScale(ContentScale.Fit, presentation.videoSizeDp),
            surfaceType = SURFACE_TYPE_SURFACE_VIEW,
        )
        if (presentation.coverSurface) Box(Modifier.fillMaxSize().background(Color.Black))
    }
}

/** The cues showing now, drawn over the video, above the controls while they show. */
@Composable
private fun Subtitles(controller: PlayerController, lifted: Boolean, modifier: Modifier) {
    val cues = controller.cues ?: return
    val shown = cues.at(controller.position)
    if (shown.isEmpty()) return
    Column(
        modifier.fillMaxWidth().padding(horizontal = 48.dp).padding(bottom = if (lifted) 120.dp else 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        shown.forEach { cue ->
            Text(
                cue.text,
                style = TextStyle(
                    color = Color.White,
                    fontSize = 20.sp,
                    lineHeight = 26.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center,
                    shadow = Shadow(Color.Black, Offset(0f, 1f), blurRadius = 6f),
                ),
                modifier = Modifier.background(Color.Black.copy(alpha = 0.45f), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun Controls(
    controller: PlayerController,
    scrub: Double?,
    onScrub: (Double) -> Unit,
    onScrubEnd: () -> Unit,
    onMenu: (Menu) -> Unit,
    onTouch: () -> Unit,
) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val item = controller.item
    val label = itemLabel(item, res)
    val code = label.code
    Box(Modifier.fillMaxSize()) {
        // Shade the top and bottom so the controls read over bright video.
        Box(
            Modifier.fillMaxWidth().height(120.dp).align(Alignment.TopCenter)
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.7f), Color.Transparent))),
        )
        Box(
            Modifier.fillMaxWidth().height(170.dp).align(Alignment.BottomCenter)
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.8f)))),
        )
        Row(
            Modifier.align(Alignment.TopStart).safeDrawingPadding().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.player_back), nav::back, background = Color.Transparent)
            Gap(8.dp)
            Column {
                Text(label.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (code != null) {
                    Text("$code · ${label.showName}", style = MaterialTheme.typography.bodySmall, color = Palette.Foreground.copy(alpha = 0.75f))
                }
            }
        }
        Row(
            Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(40.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundIconButton(Lucide.RotateCcw, stringResource(R.string.player_skip_back, 10), {
                controller.skip(-SKIP_SECONDS)
                onTouch()
            }, size = 56.dp, iconSize = 28.dp, background = Color.Transparent)
            RoundIconButton(
                if (controller.playing) Lucide.Pause else Lucide.Play,
                stringResource(if (controller.playing) R.string.player_pause else R.string.player_play),
                {
                    controller.togglePlay()
                    onTouch()
                },
                size = 76.dp,
                iconSize = 32.dp,
                background = Color.Black.copy(alpha = 0.35f),
            )
            RoundIconButton(Lucide.RotateCw, stringResource(R.string.player_skip_forward, 10), {
                controller.skip(SKIP_SECONDS)
                onTouch()
            }, size = 56.dp, iconSize = 28.dp, background = Color.Transparent)
        }
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().safeDrawingPadding().padding(horizontal = 16.dp, vertical = 8.dp)) {
            SeekBar(controller, scrub, onScrub, onScrubEnd)
            Row(verticalAlignment = Alignment.CenterVertically) {
                val duration = controller.duration
                if (duration > 0) {
                    val ends = remember(controller.position.toInt() / 30, duration, controller.speed) {
                        val left = (duration - controller.position) / controller.speed
                        DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(System.currentTimeMillis() + (left * 1000).toLong()))
                    }
                    Text(stringResource(R.string.player_ends_at, ends), style = MaterialTheme.typography.bodySmall, color = Palette.Foreground.copy(alpha = 0.8f))
                }
                Box(Modifier.weight(1f))
                RoundIconButton(Lucide.AudioLines, stringResource(R.string.player_menu_audio), { onMenu(Menu.Audio) }, background = Color.Transparent)
                Box {
                    RoundIconButton(Lucide.Captions, stringResource(R.string.player_menu_subtitles), { onMenu(Menu.Subtitles) }, background = Color.Transparent)
                    if (controller.subtitle != null) {
                        Box(Modifier.align(Alignment.BottomCenter).offset(y = (-6).dp).width(18.dp).height(2.dp).background(Palette.Accent))
                    }
                }
                RoundIconButton(Lucide.Settings, stringResource(R.string.player_menu_settings), { onMenu(Menu.Settings) }, background = Color.Transparent)
            }
        }
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
            Text(formatClock(shown), style = MaterialTheme.typography.bodySmall, modifier = Modifier.widthIn(min = 48.dp))
            SeekTrack(
                fraction = if (duration > 0) (shown / duration).toFloat() else 0f,
                buffered = if (duration > 0) (controller.buffered / duration).toFloat() else 0f,
                enabled = duration > 0,
                onScrub = { onScrub(it * duration) },
                onScrubEnd = onScrubEnd,
                modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
            )
            Text(
                "-" + formatClock((duration - shown).coerceAtLeast(0.0)),
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.End,
                modifier = Modifier.widthIn(min = 56.dp),
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
    onScrub: (Float) -> Unit,
    onScrubEnd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var width by remember { mutableIntStateOf(1) }
    val at = { x: Float -> (x / width).coerceIn(0f, 1f) }
    Box(
        modifier
            .height(32.dp)
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
        Canvas(Modifier.fillMaxWidth().height(14.dp)) {
            val y = size.height / 2
            val stroke = 4.dp.toPx()
            val played = size.width * fraction.coerceIn(0f, 1f)
            fun line(to: Float, color: Color) = drawLine(color, Offset(0f, y), Offset(to, y), stroke, StrokeCap.Round)
            line(size.width, Palette.Foreground.copy(alpha = 0.2f))
            line(size.width * buffered.coerceIn(0f, 1f), Palette.Foreground.copy(alpha = 0.35f))
            line(played, Palette.Accent)
            drawCircle(Palette.Accent, radius = 7.dp.toPx(), center = Offset(played, y))
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

/** The next episode when one ended, starting by itself after a countdown. */
@Composable
private fun UpNext(controller: PlayerController, modifier: Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val item = controller.item
    val title = item.title
    if (title?.kind != TitleKind.SHOW) return
    val next by produceState<MediaItem?>(null, item.id) {
        value = try {
            val all = api.titleItems(title.id)
            all.getOrNull(all.indexOfFirst { it.id == item.id } + 1)
        } catch (_: IOException) {
            null
        }
    }
    val upcoming = next ?: return
    var left by remember(upcoming.id) { mutableIntStateOf(UP_NEXT_SECONDS) }
    var cancelled by remember(upcoming.id) { mutableStateOf(false) }
    LaunchedEffect(upcoming.id, cancelled) {
        while (!cancelled && left > 0) {
            delay(1000)
            left--
        }
        if (!cancelled) nav.playInstead(upcoming.id)
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
            MatineeButton(onClick = { nav.playInstead(upcoming.id) }, height = 40.dp) {
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PlayerMenu(menu: Menu, controller: PlayerController, onDismiss: () -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Palette.Raised, dragHandle = null) {
        LazyColumn(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 8.dp)) {
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
                    item { MenuHeading(stringResource(R.string.player_quality)) }
                    item { MenuNote(sourceLabel(controller)) }
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
    }
}

@Composable
private fun MenuHeading(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp))
}

@Composable
private fun MenuNote(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp))
}

@Composable
private fun MenuRow(title: String, detail: String?, selected: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick).padding(horizontal = 20.dp, vertical = 12.dp),
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
private fun audioLabel(track: AudioTrack): String =
    trackLabel(track.language, track.title, stringResource(R.string.player_track_unnamed, track.index))

@Composable
private fun subtitleLabel(track: SubtitleTrack, tracks: List<SubtitleTrack>): String {
    if (track.source != "embedded") return trackLabel(track.language, track.title, stringResource(R.string.player_track_unknown_language))
    val position = tracks.filter { it.source == "embedded" }.indexOf(track) + 1
    return trackLabel(track.language, track.title, stringResource(R.string.player_track_unnamed, position))
}

@Composable
private fun subtitleDetail(track: SubtitleTrack): String = listOfNotNull(
    if (track.forced) stringResource(R.string.player_subtitles_forced) else null,
    if (track.sdh) "SDH" else null,
    track.format,
    if (track.delivery != null && !drawable(track)) stringResource(R.string.player_subtitles_burned_in) else null,
).joinToString(" · ")

/** How the video reaches the device: the file, a stream, or an encode. */
@Composable
private fun sourceLabel(controller: PlayerController): String = when (val source = controller.source) {
    Source.Direct -> stringResource(R.string.player_via_direct_play)
    is Source.Stream -> stringResource(R.string.player_via_direct_stream)
    is Source.Hls -> {
        val quality = QUALITIES.firstOrNull { it.id == source.quality }
        val text = stringResource(
            R.string.player_via_transcode,
            "${quality?.height ?: 0}p",
            stringResource(R.string.player_bitrate_mbps, (quality?.bitrate ?: 0) / 1_000_000),
        )
        if (source.subtitle != null) stringResource(R.string.player_via_burn_in, text) else text
    }
    null -> ""
}
