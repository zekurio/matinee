package io.github.zekurio.matinee.ui.kit

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.interaction.HoverInteraction
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.invalidateDraw
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * What a press looks like everywhere in the app: the foreground washed over
 * what's pressed, as the web's `hover:bg-foreground/10` rows and buttons
 * light up, instead of Material's ripple. MatineeTheme provides it as
 * `LocalIndication`, so every `clickable` gets it.
 *
 * A tap shorter than the fade still shows it in full before it goes, or a
 * quick tap would show nothing.
 */
object PressIndication : IndicationNodeFactory {
    /** The web's `bg-foreground/10` under a pressed menu row. */
    internal const val PRESSED = 0.1f

    /** A mouse or stylus over it, as the web's hover. */
    internal const val HOVERED = 0.06f

    override fun create(interactionSource: InteractionSource): DelegatableNode = PressNode(interactionSource)

    override fun equals(other: Any?) = other === this

    override fun hashCode() = System.identityHashCode(this)
}

private class PressNode(private val source: InteractionSource) : Modifier.Node(), DrawModifierNode {
    private val alpha = Animatable(0f)
    private var presses = 0
    private var hovers = 0
    private var settling: Job? = null

    override fun onAttach() {
        coroutineScope.launch {
            source.interactions.collect { interaction ->
                when (interaction) {
                    is PressInteraction.Press -> presses++
                    is PressInteraction.Release, is PressInteraction.Cancel -> presses = (presses - 1).coerceAtLeast(0)
                    is HoverInteraction.Enter -> hovers++
                    is HoverInteraction.Exit -> hovers = (hovers - 1).coerceAtLeast(0)
                    else -> return@collect
                }
                settle(
                    when {
                        presses > 0 -> PressIndication.PRESSED
                        hovers > 0 -> PressIndication.HOVERED
                        else -> 0f
                    },
                )
            }
        }
    }

    private fun settle(target: Float) {
        val before = settling
        val fading = target < alpha.value
        if (!fading) before?.cancel()
        settling = coroutineScope.launch {
            // Let the press finish lighting up, then fade.
            if (fading) before?.join()
            val spec = if (fading) tween<Float>(Motion.EXIT_MS, easing = Motion.ExitEasing) else tween(Motion.COLOR_MS, easing = Motion.Easing)
            alpha.animateTo(target, spec) { invalidateDraw() }
        }
    }

    override fun ContentDrawScope.draw() {
        drawContent()
        val wash = alpha.value
        if (wash > 0f) drawRect(Palette.Foreground.copy(alpha = wash))
    }
}
