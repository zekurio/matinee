package io.github.zekurio.matinee.ui.player

import android.media.AudioManager
import android.os.SystemClock
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.AwaitPointerEventScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.formatClock
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.theme.Palette
import java.text.NumberFormat
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

/** What a touch on the video does: one of the swipes, or a hold that plays faster. */
internal enum class GestureKind { BRIGHTNESS, VOLUME, SEEK, HOLD }

/** The gesture under the finger now, which the notes over the video show. */
@Stable
internal class GestureState {
    /** What the finger does, or null between gestures. */
    var kind by mutableStateOf<GestureKind?>(null)

    /** The brightness or volume it set, from 0 to 1. */
    var level by mutableFloatStateOf(0f)

    /** Where a seek swipe started, in seconds. */
    var from by mutableDoubleStateOf(0.0)

    /** Where a seek swipe lands when the finger lifts. */
    var target by mutableDoubleStateOf(0.0)
}

/**
 * This window's brightness and the media volume, which swipes up and down
 * change. The brightness is the window's own, so it goes back to the
 * system's when the player closes.
 */
internal class DeviceLevels(private val activity: ComponentActivity?) {
    private val audio = activity?.getSystemService(AudioManager::class.java)

    /** Some devices, like ones that send audio out at a fixed level, have no volume to set. */
    val hasVolume: Boolean get() = audio?.isVolumeFixed == false

    fun volume(): Float {
        val audio = audio ?: return 0f
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        return if (max > 0) audio.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat() / max else 0f
    }

    /** Sets the media volume to the step nearest [level], and says where it is now. */
    fun setVolume(level: Float): Float {
        val audio = audio ?: return 0f
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        if (max <= 0) return 0f
        val step = (level * max).roundToInt().coerceIn(0, max)
        // Do Not Disturb can refuse a change; the note then shows what it stayed at.
        runCatching { audio.setStreamVolume(AudioManager.STREAM_MUSIC, step, 0) }
        return volume()
    }

    fun brightness(): Float {
        val activity = activity ?: return 0.5f
        val own = activity.window.attributes.screenBrightness
        if (own in 0f..1f) return own
        // Until a swipe sets one, the window follows the system's brightness, 0 to 255.
        val system = runCatching { Settings.System.getInt(activity.contentResolver, Settings.System.SCREEN_BRIGHTNESS) }.getOrNull()
        return system?.let { (it / 255f).coerceIn(0f, 1f) } ?: 0.5f
    }

    fun setBrightness(level: Float) {
        val window = activity?.window ?: return
        // Some screens turn their backlight off at 0, so the lowest stays just above.
        window.attributes = window.attributes.apply { screenBrightness = level.coerceIn(MIN_BRIGHTNESS, 1f) }
    }
}

private const val MIN_BRIGHTNESS = 0.01f

/** How far from the top and bottom, and from the sides, a swipe starts for the system's own gestures. */
private val EDGE_VERTICAL = 48.dp
private val EDGE_SIDE = 24.dp

/**
 * Touches on the video, as Findroid has them: up or down on the left half
 * sets the brightness, on the right half the volume, sideways seeks to
 * where the finger lifts, and a finger held still plays at [HOLD_SPEED]
 * until it lifts. Which swipe it is goes by the way the finger first
 * moves. A touch that starts where the system takes its own gestures, as at
 * the edges for back, stays the system's, and a second finger hands the
 * touch to the pinch without seeking.
 *
 * [allowed] says whether gestures work at all now, and [onStart] hears each
 * one begin. [edges] are the system's gesture insets.
 */
