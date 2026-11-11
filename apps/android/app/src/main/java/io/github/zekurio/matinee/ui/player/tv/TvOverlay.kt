package io.github.zekurio.matinee.ui.player.tv

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.semantics.Role
import io.github.zekurio.matinee.ui.tv.TvButtons
import io.github.zekurio.matinee.ui.tv.tvClickable
import io.github.zekurio.matinee.ui.tv.tvContent
import io.github.zekurio.matinee.ui.tv.tvControl
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.formatClock
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.player.Menu
import io.github.zekurio.matinee.ui.player.PlayerController
import io.github.zekurio.matinee.ui.player.TrickplayFrame
import io.github.zekurio.matinee.ui.player.seekFraction
import io.github.zekurio.matinee.ui.player.seekable
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.TvCards
import io.github.zekurio.matinee.ui.tv.TvRoundButton
import io.github.zekurio.matinee.ui.tv.TvType
import java.text.DateFormat
import java.util.Date

/** How high the overlay's block reaches from the bottom, for the subtitles to clear it. */
internal val TV_OVERLAY_HEIGHT = 190.dp

/**
 * Where focus goes in the player: the play button, the seek bar, each
 * menu's button, and the button for the next episode, in the controls'
 * row ([action]) or alone on the picture ([corner]).
 */
internal class TvTargets {
    val play = FocusRequester()
    val action = FocusRequester()
    val corner = FocusRequester()
    val seek = FocusRequester()
    val menus = Menu.entries.associateWith { FocusRequester() }
}

/** What the seek bar's keys do: step or glide toward a direction, and seek where they got to. */
internal class TvSeekKeys(val press: (direction: Int, repeat: Int, atMs: Long) -> Unit, val release: () -> Unit)

/**
 * The TV player's controls, kept low and small so the picture stays the
 * thing to look at: a scrim up from the bottom, the title at the left, one
 * wide seek bar with the time on either side, and one row of small round
 * buttons, play and the skips at the left, the menus at the right, and
 * [action], the button for the next episode, beside the menus when there
 * is one. All of it inside the overscan margins.
 */
@Composable
internal fun TvOverlay(
    controller: PlayerController,
    targets: TvTargets,
    back: Double,
    ahead: Double,
    scrub: Double?,
    keys: TvSeekKeys,
    playRests: Boolean,
    action: TvPictureAction?,
    onMenu: (Menu) -> Unit,
) {
    // Play is where focus rests, so it looks focused unless another control here has focus.
    // Focus reaches it a frame after the controls start to show and leaves as they go, and
    // following it to the letter turned the button from dark to white and back in the fade.
    var inside by remember { mutableStateOf(false) }
    var onPlay by remember { mutableStateOf(false) }
    val playLit = playRests && !(inside && !onPlay)
    Box(Modifier.fillMaxSize().onFocusChanged { inside = it.hasFocus }) {
        // About half black behind the title, two thirds behind the bar, and four fifths at the
        // bottom edge, close to Wholphin's, so the picture stays watchable with the controls up.
        Box(
            Modifier.fillMaxWidth().fillMaxHeight(0.62f).align(Alignment.BottomCenter).background(
                Brush.verticalGradient(
                    0f to Color.Transparent,
                    0.3f to Color.Black.copy(alpha = 0.5f),
                    0.55f to Color.Black.copy(alpha = 0.65f),
                    1f to Color.Black.copy(alpha = 0.8f),
                ),
            ),
        )
        // A click between the controls stays here, rather than reaching the picture and hiding them.
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().pointerInput(Unit) { detectTapGestures { } }.padding(Overscan.Padding)) {
            Heading(controller)
            Box(Modifier.height(12.dp))
            TvSeekBar(controller, scrub, targets, keys)
            Box(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                val up = Modifier.focusProperties { this.up = targets.seek }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    TvRoundButton(null, { controller.skip(-back) }, up, size = SMALL) {
                        SkipIcon(Lucide.RotateCcw, back, stringResource(R.string.player_skip_back, back.toInt()))
                    }
                    TvRoundButton(null, controller::togglePlay, up.focusRequester(targets.play).onFocusChanged { onPlay = it.isFocused }, size = PLAY, lit = playLit) {
                        val playing = controller.playing
                        LucideIcon(
                            if (playing) Lucide.Pause else Lucide.Play,
                            stringResource(if (playing) R.string.player_pause else R.string.player_play),
                            size = 22.dp,
                        )
                    }
                    TvRoundButton(null, { controller.skip(ahead) }, up, size = SMALL) {
                        SkipIcon(Lucide.RotateCw, ahead, stringResource(R.string.player_skip_forward, ahead.toInt()))
                    }
                }
                Box(Modifier.weight(1f))
                if (action != null) {
                    TvPictureButton(action, up.focusRequester(targets.action))
                    Box(Modifier.width(16.dp))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    MenuButton(Menu.Audio, Lucide.AudioLines, R.string.player_menu_audio, targets, onMenu)
                    MenuButton(Menu.Subtitles, Lucide.Captions, R.string.player_menu_subtitles, targets, onMenu, on = controller.subtitle != null)
                    MenuButton(Menu.Settings, Lucide.Settings, R.string.player_menu_settings, targets, onMenu)
                }
            }
        }
    }
}

