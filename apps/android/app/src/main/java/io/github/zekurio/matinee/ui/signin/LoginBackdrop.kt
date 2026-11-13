package io.github.zekurio.matinee.ui.signin

import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.LoginBackdrop
import io.github.zekurio.matinee.api.LoginBackdropKind
import io.github.zekurio.matinee.api.LoginBackdropTile
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.ui.theme.Palette
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.ceil
import kotlin.random.Random

/*
 * The wall of artwork behind the sign-in screens, as the web's login page
 * has it (apps/web/src/components/login-backdrop.tsx): rows of posters and
 * thumbs that drift in turns left and right, the wall sloped, blurred, and
 * faded into the background. Each row is its own shuffle of the tiles, so
 * a mixed wall falls differently in every row. The server serves these
 * images without a session while the backdrop is on.
 */

private const val SLOPE_DEGREES = -12f

/** How much larger than the screen the wall is, so its edges stay off it once sloped. */
private const val OVERSIZE = 1.7f

/** Seconds a row takes to drift one copy's width, per row. */
private val DURATIONS = intArrayOf(96, 120, 104, 132, 100, 124, 112, 140, 108, 128)

/** How wide one copy of a row is at least, in row heights, so it loops cleanly. */
private const val MIN_ROW_WIDTH = 30f

/** Dark text loses contrast against artwork faster, so a light theme shows the wall weaker. */
private const val LIGHT_STRENGTH = 0.35f

private val GAP = 12.dp

private fun aspectOf(tile: LoginBackdropTile) = if (tile.kind == LoginBackdropKind.POSTER) 2f / 3f else 16f / 9f

/** One copy of each row: its own shuffle, repeated until it's wide enough. */
private fun buildRows(tiles: List<LoginBackdropTile>, count: Int): List<List<LoginBackdropTile>> =
    List(count) { row ->
        val order = tiles.shuffled(Random(row + 1))
        val copy = mutableListOf<LoginBackdropTile>()
        var width = 0f
        var i = 0
        while (width < MIN_ROW_WIDTH && order.isNotEmpty()) {
            val tile = order[i % order.size]
            copy += tile
            width += aspectOf(tile)
            i++
        }
        copy
    }

/**
 * The backdrop [settings] describe, from [api]'s server, filling the
 * screen behind what follows it. Nothing while it's off, or when the
 * server has nothing to show or can't be asked.
 */
@Composable
fun LoginBackdropWall(api: MatineeApi, settings: LoginBackdrop, modifier: Modifier = Modifier) {
    val tiles by produceState(emptyList<LoginBackdropTile>(), api, settings.enabled) {
        if (!settings.enabled) return@produceState
        value = try {
            api.auth.loginBackdrop().tiles
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // An older server, or one that went away: the plain background.
            emptyList()
        }
    }
    if (!settings.enabled || tiles.isEmpty()) return

    val context = LocalContext.current
    // Animations off in the system settings stop the drift, as reduced motion does on the web.
    val still = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val strength = (1f - settings.fade / 100f) * if (Palette.isDark) 1f else LIGHT_STRENGTH

    BoxWithConstraints(modifier.fillMaxSize().background(Palette.Background).clipToBounds(), contentAlignment = Alignment.Center) {
        val rowHeight = (maxHeight * 0.16f).coerceIn(88.dp, 200.dp)
        val count = ceil((maxHeight * OVERSIZE / (rowHeight + GAP)).toDouble()).toInt() + 1
        val rows = remember(tiles, count) { buildRows(tiles, count) }
        Column(
            Modifier
                .requiredSize(maxWidth * OVERSIZE, maxHeight * OVERSIZE)
                .graphicsLayer {
                    rotationZ = SLOPE_DEGREES
                    alpha = strength
                }
                .then(if (settings.blur > 0) Modifier.blur(settings.blur.dp) else Modifier),
            verticalArrangement = Arrangement.spacedBy(GAP, Alignment.CenterVertically),
        ) {
            rows.forEachIndexed { index, row ->
                WallRow(api, row, rowHeight, DURATIONS[index % DURATIONS.size], reverse = index % 2 == 1, still = still)
            }
        }
    }
}

@Composable
private fun WallRow(api: MatineeApi, tiles: List<LoginBackdropTile>, height: Dp, seconds: Int, reverse: Boolean, still: Boolean) {
    val density = LocalDensity.current
    // A copy's width, so moving by it lands on the same picture.
    val copyWidth = with(density) { tiles.sumOf { (height * aspectOf(it) + GAP).toPx().toDouble() }.toFloat() }
    val drift = if (still) {
        null
    } else {
        rememberInfiniteTransition(label = "login backdrop").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(seconds * 1000, easing = LinearEasing), RepeatMode.Restart),
            label = "drift",
        )
    }
    val shape = RoundedCornerShape(8.dp)
    Box(Modifier.height(height).clipToBounds()) {
        Row(
            Modifier
                .fillMaxHeight()
                .wrapContentWidth(Alignment.Start, unbounded = true)
                .graphicsLayer {
                    val progress = drift?.value ?: 0f
                    translationX = -copyWidth * if (reverse) 1f - progress else progress
                },
            horizontalArrangement = Arrangement.spacedBy(GAP),
        ) {
            // Two copies, so the row never runs out while it moves by one.
            (tiles + tiles).forEach { tile ->
                AsyncImage(
                    model = api.paths.artwork(tile.artwork.id, ArtworkSize.Small),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxHeight()
                        .aspectRatio(aspectOf(tile))
                        .clip(shape)
                        .background(Palette.Foreground.copy(alpha = 0.05f)),
                )
            }
        }
    }
}