internal fun Modifier.videoGestures(
    state: GestureState,
    controller: PlayerController,
    prefs: PlayerPrefs,
    levels: DeviceLevels,
    edges: WindowInsets,
    layoutDirection: LayoutDirection,
    allowed: () -> Boolean,
    onStart: (GestureKind) -> Unit,
): Modifier = pointerInput(state, controller, levels, layoutDirection) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        if (!allowed() || nearEdge(down.position, edges, layoutDirection)) return@awaitEachGesture
        val holdAt = down.uptimeMillis + viewConfiguration.longPressTimeoutMillis
        var holdable = prefs.holdSpeed && controller.playing
        var moved = Offset.Zero
        var kind: GestureKind? = null
        var start = 0f
        var lifted = false
        try {
            while (true) {
                // Before it moves, the finger may become a hold by staying put.
                val event = if (kind == null && holdable) {
                    val left = holdAt - SystemClock.uptimeMillis()
                    if (left > 0) withTimeoutOrNull(left) { awaitPointerEvent() } else null
                } else {
                    awaitPointerEvent()
                }
                if (event == null) {
                    holdable = false
                    if (controller.startHold()) {
                        kind = GestureKind.HOLD
                        state.kind = kind
                        onStart(kind)
                    }
                    continue
                }
                if (event.changes.count { it.pressed } > 1) break
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                if (!change.pressed) {
                    lifted = true
                    // Lifting from a hold or a swipe isn't a tap.
                    if (kind != null) change.consume()
                    break
                }
                moved += change.positionChange()
                if (kind == null) {
                    if (moved.getDistance() < viewConfiguration.touchSlop) continue
                    val vertical = abs(moved.y) > abs(moved.x)
                    kind = when {
                        vertical && prefs.swipeLevels && down.position.x < size.width / 2f -> GestureKind.BRIGHTNESS
                        vertical && prefs.swipeLevels && levels.hasVolume -> GestureKind.VOLUME
                        !vertical && prefs.swipeSeek && seekable(controller.duration) -> GestureKind.SEEK
                        else -> null
                    }
                    // A swipe that's turned off stays the taps' and the pinch's.
                    if (kind == null) return@awaitEachGesture
                    when (kind) {
                        GestureKind.BRIGHTNESS -> start = levels.brightness()
                        GestureKind.VOLUME -> start = levels.volume()
                        GestureKind.SEEK -> {
                            state.from = controller.position
                            state.target = controller.position
                        }
                        GestureKind.HOLD -> Unit
                    }
                    state.level = start
                    state.kind = kind
                    onStart(kind)
                }
                change.consume()
                when (kind) {
                    GestureKind.BRIGHTNESS -> {
                        val level = swipeLevel(start, moved.y, size.height.toFloat())
                        levels.setBrightness(level)
                        state.level = level
                    }
                    GestureKind.VOLUME -> state.level = levels.setVolume(swipeLevel(start, moved.y, size.height.toFloat()))
                    GestureKind.SEEK -> state.target = swipeSeek(state.from, moved.x.toDp().value, controller.duration)
                    // Moving a held finger keeps the hold.
                    GestureKind.HOLD -> Unit
                }
            }
        } finally {
            when (kind) {
                GestureKind.SEEK -> if (lifted) controller.seekTo(state.target)
                GestureKind.BRIGHTNESS -> if (prefs.rememberBrightness) prefs.brightness = state.level
                GestureKind.HOLD -> controller.endHold()
                GestureKind.VOLUME, null -> Unit
            }
            if (kind != null) state.kind = null
        }
    }
}

private fun AwaitPointerEventScope.nearEdge(at: Offset, edges: WindowInsets, layoutDirection: LayoutDirection): Boolean {
    val side = EDGE_SIDE.roundToPx()
    val vertical = EDGE_VERTICAL.roundToPx()
    val left = max(edges.getLeft(this, layoutDirection), side)
    val right = max(edges.getRight(this, layoutDirection), side)
    val top = max(edges.getTop(this), vertical)
    val bottom = max(edges.getBottom(this), vertical)
    return at.x < left || at.x > size.width - right || at.y < top || at.y > size.height - bottom
}

/** How long a note stays after the finger lifts. */
private const val SWIPE_LINGER_MS = 800L