/** A soft shadow under text on the picture, so it still reads where the scrim is light and the scene bright. */
private fun TextStyle.onPicture() = copy(shadow = Shadow(Color.Black.copy(alpha = 0.6f), Offset(0f, 2f), blurRadius = 10f))

/** How wide the player's buttons are, but play's. */
private val SMALL = 40.dp

/** How wide play is: a step up from the others, the height of the app's other buttons. */
private val PLAY = TvButtons.Height

/** A skip arrow with how far it skips in its middle, as the phone draws it. */
@Composable
private fun SkipIcon(icon: Int, seconds: Double, label: String) {
    Box(contentAlignment = Alignment.Center) {
        LucideIcon(icon, label, size = 28.dp)
        Text(
            seconds.toInt().toString(),
            style = TvType.IconNumber,
            color = LocalContentColor.current,
            modifier = Modifier.padding(top = 2.dp).clearAndSetSemantics {},
        )
    }
}

/** The title, with the episode's code and show above it, and when it ends on the right. */
@Composable
private fun Heading(controller: PlayerController) {
    val res = LocalResources.current
    val label = itemLabel(controller.item, res)
    Row(verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f)) {
            val code = label.code
            if (code != null) {
                Text(
                    "$code · ${label.showName}",
                    style = TvType.Label.onPicture(),
                    color = Palette.Foreground.copy(alpha = 0.75f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                label.title,
                style = TvType.Headline.onPicture(),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        val duration = controller.duration
        if (duration > 0) {
            val ends = remember(controller.position.toInt() / 30, duration, controller.speed) {
                val left = (duration - controller.position) / controller.speed
                DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(System.currentTimeMillis() + (left * 1000).toLong()))
            }
            Text(
                stringResource(R.string.player_ends_at, ends),
                style = TvType.Facts.onPicture(),
                color = Palette.Foreground.copy(alpha = 0.75f),
                modifier = Modifier.padding(start = 24.dp, bottom = 3.dp),
            )
        }
    }
}

/**
 * A menu's button: its icon in a circle, which opens to say the menu's
 * name while focused, as the app's other icon buttons do. Focus returns to
 * it when the menu closes.
 */
@Composable
private fun MenuButton(menu: Menu, icon: Int, name: Int, targets: TvTargets, onMenu: (Menu) -> Unit, on: Boolean = false) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val text = stringResource(name)
    val content = tvContent(focused)
    Row(
        Modifier
            .focusRequester(targets.menus.getValue(menu))
            .focusProperties { up = targets.seek }
            .height(SMALL)
            .widthIn(min = SMALL)
            .tvControl(focused, CircleShape)
            .tvClickable(interaction, role = Role.Button, onClickLabel = text) { onMenu(menu) }
            .padding(horizontal = 10.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(contentAlignment = Alignment.BottomCenter) {
            LucideIcon(icon, text, size = 20.dp, tint = content)
            // A line under the icon while subtitles are on, as on the phone.
            if (on) Box(Modifier.offset(y = 6.dp).width(14.dp).height(2.dp).clip(RoundedCornerShape(1.dp)).background(Palette.Accent))
        }
        AnimatedVisibility(
            focused,
            enter = expandHorizontally(Motion.enter()) + fadeIn(Motion.enter()),
            exit = shrinkHorizontally(Motion.exit()) + fadeOut(Motion.exit()),
        ) {
            Text(text, style = TvType.Label, color = content, maxLines = 1, modifier = Modifier.padding(start = 8.dp, end = 4.dp))
        }
    }
}

/**
 * The seek bar. Focused, it thickens, shows its dot, and the time floats
 * above the dot; left and right step by the skip lengths and glide while
 * held, with the trickplay frame above the time when the server made one,
 * and the player seeks when the key comes up. Select plays or pauses.
 */
@Composable
private fun TvSeekBar(controller: PlayerController, scrub: Double?, targets: TvTargets, keys: TvSeekKeys) {
    val duration = controller.duration.coerceAtLeast(0.0)
    val shown = scrub ?: controller.position
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val thickness by animateDpAsState(if (focused) 8.dp else 5.dp, tween(Motion.COLOR_MS), label = "seek thickness")
    val thumb by animateDpAsState(if (focused) 11.dp else 0.dp, tween(Motion.COLOR_MS), label = "seek thumb")
    val label = stringResource(R.string.a11y_player_seek)
    val state = stringResource(R.string.a11y_player_position, formatClock(shown), formatClock(duration))
    val timeStyle = TvType.Facts.onPicture()
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(formatClock(shown), style = timeStyle, modifier = Modifier.widthIn(min = 56.dp))
        BoxWithConstraints(
            Modifier
                .weight(1f)
                .padding(horizontal = 16.dp)
                .height(28.dp)
                .semantics {
                    contentDescription = label
                    stateDescription = state
                }
                .onFocusChanged { if (!it.isFocused) keys.release() }
                .onKeyEvent { event ->
                    when (event.key) {
                        Key.DirectionLeft, Key.DirectionRight -> {
                            if (!seekable(duration)) return@onKeyEvent false
                            when (event.type) {
                                KeyEventType.KeyDown -> keys.press(
                                    if (event.key == Key.DirectionLeft) -1 else 1,
                                    event.nativeKeyEvent.repeatCount,
                                    event.nativeKeyEvent.eventTime,
                                )
                                KeyEventType.KeyUp -> keys.release()
                            }
                            true
                        }
                        Key.DirectionCenter, Key.Enter, Key.NumPadEnter -> {
                            if (event.type == KeyEventType.KeyUp) {
                                if (scrub != null) keys.release() else controller.togglePlay()
                            }
                            true
                        }
                        else -> false
                    }
                }
                .focusRequester(targets.seek)
                .focusProperties { down = targets.play }
                // A click focuses the bar and seeks to where it landed.
                .pointerInput(duration) {
                    detectTapGestures { at ->
                        runCatching { targets.seek.requestFocus() }
                        if (seekable(duration)) controller.seekTo(duration * (at.x / size.width).coerceIn(0f, 1f))
                    }
                }
                .focusable(interactionSource = interaction),
            contentAlignment = Alignment.CenterStart,
        ) {
            val width = maxWidth
            val fraction = seekFraction(shown, duration)
            val loaded = seekFraction(controller.buffered, duration)
            Canvas(Modifier.fillMaxSize()) {
                val y = size.height / 2
                val stroke = thickness.toPx()
                fun line(to: Float, color: Color) = drawLine(color, Offset(0f, y), Offset(to, y), stroke, StrokeCap.Round)
                line(size.width, Color.White.copy(alpha = 0.25f))
                line(size.width * loaded, Color.White.copy(alpha = 0.45f))
                line(size.width * fraction, Palette.Accent)
                if (thumb > 0.dp) drawCircle(Palette.Foreground, radius = thumb.toPx(), center = Offset(size.width * fraction, y))
            }
            if (focused || scrub != null) {
                // Floats above the bar without taking room, centered on the dot and kept on screen.
                Box(
                    Modifier.layout { measurable, _ ->
                        val placeable = measurable.measure(Constraints())
                        val bar = width.roundToPx()
                        val x = (bar * fraction - placeable.width / 2f).toInt().coerceIn(0, (bar - placeable.width).coerceAtLeast(0))
                        layout(0, 0) { placeable.place(x, -placeable.height - 6.dp.roundToPx()) }
                    },
                ) {
                    Bubble(controller, shown, preview = scrub != null)
                }
            }
        }
        Text(
            "-${formatClock((duration - shown).coerceAtLeast(0.0))}",
            style = timeStyle,
            color = Palette.Foreground.copy(alpha = 0.75f),
            textAlign = TextAlign.End,
            modifier = Modifier.widthIn(min = 56.dp),
        )
    }
}

/** The time at the dot, with the trickplay frame above it while seeking. */
@Composable
private fun Bubble(controller: PlayerController, seconds: Double, preview: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        val images = controller.trickplay
        if (preview && images != null) {
            TrickplayFrame(
                controller,
                seconds,
                Modifier.width(240.dp).aspectRatio(images.width.toFloat() / images.height)
                    .clip(TvCards.Shape).background(Color.Black)
                    .border(2.dp, Palette.Foreground, TvCards.Shape),
            )
            Box(Modifier.height(8.dp))
        }
        Text(
            formatClock(seconds),
            style = TvType.Title,
            color = Palette.Background,
            modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Palette.Foreground).padding(horizontal = 12.dp, vertical = 4.dp),
        )
    }
}