/**
 * What a gesture does, while it does and for a moment after: the
 * brightness on the left, the volume on the right, and where a seek lands
 * in the middle.
 */
@Composable
internal fun GestureNotes(state: GestureState, controller: PlayerController) {
    var shown by remember { mutableStateOf<GestureKind?>(null) }
    val kind = state.kind
    LaunchedEffect(kind) {
        if (kind != null) {
            shown = kind
        } else {
            delay(SWIPE_LINGER_MS)
            shown = null
        }
    }
    // The screen reader has its own way to set these, so the notes stay silent.
    Box(Modifier.fillMaxSize().safeDrawingPadding().clearAndSetSemantics {}) {
        AnimatedVisibility(
            shown == GestureKind.BRIGHTNESS,
            Modifier.align(Alignment.CenterStart).padding(start = 32.dp),
            enter = Motion.fadeIn,
            exit = Motion.fadeOut,
        ) {
            LevelNote(Lucide.Sun, state.level)
        }
        AnimatedVisibility(
            shown == GestureKind.VOLUME,
            Modifier.align(Alignment.CenterEnd).padding(end = 32.dp),
            enter = Motion.fadeIn,
            exit = Motion.fadeOut,
        ) {
            LevelNote(if (state.level <= 0f) Lucide.VolumeX else Lucide.Volume, state.level)
        }
        AnimatedVisibility(shown == GestureKind.SEEK, Modifier.align(Alignment.Center), enter = Motion.fadeIn, exit = Motion.fadeOut) {
            SeekNote(controller, state.from, state.target)
        }
        // Only while the finger holds, since the speed goes back as it lifts.
        AnimatedVisibility(controller.holding, Modifier.align(Alignment.TopCenter).padding(top = 16.dp), enter = Motion.fadeIn, exit = Motion.fadeOut) {
            HoldNote()
        }
    }
}

/** Says the video plays faster while the finger holds it. */
@Composable
private fun HoldNote() {
    Row(
        Modifier.clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(Lucide.FastForward, null, size = 18.dp, tint = Color.White)
        Gap(8.dp)
        Text(
            stringResource(R.string.player_speed_rate, HOLD_SPEED.toString().removeSuffix(".0")),
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
        )
    }
}

/** A brightness or volume: how much as a number, as a bar filling up, and which one. */
@Composable
private fun LevelNote(icon: Int, level: Float) {
    val percent = remember { NumberFormat.getPercentInstance() }
    Column(
        Modifier.clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 12.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(percent.format(level.toDouble()), style = MaterialTheme.typography.labelLarge, color = Color.White)
        Gap(10.dp)
        Box(
            Modifier.width(6.dp).height(120.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.25f)),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Box(Modifier.fillMaxWidth().fillMaxHeight(level.coerceIn(0f, 1f)).background(Palette.Accent))
        }
        Gap(10.dp)
        LucideIcon(icon, null, size = 20.dp, tint = Color.White)
    }
}

/** Where a seek swipe lands: its trickplay frame, how far it moves, and the time it lands at. */
@Composable
private fun SeekNote(controller: PlayerController, from: Double, to: Double) {
    val images = controller.trickplay
    Column(
        Modifier.clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (images != null && images.width > 0) {
            val width = 200.dp
            TrickplayFrame(
                controller,
                to,
                Modifier.width(width).height(width * images.height / images.width).clip(RoundedCornerShape(6.dp)).background(Color.Black),
            )
            Gap(8.dp)
        }
        val delta = to - from
        Text(
            (if (delta < 0) "-" else "+") + formatClock(abs(delta)),
            style = MaterialTheme.typography.titleLarge,
            color = Color.White,
        )
        Text(
            "${formatClock(to)} / ${formatClock(controller.duration)}",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.75f),
        )
    }
}

/** The levels of the activity the player shows in. */
@Composable
internal fun rememberDeviceLevels(): DeviceLevels {
    val context = LocalContext.current
    return remember(context) { DeviceLevels(context.activity()) }
}
